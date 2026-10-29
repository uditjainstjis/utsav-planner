import { LIMITS, MESSAGE, rupees } from '../../shared/constants';
import type { PlanRequest } from '../types';
import { InputError, validateBudget, validateDate, validateGuests } from '../validate';
import { parseDate } from './dates';
import { parseBudget, parseGuests } from './numbers';
import { assembleWishes, splitWishes } from './wishes';

/**
 * Refinement: the conversational step.
 *
 * After seeing a plan, the user says what to change in plain words —
 * "budget 12 lakh", "300 guests", "more budget-friendly, add a mehndi night".
 * The numbers in that sentence are parsed here, deterministically, and applied
 * to the request so the budget and timeline are recomputed by code. The whole
 * sentence is then appended to the wishes as a labelled adjustment, so the
 * model rewrites the ideas, questions and notes around it. The user is told exactly
 * what was applied, so a misread number is visible rather than silent.
 */

export interface Change {
  field: 'budget' | 'guests' | 'date' | 'wishes';
  from: string;
  to: string;
}

interface Refinement {
  request: PlanRequest;
  changes: Change[];
}

/** The change as typed, whitespace collapsed; present and within the length limit. */
function readChange(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new InputError(MESSAGE.noChange, 'type', 'refine');
  }
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) throw new InputError(MESSAGE.noChange, 'missing', 'refine');
  if (text.length > LIMITS.refine) {
    throw new InputError(
      `Keep the change under ${LIMITS.refine} characters.`,
      'too_long',
      'refine',
    );
  }
  return text;
}

/** A value read from the sentence, and the sentence with that span blanked out. */
interface Taken<T> {
  value: T | null;
  rest: string;
}

const without = (text: string, [start, end]: [number, number]): string =>
  `${text.slice(0, start)} ${text.slice(end)}`;

/**
 * Run one of the form's own validators on a value read from the change, and
 * name the change box as the field that failed: that is where it was typed.
 */
function asChange<T>(validate: () => T): T {
  try {
    return validate();
  } catch (err) {
    if (err instanceof InputError) throw new InputError(err.message, err.code, 'refine');
    throw err;
  }
}

function takeDate(text: string, current: string, today: string): Taken<string> {
  const d = parseDate(text, current, today);
  if (!d) return { value: null, rest: text };
  return { value: asChange(() => validateDate(d.iso, today)), rest: without(text, d.span) };
}

function takeGuests(text: string): Taken<number> {
  const g = parseGuests(text);
  if (!g) return { value: null, rest: text };
  return { value: asChange(() => validateGuests(g.value)), rest: without(text, g.span) };
}

function takeBudget(text: string): Taken<number> {
  const b = parseBudget(text);
  if (!b) return { value: null, rest: text };
  return { value: asChange(() => validateBudget(b.value)), rest: without(text, b.span) };
}

/** What changed, in a stable order for the UI: money, people, the date, then words. */
function listChanges(before: PlanRequest, after: PlanRequest, text: string): Change[] {
  const changes: Change[] = [];
  if (after.budget !== before.budget) {
    changes.push({ field: 'budget', from: rupees(before.budget), to: rupees(after.budget) });
  }
  if (after.guests !== before.guests) {
    changes.push({ field: 'guests', from: String(before.guests), to: String(after.guests) });
  }
  if (after.eventDate !== before.eventDate) {
    changes.push({ field: 'date', from: before.eventDate, to: after.eventDate });
  }
  changes.push({ field: 'wishes', from: before.preferences ?? '', to: text });
  return changes;
}

/**
 * Parse the free-text adjustment and apply it to a validated request.
 *
 * Budget, headcount and the date are read deterministically — the three inputs
 * that re-shape the whole plan. Everything else is wording for the model.
 * Out-of-range numbers raise the same `InputError` the main form would, with
 * the change box named as the field.
 */
export function applyRefinement(request: PlanRequest, textRaw: unknown, today: string): Refinement {
  const text = readChange(textRaw);
  // The date first, and its span removed, so "15 March 2027" can never be read
  // as a headcount of 15 or a budget of 2027.
  const date = takeDate(text, request.eventDate, today);
  // Headcount next, and removed from the text before the budget is read, so
  // "total 300 guests" is a headcount and never a ₹300 budget.
  const guests = takeGuests(date.rest);
  const budget = takeBudget(guests.rest);

  // The whole sentence goes to the model, numbers included: "cut decor" is
  // wording, and "12 lakh" is useful context for the notes even though the
  // budget line amounts are already recomputed. Earlier adjustments stay with
  // the brief, bounded so the result always passes the form's own limit.
  const { base, adjustments } = splitWishes(request.preferences);
  const next: PlanRequest = {
    ...request,
    eventDate: date.value ?? request.eventDate,
    guests: guests.value ?? request.guests,
    budget: budget.value ?? request.budget,
    preferences: assembleWishes(base, [...adjustments, text]),
  };
  return { request: next, changes: listChanges(request, next, text) };
}
