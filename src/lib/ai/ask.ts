import { makeNonce } from '../guard';
import { MAX_TOKENS, PROMPT_BUILDERS, SCHEMAS, SYSTEM_PROMPT, type Part } from '../../prompts/plan';
import type { Plan } from '../types';
import { extractJson } from './reply';

/**
 * Asking a model for the four parts of a personalisation — two halves of
 * ideas, vendor questions, budget notes — concurrently, each with its own
 * small schema, because schema-constrained decoding is paid for per output
 * token: four short replies in parallel finish in the time of the longest,
 * not the sum. Each part tries the primary model, then the fallback model.
 *
 * This module is policy: which models, in what order, under what timeout,
 * and what counts as an answer. It reaches a model only through the
 * {@link TextGenerator} it declares, so it names no binding and no SDK; the
 * Workers AI implementation is src/lib/ai/workers-ai.ts, chosen in
 * src/index.ts.
 *
 * Model choice was measured, not assumed — see docs/EVALUATION.md.
 */

/** Tried in this order for every part: the primary model, then the fallback. */
export const MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
] as const;
/** A model this module may ask: one of {@link MODELS}. */
export type Model = (typeof MODELS)[number];

/** One schema-constrained generation: everything a model host needs to answer one part. */
export interface Generation {
  model: Model;
  /** The standing instructions, the same for every part. */
  system: string;
  /** The part's own prompt: the plan's facts and what to produce. */
  prompt: string;
  /** The JSON schema the reply must match. */
  schema: object;
  maxTokens: number;
  temperature: number;
}

/**
 * The one dependency personalisation has on a model host, declared here by
 * the code that needs it. Single responsibility: run one {@link Generation}
 * and resolve to the host's raw reply, unchecked ({@link extractJson} reads
 * it). It may reject, and should stop work when `signal` aborts; timeouts,
 * fallback and validation stay here, so every implementation — the Workers AI
 * adapter in production, plain fakes in the tests — is substitutable.
 */
export interface TextGenerator {
  generate(generation: Generation, signal: AbortSignal): Promise<unknown>;
}

/**
 * Upper bound on one model call. Both models answered a part in 7–11 s when
 * measured (docs/EVALUATION.md); a call still running after this is aborted
 * and treated as failed, so the fallback model — and then deterministic
 * guidance — can answer. A part therefore settles within twice this: the
 * user never waits on a hung binding.
 */
export const MODEL_TIMEOUT_MS = 15_000;

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

type Answers = Record<Part, PartResult | null>;

/** One model call: which model, which part of which plan, under which nonce and signal. */
interface ModelCall {
  model: Model;
  part: Part;
  plan: Plan;
  nonce: string;
  signal: AbortSignal;
}

/** The generator's raw reply, unchecked: extractJson reads it. */
async function callModel(
  generator: TextGenerator,
  { model, part, plan, nonce, signal }: ModelCall,
): Promise<unknown> {
  return generator.generate(
    {
      model,
      system: SYSTEM_PROMPT,
      prompt: PROMPT_BUILDERS[part](plan, nonce),
      schema: SCHEMAS[part],
      maxTokens: MAX_TOKENS[part],
      // Some variety is wanted — two users with the same brief should not get
      // identical ideas — but not so much that the schema or the facts drift.
      temperature: 0.5,
    },
    signal,
  );
}

/**
 * Run `call` with a signal that aborts after `ms`, and reject at that moment.
 * The binding takes the signal (`AiOptions.signal`), so a call given up on is
 * cancelled rather than left running; the race still rejects on time for a
 * call that does not honour it.
 */
async function withTimeout<T>(call: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new DOMException(`model call exceeded ${ms}ms`, 'TimeoutError');
      controller.abort(err);
      reject(err);
    }, ms);
  });
  try {
    return await Promise.race([call(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One structured line per failed model call, for Workers observability: which
 * model and part, what kind of failure (`TimeoutError`, the binding's error
 * name, or `unusable_reply`), and how long it took.
 */
function logFailure(model: Model, part: Part, kind: string, started: number): void {
  // eslint-disable-next-line no-console -- Workers Logs captures and indexes console output
  console.warn({ event: 'model_call_failed', model, part, kind, elapsedMs: Date.now() - started });
}

/** One part: primary model, then fallback model, else null. Never throws. */
async function askPart(
  generator: TextGenerator,
  part: Part,
  plan: Plan,
  nonce: string,
  timeoutMs: number,
): Promise<PartResult | null> {
  for (const model of MODELS) {
    const started = Date.now();
    try {
      const obj = extractJson(
        await withTimeout(
          (signal) => callModel(generator, { model, part, plan, nonce, signal }),
          timeoutMs,
        ),
      );
      if (obj && PART_KEYS[part] in obj) return { obj, model };
      logFailure(model, part, 'unusable_reply', started);
    } catch (err) {
      // Then try the next model.
      logFailure(model, part, err instanceof Error ? err.name : typeof err, started);
    }
  }
  return null;
}

/** All four parts at once, under one nonce. */
export async function askAll(
  generator: TextGenerator,
  plan: Plan,
  timeoutMs: number,
): Promise<Answers> {
  const nonce = makeNonce();
  const ask = (part: Part): Promise<PartResult | null> =>
    askPart(generator, part, plan, nonce, timeoutMs);
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
