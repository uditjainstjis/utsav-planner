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
import type { CostTier, Idea, IdeaCategory, Personalisation, Plan } from './types';

/**
 * Workers AI client for the one generative step: personalising a plan.
 *
 * The model is reached through a Cloudflare binding, so no API key exists in
 * this repository, in CI, or in the deployed bundle. Its reply is treated as
 * untrusted input: parsed defensively, every field bounded, every id checked
 * against the plan it was asked about, and anything outside the schema dropped.
 *
 * The four parts of a personalisation — two halves of ideas, vendor questions,
 * budget notes — are requested concurrently, each with its own small schema, because
 * schema-constrained decoding is paid for per output token: three short
 * replies in parallel finish in the time of the longest, not the sum. Each
 * part tries the primary model, then the fallback model; a part that still
 * fails is filled from deterministic guidance and the plan ships complete.
 *
 * Model choice was measured, not assumed — see docs/EVALUATION.md.
 */

export const PRIMARY_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const FALLBACK_MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct';

/** Bindings this Worker requires. `AI` is the only external dependency. */
export interface Env {
  AI: Ai;
  ASSETS: Fetcher;
  RATE_LIMITER?: { limit(o: { key: string }): Promise<{ success: boolean }> };
}

const CATEGORIES: readonly IdeaCategory[] = [
  'theme',
  'decor',
  'food',
  'activity',
  'favour',
  'invite',
  'other',
];
const TIERS: readonly CostTier[] = ['low', 'medium', 'high'];

export const LIMITS = {
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

/**
 * Extract a JSON object from a model reply.
 *
 * Schema-constrained decoding is requested, but a model under load can still
 * wrap its output in prose or a fenced code block. Recovering here costs
 * nothing and avoids discarding an otherwise good answer.
 */
export function extractJson(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    // Workers AI wraps replies two ways depending on the model: a `response`
    // field, or an OpenAI-style `choices[0].message.content`. Some models
    // return both with `response` empty, so the envelope is unwrapped first.
    if (Array.isArray(obj.choices) && obj.choices.length > 0) {
      const first = obj.choices[0] as { message?: { content?: unknown }; text?: unknown };
      const content = first.message?.content ?? first.text;
      const inner = extractJson(content);
      if (inner) return inner;
    }
    if ('response' in obj) return extractJson(obj.response);
    if ('ideas' in obj || 'summary' in obj || 'vendorQuestions' in obj || 'budgetNotes' in obj) {
      return obj;
    }
    return null;
  }
  if (typeof raw !== 'string') return null;
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function asString(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/**
 * Coerce a raw object into a validated personalisation.
 *
 * Every id the model used must belong to the plan it was shown; every string
 * is bounded; every enum is re-checked. A reply with no usable ideas is
 * rejected (returns null) so the caller can try the next model rather than
 * ship an empty section.
 */
export function coercePersonalisation(
  raw: Record<string, unknown>,
  plan: Plan,
  meta: { model: string; cached: boolean },
): Personalisation | null {
  const lineIds = new Set(plan.budget.lines.map((l) => l.id));
  const vendorIds = new Set(plan.vendors.map((v) => v.id));

  const ideas: Idea[] = Array.isArray(raw.ideas)
    ? raw.ideas
        .slice(0, LIMITS.ideas)
        .map((i): Idea | null => {
          if (!i || typeof i !== 'object') return null;
          const rec = i as Record<string, unknown>;
          const title = asString(rec.title, LIMITS.ideaTitle);
          const detail = asString(rec.detail, LIMITS.ideaDetail);
          if (!title || !detail) return null;
          const category = asString(rec.category, 12).toLowerCase() as IdeaCategory;
          const tier = asString(rec.costTier, 8).toLowerCase() as CostTier;
          const lineId = asString(rec.budgetLineId, 24);
          return {
            title,
            detail,
            category: CATEGORIES.includes(category) ? category : 'other',
            costTier: TIERS.includes(tier) ? tier : 'medium',
            budgetLineId: lineIds.has(lineId) ? lineId : null,
          };
        })
        .filter((i): i is Idea => i !== null)
    : [];
  if (ideas.length === 0) return null;

  const vendorQuestions: Record<string, string[]> = {};
  if (raw.vendorQuestions && typeof raw.vendorQuestions === 'object') {
    for (const [id, qs] of Object.entries(raw.vendorQuestions as Record<string, unknown>)) {
      if (!vendorIds.has(id) || !Array.isArray(qs)) continue;
      const clean = qs
        .map((q) => asString(q, LIMITS.question))
        .filter(Boolean)
        .slice(0, LIMITS.questionsPerVendor);
      if (clean.length) vendorQuestions[id] = clean;
    }
  }

  const budgetNotes: Record<string, string> = {};
  if (raw.budgetNotes && typeof raw.budgetNotes === 'object') {
    for (const [id, note] of Object.entries(raw.budgetNotes as Record<string, unknown>)) {
      if (!lineIds.has(id)) continue;
      const clean = asString(note, LIMITS.note);
      if (clean) budgetNotes[id] = clean;
    }
  }

  return {
    summary: asString(raw.summary, LIMITS.summary),
    ideas,
    vendorQuestions,
    budgetNotes,
    source: 'model',
    model: meta.model,
    cached: meta.cached,
  };
}

async function callModel(env: Env, model: string, part: Part, plan: Plan, nonce: string) {
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
  } as never);
}

