import { cacheGet, cachePut, contentKey } from './cache';
import { fallbackPersonalisation } from './fallback';
import { makeNonce } from './guard';
import {
  MAX_TOKENS,
  PROMPT_BUILDERS,
  PROMPT_VERSION,
  SCHEMAS,
  SYSTEM_PROMPT,
  type Part,
} from '../prompts/plan';
import { COST_TIERS, IDEA_CATEGORIES, type Idea, type Personalisation, type Plan } from './types';
import { isRecord } from './validate';

/**
 * Workers AI client for the one generative step: personalising a plan.
 *
 * The model is reached through a Cloudflare binding, so no API key exists in
 * this repository, in CI, or in the deployed bundle. Its reply is treated as
 * untrusted input: parsed defensively, every field bounded, every id checked
 * against the plan it was asked about, and anything outside the schema dropped.
 *
 * The four parts of a personalisation — two halves of ideas, vendor questions,
 * budget notes — are requested concurrently, each with its own small schema,
 * because schema-constrained decoding is paid for per output token: four short
 * replies in parallel finish in the time of the longest, not the sum. Each
 * part tries the primary model, then the fallback model; a part that still
 * fails is filled from deterministic guidance and the plan ships complete.
 *
 * Model choice was measured, not assumed — see docs/EVALUATION.md.
 */

export const PRIMARY_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const FALLBACK_MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct';
type Model = typeof PRIMARY_MODEL | typeof FALLBACK_MODEL;
/** Tried in this order for every part. */
const MODELS: readonly Model[] = [PRIMARY_MODEL, FALLBACK_MODEL];

/** Bindings this Worker requires. `AI` is the only external dependency. */
export interface Env {
  AI: Ai;
  ASSETS: Fetcher;
  RATE_LIMITER?: { limit(o: { key: string }): Promise<{ success: boolean }> };
}

/**
 * Upper bound on one model call. Measured p95 for a part is well under 15 s
 * (docs/EVALUATION.md); a call still running after this is treated as failed
 * so the fallback model — and then deterministic guidance — can answer. The
 * user never waits on a hung binding.
 */
const MODEL_TIMEOUT_MS = 20_000;

/** Bounds on what a model reply may contribute. Request limits live in validate.ts. */
export const REPLY_LIMITS = {
  ideas: 8,
  questionsPerVendor: 3,
  summary: 600,
  ideaTitle: 90,
  ideaDetail: 320,
  question: 200,
  note: 240,
} as const;

const PART_KEYS: Record<Part, string> = {
  ideasA: 'ideas',
  ideasB: 'ideas',
  vendors: 'vendorQuestions',
  notes: 'budgetNotes',
};

/** Keys a reply part carries. An object with none of them is not a reply. */
const REPLY_KEYS = ['ideas', 'summary', 'vendorQuestions', 'budgetNotes'];

/**
 * Extract a JSON object from a model reply.
 *
 * Schema-constrained decoding is requested, but a model under load can still
 * wrap its output in prose or a fenced code block. Recovering here costs
 * nothing and avoids discarding an otherwise good answer.
 */
export function extractJson(raw: unknown): Record<string, unknown> | null {
  if (isRecord(raw)) return fromEnvelope(raw);
  return typeof raw === 'string' ? parseObject(stripFences(raw)) : null;
}

/**
 * Workers AI wraps replies two ways depending on the model: a `response`
 * field, or an OpenAI-style `choices[0].message.content`. Some models return
 * both with `response` empty, so the choices are tried first.
 */
function fromEnvelope(obj: Record<string, unknown>): Record<string, unknown> | null {
  const inner = extractJson(firstChoice(obj.choices));
  if (inner) return inner;
  if ('response' in obj) return extractJson(obj.response);
  return REPLY_KEYS.some((k) => k in obj) ? obj : null;
}

/** `choices[0].message.content`, else `choices[0].text`. */
function firstChoice(choices: unknown): unknown {
  const first: unknown = Array.isArray(choices) ? choices[0] : undefined;
  if (!isRecord(first)) return undefined;
  return (isRecord(first.message) ? first.message.content : undefined) ?? first.text;
}

function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
}

/** An object parsed from the text, or from its outermost braces when prose surrounds it. */
function parseObject(text: string): Record<string, unknown> | null {
  const whole = tryParse(text);
  if (whole !== undefined) return isRecord(whole) ? whole : null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  const inner = tryParse(text.slice(start, end + 1));
  return isRecord(inner) ? inner : null;
}

/** JSON.parse, or undefined (which JSON never produces) when the text is not JSON. */
function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function asString(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** The allowed value `v` names, else `fallback`. Compared, never cast. */
function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  const s = asString(v, 16).toLowerCase();
  return allowed.find((a) => a === s) ?? fallback;
}

/**
 * Coerce a raw object into a validated personalisation.
 *
 * Every id the model used must belong to the plan it was shown; every string
 * is bounded; every enum is re-checked. A reply with no usable ideas is
 * rejected (returns null), so the caller ships deterministic ideas rather than
 * an empty card; a cached entry that fails this is treated as a miss.
 */
export function coercePersonalisation(
  raw: Record<string, unknown>,
  plan: Plan,
  meta: { model: string; cached: boolean },
): Personalisation | null {
  const ideas = coerceIdeas(raw.ideas, lineIdsOf(plan));
  if (ideas.length === 0) return null;
  return {
    summary: asString(raw.summary, REPLY_LIMITS.summary),
    ideas,
    ...coerceSections(raw, plan),
    source: 'model',
    model: meta.model,
    cached: meta.cached,
  };
}

const lineIdsOf = (plan: Plan): ReadonlySet<string> => new Set(plan.budget.lines.map((l) => l.id));

