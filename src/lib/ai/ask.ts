import type { Env } from '../../env';
import { makeNonce } from '../guard';
import { MAX_TOKENS, PROMPT_BUILDERS, SCHEMAS, SYSTEM_PROMPT, type Part } from '../../prompts/plan';
import type { Plan } from '../types';
import { extractJson } from './reply';

/**
 * Asking Workers AI for the four parts of a personalisation — two halves of
 * ideas, vendor questions, budget notes — concurrently, each with its own
 * small schema, because schema-constrained decoding is paid for per output
 * token: four short replies in parallel finish in the time of the longest,
 * not the sum. Each part tries the primary model, then the fallback model.
 *
 * Model choice was measured, not assumed — see docs/EVALUATION.md.
 */

/** Tried in this order for every part: the primary model, then the fallback. */
export const MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
] as const;
type Model = (typeof MODELS)[number];

/**
 * Upper bound on one model call. Measured p95 for a part is well under 15 s
 * (docs/EVALUATION.md); a call still running after this is treated as failed
 * so the fallback model — and then deterministic guidance — can answer. The
 * user never waits on a hung binding.
 */
export const MODEL_TIMEOUT_MS = 20_000;

/** The key each part's reply must carry. */
const PART_KEYS: Record<Part, string> = {
  ideasA: 'ideas',
  ideasB: 'ideas',
  vendors: 'vendorQuestions',
  notes: 'budgetNotes',
};

/** One part's reply object, and the model that wrote it. */
interface PartResult {
  obj: Record<string, unknown>;
  model: string;
}

export type Answers = Record<Part, PartResult | null>;

async function callModel(env: Env, model: Model, part: Part, plan: Plan, nonce: string) {
  return env.AI.run(model, {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: PROMPT_BUILDERS[part](plan, nonce) },
    ],
    response_format: { type: 'json_schema', json_schema: SCHEMAS[part] },
    max_tokens: MAX_TOKENS[part],
    // Some variety is wanted — two users with the same brief should not get
    // identical ideas — but not so much that the schema or the facts drift.
    temperature: 0.5,
  });
}

/** Reject after `ms` so a hung call cannot hold a response open. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`model call exceeded ${ms}ms`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/** One part: primary model, then fallback model, else null. Never throws. */
async function askPart(
  env: Env,
  part: Part,
  plan: Plan,
  nonce: string,
  timeoutMs: number,
): Promise<PartResult | null> {
  for (const model of MODELS) {
    try {
      const obj = extractJson(
        await withTimeout(callModel(env, model, part, plan, nonce), timeoutMs),
      );
      if (obj && PART_KEYS[part] in obj) return { obj, model };
    } catch {
      /* try the next model */
    }
  }
  return null;
}

/** All four parts at once, under one nonce. */
export async function askAll(env: Env, plan: Plan, timeoutMs: number): Promise<Answers> {
  const nonce = makeNonce();
  const ask = (part: Part): Promise<PartResult | null> =>
    askPart(env, part, plan, nonce, timeoutMs);
  const [ideasA, ideasB, vendors, notes] = await Promise.all([
    ask('ideasA'),
    ask('ideasB'),
    ask('vendors'),
    ask('notes'),
  ]);
  return { ideasA, ideasB, vendors, notes };
}

/** Combine the two idea halves; the summary comes from whichever answered first in order. */
function mergeIdeas(a: PartResult | null, b: PartResult | null): PartResult | null {
  const first = a ?? b;
  if (!first) return null;
  const list = (r: PartResult | null): unknown[] => {
    const ideas = r?.obj.ideas;
    return Array.isArray(ideas) ? ideas : [];
  };
  return {
    model: first.model,
    obj: { summary: a?.obj.summary ?? b?.obj.summary, ideas: [...list(a), ...list(b)] },
  };
}

/**
 * The answers as one raw reply, unchecked, and the model that wrote its ideas
 * (null when neither idea half answered). A section no model answered is
 * absent; what is there is checked later, by coercePersonalisation and
 * withReplySections.
 */
export function mergeAnswers(answers: Answers): {
  reply: Record<string, unknown>;
  model: string | null;
} {
  // Either half alone is still a personalisation; both together is the aim.
  const ideas = mergeIdeas(answers.ideasA, answers.ideasB);
  const reply = {
    summary: ideas?.obj.summary,
    ideas: ideas?.obj.ideas,
    vendorQuestions: answers.vendors?.obj.vendorQuestions,
    budgetNotes: answers.notes?.obj.budgetNotes,
  };
  return { reply, model: ideas?.model ?? null };
}
