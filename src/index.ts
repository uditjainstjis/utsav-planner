import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { personalise, type Env } from './lib/ai';
import { harden } from './lib/headers';
import { LIMITS, todayIso } from './shared/constants';
import { buildPlan, planIcs } from './lib/plan';
import { applyRefinement } from './lib/refine';
import type { Plan } from './lib/types';
import { InputError, isRecord, validatePlanRequest } from './lib/validate';

/**
 * Utsav Planner — Worker entry point.
 *
 * The API, split by cost:
 *
 *   POST /api/plan         budget, timeline, vendor checklist, calendar export.
 *                          Pure computation; answers in milliseconds.
 *   POST /api/personalise  the generative step: ideas, vendor questions and
 *                          budget notes from Workers AI, validated, cached,
 *                          with a deterministic fallback.
 *   POST /api/refine       the conversational step: the user says what to
 *                          change; numbers are parsed and recomputed in code,
 *                          the wording is handed to the model on the next
 *                          personalise call.
 *   GET  /api/health       liveness: the service name and the public request limits.
 *
 * The client calls the first and renders it, then calls the second and fills
 * in. A user never waits on a model to see their numbers, and a model outage
 * degrades one section rather than the page.
 */

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  await next();
  c.res = harden(c.res);
  // API responses are personal (a budget, a date, free-text wishes). Nothing
  // in them should sit in an intermediary or browser cache.
  if (c.req.path.startsWith('/api/')) {
    c.res.headers.set('cache-control', 'no-store, no-cache, must-revalidate, private');
  }
});

/**
 * Gate for every POST route: content type, origin, rate limit — in that order.
 *
 * Requiring `application/json` is the CSRF control: a cross-origin fetch can
 * send `text/plain` without a preflight, but cannot claim JSON without one,
 * and there is no CORS policy here for a preflight to succeed against.
 * `Sec-Fetch-Site` is set by browsers and cannot be forged by page script; it
 * is absent for curl, which is fine — this service holds no credential, so a
 * direct call carries no ambient authority to abuse. The rate limit runs last
 * so a rejected cross-site request never spends the visitor's budget.
 */
const guardApi: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const contentType = (c.req.header('content-type') ?? '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    return c.json(
      { error: 'Send this request as application/json.', code: 'unsupported_media_type' },
      415,
    );
  }
  const site = c.req.header('sec-fetch-site');
  if (site !== undefined && site !== 'same-origin' && site !== 'none') {
    return c.json({ error: 'Cross-site requests are not accepted.', code: 'cross_origin' }, 403);
  }
  if (c.env.RATE_LIMITER) {
    const ip = c.req.header('cf-connecting-ip') ?? 'local';
    const { success } = await c.env.RATE_LIMITER.limit({ key: ip });
    if (!success) {
      return c.json(
        { error: 'Too many requests. Please wait a minute and try again.', code: 'rate_limited' },
        429,
      );
    }
  }
  await next();
  return undefined;
};

/** Liveness probe. Reports the service name and the public request limits only. */
app.get('/api/health', (c) => c.json({ status: 'ok', service: 'utsav-planner', limits: LIMITS }));

/** The request body as JSON. A body that is not JSON is the client's error, named as such. */
async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new InputError('Expected a JSON body.', 'bad_json', 'body');
  }
}

/** Validate a request body into a plan. `today` is read once, so both steps agree on it. */
async function readPlan(c: Context): Promise<Plan> {
  const today = todayIso();
  return buildPlan(validatePlanRequest(await readJson(c), today), today);
}

app.post('/api/plan', guardApi, async (c) => {
  const plan = await readPlan(c);
  return c.json({ plan, ics: planIcs(plan, new Date().toISOString()) });
});

app.post('/api/personalise', guardApi, async (c) => {
  // Rebuilt server-side from the validated request rather than trusting a
  // plan object the client sends back; the client never gets to tell the
  // model what the numbers are.
  return c.json(await personalise(c.env, await readPlan(c)));
});

/**
 * Refine a plan in plain words.
 *
 * Returns the recomputed deterministic plan, the exact changes that were
 * applied (so a misread number is visible, never silent), and the normalised
 * request the client should send to `/api/personalise` for new ideas.
 */
app.post('/api/refine', guardApi, async (c) => {
  const today = todayIso();
  const body = await readJson(c);
  const original = validatePlanRequest(body, today);
  const refine = isRecord(body) ? body.refine : undefined;
  const { request, changes } = applyRefinement(original, refine, today);
  const plan = buildPlan(request, today);
  return c.json({ request, changes, plan, ics: planIcs(plan, new Date().toISOString()) });
});

/**
 * Every route reports bad input the same way: a 400 naming the field, so the
 * client can put the message next to the control that failed. Anything else
 * is a fault, answered as Hono's default handler would.
 */
app.onError((err, c) => {
  if (err instanceof InputError) {
    return c.json({ error: err.message, code: err.code, field: err.field }, 400);
  }
  // eslint-disable-next-line no-console -- the one place a fault is logged, as Hono's default does
  console.error(err);
  return c.text('Internal Server Error', 500);
});

app.all('/api/*', (c) => c.json({ error: 'Not found', code: 'not_found' }, 404));

/** Everything else is the static single-page app. */
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
