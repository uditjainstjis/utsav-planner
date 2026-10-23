import { InputError, LIMITS } from './validate';
import type { PlanRequest } from './types';

/**
 * Refinement: the conversational step.
 *
 * After seeing a plan, the user says what to change in plain words —
 * "budget 12 lakh", "300 guests", "more budget-friendly, add a mehndi night".
 * The numbers in that sentence are parsed here, deterministically, and applied
 * to the request so the budget and timeline are recomputed by code. Whatever
 * is left is appended to the wishes as a labelled adjustment, so the model
 * rewrites the ideas, questions and notes around it. The user is told exactly
 * what was applied, so a misread number is visible rather than silent.
 */

export interface Change {
  field: 'budget' | 'guests' | 'wishes';
  from: string;
  to: string;
}

export interface Refinement {
  request: PlanRequest;
  changes: Change[];
}

export const MAX_REFINE_CHARS = 200;

/** Indian and Western magnitudes, lower-cased, matched after a number. */
const MAGNITUDE: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  lakh: 100_000,
  lac: 100_000,
  lakhs: 100_000,
  l: 100_000,
  crore: 10_000_000,
  crores: 10_000_000,
  cr: 10_000_000,
  million: 1_000_000,
  m: 1_000_000,
};

/** "12,00,000", "12 lakh", "₹1.5 crore", "rs 50k", "budget of 50000" → rupees. */
const BUDGET_RE =
  /(?:budget|total|spend|rs\.?|inr|₹)\s*(?:of|to|is|=|:)?\s*(?:rs\.?|inr|₹)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|lakhs?|lac|l|crores?|cr|million|m)?\b/i;
/** "300 guests", "guests 300", "for 120 people", "headcount 80" */
const GUESTS_RE =
  /(?:(\d[\d,]*)\s*(?:guests|people|pax|persons|heads|attendees|kids|children)|(?:guests|guest count|headcount|people)\s*(?:of|to|is|=|:)?\s*(\d[\d,]*))\b/i;

function toNumber(raw: string, magnitude: string | undefined): number {
  const n = Number(raw.replace(/,/g, ''));
  const factor = magnitude ? (MAGNITUDE[magnitude.toLowerCase()] ?? 1) : 1;
  return Math.round(n * factor);
}

const inr = (n: number): string => `₹${n.toLocaleString('en-IN')}`;

/**
 * Parse the free-text adjustment and apply it to a validated request.
 *
 * Only budget and headcount are read as numbers — they are the two inputs a
 * user changes most and the two that re-shape the whole plan. Everything else
 * is wording for the model. Out-of-range numbers raise the same field-named
 * `InputError` the main form would.
 */
export function applyRefinement(request: PlanRequest, textRaw: unknown): Refinement {
  if (typeof textRaw !== 'string') {
    throw new InputError('Say what you would like to change.', 'type', 'refine');
  }
  const text = textRaw.replace(/\s+/g, ' ').trim();
  if (!text) throw new InputError('Say what you would like to change.', 'missing', 'refine');
  if (text.length > MAX_REFINE_CHARS) {
    throw new InputError(
      `Keep the change under ${MAX_REFINE_CHARS} characters.`,
      'too_long',
      'refine',
    );
  }

  const changes: Change[] = [];
  let next: PlanRequest = { ...request };

  const b = BUDGET_RE.exec(text);
  if (b) {
    const budget = toNumber(b[1] ?? '0', b[2]);
    if (budget < LIMITS.budget.min || budget > LIMITS.budget.max) {
      throw new InputError(
        `Budget must be between ${inr(LIMITS.budget.min)} and ${inr(LIMITS.budget.max)}.`,
        'range',
        'refine',
      );
    }
    if (budget !== request.budget) {
      changes.push({ field: 'budget', from: inr(request.budget), to: inr(budget) });
      next = { ...next, budget };
    }
  }

  const g = GUESTS_RE.exec(text);
  if (g) {
    const guests = toNumber(g[1] ?? g[2] ?? '0', undefined);
    if (guests < LIMITS.guests.min || guests > LIMITS.guests.max) {
      throw new InputError(
        `Guests must be between ${LIMITS.guests.min} and ${LIMITS.guests.max.toLocaleString('en-IN')}.`,
        'range',
        'refine',
      );
    }
    if (guests !== request.guests) {
      changes.push({ field: 'guests', from: String(request.guests), to: String(guests) });
      next = { ...next, guests };
    }
  }

  // The whole sentence goes to the model, numbers included: "cut decor" is
  // wording, and "12 lakh" is useful context for the notes even though the
  // budget line amounts are already recomputed.
  const label = `Adjustment requested: ${text}`;
  const preferences = request.preferences ? `${request.preferences}\n${label}` : label;
  next = { ...next, preferences: preferences.slice(0, LIMITS.preferences + MAX_REFINE_CHARS + 32) };
  changes.push({ field: 'wishes', from: request.preferences ?? '', to: text });

  return { request: next, changes };
}
