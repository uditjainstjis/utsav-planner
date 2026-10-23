import { Hono, type MiddlewareHandler } from 'hono';
import { personalise, type Env } from './lib/ai';
import { harden } from './lib/headers';
import { buildPlan, planIcs, todayIso } from './lib/plan';
import { InputError, LIMITS, validatePlanRequest } from './lib/validate';

/**
 * Utsav Planner — Worker entry point.
 *
 * Two API routes, deliberately split by cost:
 *
 *   POST /api/plan         budget, timeline, vendor checklist, calendar export.
 *                          Pure computation; answers in milliseconds.
 *   POST /api/personalise  the generative step: ideas, vendor questions and
 *                          budget notes from Workers AI, validated, cached,
 *                          with a deterministic fallback.
 *   GET  /api/health       liveness, build identity only.
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
 * Gate for both POST routes: content type, origin, rate limit — in that order.
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

/** Liveness probe. Reports build identity and public limits only. */
app.get('/api/health', (c) => c.json({ status: 'ok', service: 'utsav-planner', limits: LIMITS }));

/** Parse and validate a request body into a plan, or a 400 with the field named. */
async function readPlan(c: {
  req: { json(): Promise<unknown> };
}): Promise<{ ok: true; plan: ReturnType<typeof buildPlan> } | { ok: false; res: Response }> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return {
      ok: false,
      res: Response.json(
        { error: 'Expected a JSON body.', code: 'bad_json', field: 'body' },
        { status: 400 },
      ),
    };
  }
  try {
    return { ok: true, plan: buildPlan(validatePlanRequest(body, todayIso()), todayIso()) };
  } catch (err) {
    if (err instanceof InputError) {
      return {
        ok: false,
        res: Response.json(
          { error: err.message, code: err.code, field: err.field },
          { status: 400 },
        ),
      };
    }
    throw err;
  }
}

app.post('/api/plan', guardApi, async (c) => {
  const read = await readPlan(c);
  if (!read.ok) return read.res;
  const plan = read.plan;
  return c.json({ plan, ics: planIcs(plan, new Date().toISOString()) });
});

app.post('/api/personalise', guardApi, async (c) => {
  const read = await readPlan(c);
  if (!read.ok) return read.res;
  // Rebuilt server-side from the validated request rather than trusting a
  // plan object the client sends back; the client never gets to tell the
  // model what the numbers are.
  return c.json(await personalise(c.env, read.plan));
});

app.all('/api/*', (c) => c.json({ error: 'Not found', code: 'not_found' }, 404));

/** Everything else is the static single-page app. */
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