interface PartResult {
  obj: Record<string, unknown>;
  model: string;
}

/** One part: primary model, then fallback model, else null. Never throws. */
async function askPart(
  env: Env,
  part: Part,
  plan: Plan,
  nonce: string,
): Promise<PartResult | null> {
  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    try {
      const obj = extractJson(await callModel(env, model, part, plan, nonce));
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

function pick<T>(part: PartResult | null, key: string, generic: T): T {
  const raw = part?.obj[key];
  return raw && typeof raw === 'object' ? (raw as T) : generic;
}

/**
 * Personalise a plan: cache, then four concurrent model asks (each with its
 * own fallback model), then deterministic guidance for any part still
 * missing. Never throws; never returns an empty section.
 */
export async function personalise(env: Env, plan: Plan): Promise<Personalisation> {
  const key = await contentKey(cacheParts(plan));
  const hit = await cacheGet<Record<string, unknown>>(key);
  if (hit) {
    const cached = coercePersonalisation(hit, plan, { model: PRIMARY_MODEL, cached: true });
    if (cached) return cached;
  }

  const nonce = makeNonce();
  const [ideasA, ideasB, vendors, notes] = await Promise.all([
    askPart(env, 'ideasA', plan, nonce),
    askPart(env, 'ideasB', plan, nonce),
    askPart(env, 'vendors', plan, nonce),
    askPart(env, 'notes', plan, nonce),
  ]);
  // Either half alone is still a personalisation; both together is the aim.
  const ideas = mergeIdeas(ideasA, ideasB);

  const generic = fallbackPersonalisation(plan);
  const vendorQuestions = pick(vendors, 'vendorQuestions', generic.vendorQuestions);
  const budgetNotes = pick(notes, 'budgetNotes', generic.budgetNotes);

  // Ideas are the part that makes a personalisation worth the name; without
  // them the whole thing is labelled as generic guidance.
  const merged: Record<string, unknown> = {
    summary: ideas?.obj.summary,
    ideas: ideas?.obj.ideas,
    vendorQuestions,
    budgetNotes,
  };
  const result = ideas
    ? coercePersonalisation(merged, plan, { model: ideas.model, cached: false })
    : null;
  if (!result) {
    // Still validate the model-written parts we did get, through the same gate.
    const partial = coercePersonalisation({ ...merged, ideas: generic.ideas }, plan, {
      model: '',
      cached: false,
    });
    return {
      ...generic,
      vendorQuestions: partial?.vendorQuestions ?? generic.vendorQuestions,
      budgetNotes: partial?.budgetNotes ?? generic.budgetNotes,
    };
  }
  // Only a complete model answer is durable. A fallback must be retried.
  if (ideasA && ideasB && vendors && notes) await cachePut(key, merged);
  return result;
}

/** Combine the two idea halves; the summary comes from whichever answered first in order. */
function mergeIdeas(a: PartResult | null, b: PartResult | null): PartResult | null {
  const first = a ?? b;
  if (!first) return null;
  const list = (r: PartResult | null): unknown[] =>
    Array.isArray(r?.obj.ideas) ? (r.obj.ideas as unknown[]) : [];
  return {
    model: first.model,
    obj: { summary: a?.obj.summary ?? b?.obj.summary, ideas: [...list(a), ...list(b)] },
  };
}
