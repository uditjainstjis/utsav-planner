import { cacheGet, cachePut, contentKey } from '../cache';
import { PROMPT_VERSION } from '../../prompts/plan';
import type { Personalisation, Plan } from '../types';
import { isRecord } from '../validate';
import { askAll, mergeAnswers, MODEL_TIMEOUT_MS, MODELS, type TextGenerator } from './ask';
import { coercePersonalisation, withReplySections } from './coerce';

/**
 * The one generative step: personalising a plan.
 *
 * The model is reached through a {@link TextGenerator} the caller supplies:
 * in production the Workers AI binding (src/lib/ai/workers-ai.ts), so no API
 * key exists in this repository, in CI, or in the deployed bundle. A part no
 * model answers usably is filled from deterministic guidance, labelled as
 * such section by section, and the plan ships complete.
 */

/**
 * A cached personalisation: the merged model reply, and the model that wrote
 * its ideas, which may be the fallback. An entry of any other shape is a miss.
 */
interface CachedReply {
  model: string;
  reply: Record<string, unknown>;
}

function asCachedReply(v: unknown): CachedReply | null {
  return isRecord(v) && typeof v.model === 'string' && isRecord(v.reply)
    ? { model: v.model, reply: v.reply }
    : null;
}

/**
 * The inputs that fully determine a personalisation, for the cache key: every
 * request field and the lead time the prompt states (src/prompts/plan.ts), the
 * prompt version, and both models, since either may write a cached answer.
 * Budget lines, vendors and the rush flag follow from these.
 */
function cacheParts(plan: Plan): string[] {
  const r = plan.request;
  return [
    r.eventType,
    r.eventDate,
    String(plan.timeline.leadDays),
    String(r.guests),
    String(r.budget),
    r.city ?? '',
    r.occasion ?? '',
    r.preferences ?? '',
    PROMPT_VERSION,
    ...MODELS,
  ];
}

/**
 * Personalise a plan: cache, then four concurrent model asks (each with its
 * own fallback model), then deterministic guidance for any section no model
 * answered usably. Never throws, and always returns ideas.
 *
 * @param generator the model host, e.g. `workersAi(env.AI)`
 * @param ctx the request's execution context: a complete answer is written to
 *   the cache through its `waitUntil`, after the response has gone.
 */
export async function personalise(
  generator: TextGenerator,
  plan: Plan,
  ctx: Pick<ExecutionContext, 'waitUntil'>,
  options: { timeoutMs?: number } = {},
): Promise<Personalisation> {
  const key = await contentKey(cacheParts(plan));
  const hit = asCachedReply(await cacheGet(key));
  const cached = hit && coercePersonalisation(hit.reply, plan, { model: hit.model, cached: true });
  if (cached) return cached;

  const answers = await askAll(generator, plan, options.timeoutMs ?? MODEL_TIMEOUT_MS);
  const { reply, model } = mergeAnswers(answers);
  const result = model ? coercePersonalisation(reply, plan, { model, cached: false }) : null;
  // Ideas are the part that makes a personalisation worth the name; without
  // them it ships generic ideas, keeping whichever model-written questions and
  // notes pass the same checks.
  if (!model || !result) return withReplySections(reply, plan);
  // Only a complete model answer is durable: every part answered and every
  // section the model's. A fallback must be retried.
  const complete =
    Object.values(answers).every((a) => a !== null) &&
    Object.values(result.sources).every((s) => s === 'model');
  if (complete) {
    const entry: CachedReply = { model, reply };
    ctx.waitUntil(cachePut(key, entry));
  }
  return result;
}