/** The vendor questions and budget notes in a raw reply, checked against the plan. */
function coerceSections(
  raw: Record<string, unknown>,
  plan: Plan,
): Pick<Personalisation, 'vendorQuestions' | 'budgetNotes'> {
  return {
    vendorQuestions: coerceVendorQuestions(
      raw.vendorQuestions,
      new Set(plan.vendors.map((v) => v.id)),
    ),
    budgetNotes: coerceBudgetNotes(raw.budgetNotes, lineIdsOf(plan)),
  };
}

function coerceIdeas(raw: unknown, lineIds: ReadonlySet<string>): Idea[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, REPLY_LIMITS.ideas)
    .map((i) => coerceIdea(i, lineIds))
    .filter((i): i is Idea => i !== null);
}

function coerceIdea(raw: unknown, lineIds: ReadonlySet<string>): Idea | null {
  if (!isRecord(raw)) return null;
  const title = asString(raw.title, REPLY_LIMITS.ideaTitle);
  const detail = asString(raw.detail, REPLY_LIMITS.ideaDetail);
  if (!title || !detail) return null;
  const lineId = asString(raw.budgetLineId, 24);
  return {
    title,
    detail,
    category: oneOf(raw.category, IDEA_CATEGORIES, 'other'),
    costTier: oneOf(raw.costTier, COST_TIERS, 'medium'),
    budgetLineId: lineIds.has(lineId) ? lineId : null,
  };
}

function coerceVendorQuestions(
  raw: unknown,
  vendorIds: ReadonlySet<string>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!isRecord(raw)) return out;
  for (const [id, qs] of Object.entries(raw)) {
    if (!vendorIds.has(id) || !Array.isArray(qs)) continue;
    const clean = qs
      .map((q) => asString(q, REPLY_LIMITS.question))
      .filter(Boolean)
      .slice(0, REPLY_LIMITS.questionsPerVendor);
    if (clean.length) out[id] = clean;
  }
  return out;
}

function coerceBudgetNotes(raw: unknown, lineIds: ReadonlySet<string>): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isRecord(raw)) return out;
  for (const [id, note] of Object.entries(raw)) {
    const clean = lineIds.has(id) ? asString(note, REPLY_LIMITS.note) : '';
    if (clean) out[id] = clean;
  }
  return out;
}

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

/**
 * A cached personalisation: the merged model reply, and the model that wrote
 * its ideas, which may be the fallback. An entry without a model name predates
 * this shape and is treated as a miss.
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

interface PartResult {
  obj: Record<string, unknown>;
  model: string;
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

/** The inputs that fully determine a personalisation, for the cache key. */
function cacheParts(plan: Plan): string[] {
  const r = plan.request;
  return [
    r.eventType,
    String(r.guests),
    String(r.budget),
    r.city ?? '',
    r.occasion ?? '',
    r.preferences ?? '',
    // Lead time changes the advice ("this is a rush"); bucket it coarsely so a
    // plan made a day later still hits.
    plan.timeline.rushed ? 'rushed' : 'calm',
    PROMPT_VERSION,
    PRIMARY_MODEL,
  ];
}

type Answers = Record<Part, PartResult | null>;

/** All four parts at once, under one nonce. */
async function askAll(env: Env, plan: Plan, timeoutMs: number): Promise<Answers> {
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

/** A part's object at `key`, else the generic one. Its contents are checked later, by coercePersonalisation. */
function pick(part: PartResult | null, key: string, generic: object): object {
  const raw = part?.obj[key];
  return typeof raw === 'object' && raw !== null ? raw : generic;
}

/**
 * The answers as one raw reply, unchecked, and the model that wrote its ideas
 * (null when neither idea half answered). A section no model answered is the
 * generic one.
 */
function mergeAnswers(
  answers: Answers,
  generic: Personalisation,
): { reply: Record<string, unknown>; model: string | null } {
  // Either half alone is still a personalisation; both together is the aim.
  const ideas = mergeIdeas(answers.ideasA, answers.ideasB);
  const reply = {
    summary: ideas?.obj.summary,
    ideas: ideas?.obj.ideas,
    vendorQuestions: pick(answers.vendors, 'vendorQuestions', generic.vendorQuestions),
    budgetNotes: pick(answers.notes, 'budgetNotes', generic.budgetNotes),
  };
  return { reply, model: ideas?.model ?? null };
}

/**
 * Personalise a plan: cache, then four concurrent model asks (each with its
 * own fallback model), then deterministic guidance for any part no model
 * answered. Never throws, and always returns ideas.
 */
export async function personalise(
  env: Env,
  plan: Plan,
  options: { timeoutMs?: number } = {},
): Promise<Personalisation> {
  const key = await contentKey(cacheParts(plan));
  const hit = asCachedReply(await cacheGet(key));
  const cached = hit && coercePersonalisation(hit.reply, plan, { model: hit.model, cached: true });
  if (cached) return cached;

  const answers = await askAll(env, plan, options.timeoutMs ?? MODEL_TIMEOUT_MS);
  const generic = fallbackPersonalisation(plan);
  const { reply, model } = mergeAnswers(answers, generic);
  const result = model ? coercePersonalisation(reply, plan, { model, cached: false }) : null;
  // Ideas are the part that makes a personalisation worth the name; without
  // them it ships generic ideas, keeping whichever model-written questions and
  // notes pass the same checks.
  if (!model || !result) return { ...generic, ...coerceSections(reply, plan) };
  // Only a complete model answer is durable. A fallback must be retried.
  if (Object.values(answers).every((a) => a !== null)) {
    const entry: CachedReply = { model, reply };
    await cachePut(key, entry);
  }
  return result;
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
