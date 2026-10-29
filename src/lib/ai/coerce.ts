import { fallbackPersonalisation } from '../fallback';
import { COST_TIERS, IDEA_CATEGORIES } from '../constants';
import type { BudgetLine, Idea, Personalisation, Plan } from '../types';
import { isRecord } from '../validate';

/**
 * Turning a raw model reply into a personalisation the page may show.
 *
 * The reply is untrusted input: every id it uses must belong to the plan it
 * was shown, every string is bounded, every enum re-checked, and anything
 * outside the schema dropped.
 */

/** Bounds on what a model reply may contribute. Request limits are in src/shared/constants.ts. */
const REPLY_LIMITS = {
  ideas: 8,
  questionsPerVendor: 3,
  summary: 600,
  ideaTitle: 90,
  ideaDetail: 320,
  question: 200,
  note: 240,
} as const;

function asString(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** The allowed value `v` names, else `fallback`. Compared, never cast. */
function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  const s = asString(v, 16).toLowerCase();
  return allowed.find((a) => a === s) ?? fallback;
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

/**
 * The generic guidance for `plan`, with the reply's vendor questions and its
 * budget notes in place of the generic ones wherever any entry of that section
 * survives the checks against the plan, and `sources` saying which.
 */
export function withReplySections(raw: Record<string, unknown>, plan: Plan): Personalisation {
  const generic = fallbackPersonalisation(plan);
  const vendorIds = new Set(plan.vendors.map((v) => v.id));
  const lineIds = new Set(plan.budget.lines.map((l) => l.id));
  const questions = coerceVendorQuestions(raw.vendorQuestions, vendorIds);
  const notes = coerceBudgetNotes(raw.budgetNotes, lineIds);
  const ownQuestions = Object.keys(questions).length > 0;
  const ownNotes = Object.keys(notes).length > 0;
  return {
    ...generic,
    vendorQuestions: ownQuestions ? questions : generic.vendorQuestions,
    budgetNotes: ownNotes ? notes : generic.budgetNotes,
    sources: {
      ideas: 'fallback',
      vendorQuestions: ownQuestions ? 'model' : 'fallback',
      budgetNotes: ownNotes ? 'model' : 'fallback',
    },
  };
}

function coerceIdea(raw: unknown, lines: readonly BudgetLine[]): Idea | null {
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
    budgetLineId: lines.find((l) => l.id === lineId)?.id ?? null,
  };
}

function coerceIdeas(raw: unknown, lines: readonly BudgetLine[]): Idea[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, REPLY_LIMITS.ideas)
    .map((i) => coerceIdea(i, lines))
    .filter((i): i is Idea => i !== null);
}

/**
 * A validated personalisation from a raw reply, or null when no idea in it is
 * usable, so the caller ships deterministic ideas rather than an empty card
 * (and treats such a cache entry as a miss). The vendor questions and budget
 * notes are taken as {@link withReplySections} takes them.
 */
export function coercePersonalisation(
  raw: Record<string, unknown>,
  plan: Plan,
  meta: { model: string; cached: boolean },
): Personalisation | null {
  const ideas = coerceIdeas(raw.ideas, plan.budget.lines);
  if (ideas.length === 0) return null;
  const sections = withReplySections(raw, plan);
  return {
    ...sections,
    summary: asString(raw.summary, REPLY_LIMITS.summary),
    ideas,
    sources: { ...sections.sources, ideas: 'model' },
    model: meta.model,
    cached: meta.cached,
  };
}
