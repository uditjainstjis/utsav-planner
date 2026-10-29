import { rupees } from '../../public/js/shared.js';
import { DAY_MS, dateParts, dateToMs, daysBetween, msToDate } from './dates';
import { InputError, LIMITS, validateBudget, validateDate, validateGuests } from './validate';
import type { PlanRequest } from './types';

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

/** Indian and Western magnitudes, lower-cased, matched after a number. */
const MAGNITUDE: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  lakh: 100_000,
  lakhs: 100_000,
  lac: 100_000,
  crore: 10_000_000,
  crores: 10_000_000,
  cr: 10_000_000,
  million: 1_000_000,
};
/** "budget 12,00,000", "₹1.5 crore", "rs 50k", "budget of 50000" → rupees. */
const BUDGET_RE =
  /(?:budget|total|spend|rs\.?|inr|₹)\s*(?:of|to|is|=|:)?\s*(?:rs\.?|inr|₹)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|lakhs?|lac|crores?|cr|million)?\b/i;
/** A bare amount is a budget only when a magnitude word makes it unambiguous: "12 lakh", "1.2 crore", "50k". */
const BARE_BUDGET_RE =
  /(?<![\d,.])(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|lakhs?|lac|crores?|cr|million)\b/i;
/** "300 guests", "guests 300", "for 120 people", "headcount 80" */
const GUESTS_RE =
  /(?:(\d[\d,]*)\s*(?:guests|people|pax|persons|heads|attendees|kids|children)|(?:guests|guest count|headcount|people)\s*(?:of|to|is|=|:)?\s*(\d[\d,]*))\b/i;

function toNumber(raw: string, magnitude: string | undefined): number {
  const n = Number(raw.replace(/,/g, ''));
  const factor = magnitude ? (MAGNITUDE[magnitude.toLowerCase()] ?? 1) : 1;
  return Math.round(n * factor);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = '(?<month>jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
/** 2027-03-15 */
const DATE_ISO_RE = /\b(\d{4}-\d{2}-\d{2})\b/;
/** 15 March 2027 · 15th Mar · 15 march */
const DATE_DMY_RE = new RegExp(
  `\\b(?<day>\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH},?(?:\\s+(?<year>\\d{4}))?\\b`,
  'i',
);
/** March 15, 2027 · Mar 15 */
const DATE_MDY_RE = new RegExp(
  `\\b${MONTH}\\s+(?<day>\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(?<year>\\d{4}))?\\b`,
  'i',
);
/** "move it to March", "in April" — month only, keep the current day of month */
const MONTH_ONLY_RE = new RegExp(`\\b(?:to|in|for|on)\\s+${MONTH}\\b(?!\\s*\\d)`, 'i');
/** "in 3 weeks", "in 10 days", "in 2 months" */
const RELATIVE_RE = /\bin\s+(?<n>\d{1,2})\s+(?<unit>days?|weeks?|months?)\b/i;

/** A date read from the sentence, and where in the sentence it was. */
interface DateMatch {
  iso: string;
  span: [number, number];
}

const spanOf = (m: RegExpExecArray): [number, number] => [m.index, m.index + m[0].length];

function monthIndex(word: string | undefined): number {
  return MONTHS.indexOf((word ?? '').slice(0, 3).toLowerCase());
}

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** The next occurrence of a month/day on or after `today`, unless a year is given. */
function nextOccurrence(
  month0: number,
  day: number,
  year: number | undefined,
  today: string,
): string {
  const build = (y: number): string =>
    msToDate(Date.UTC(y, month0, Math.min(day, daysInMonth(y, month0))));
  if (year !== undefined) return build(year);
  const thisYear = Number(today.slice(0, 4));
  const candidate = build(thisYear);
  return daysBetween(today, candidate) >= 0 ? candidate : build(thisYear + 1);
}

/** The same day of the month `n` months after `today`, clamped to that month's length. */
function addMonths(today: string, n: number): string {
  const { y, m, d } = dateParts(today);
  const month0 = m - 1 + n;
  return nextOccurrence(month0 % 12, d, y + Math.floor(month0 / 12), today);
}

function isoDate(text: string): DateMatch | null {
  const m = DATE_ISO_RE.exec(text);
  return m ? { iso: m[1] ?? '', span: spanOf(m) } : null;
}

/** A day and a month in either order ("15 March", "March 15"), with an optional year. */
function dayMonthDate(re: RegExp, text: string, today: string): DateMatch | null {
  const m = re.exec(text);
  if (!m?.groups) return null;
  const day = Number(m.groups.day);
  const month0 = monthIndex(m.groups.month);
  if (month0 < 0 || day < 1 || day > 31) return null;
  const year = m.groups.year ? Number(m.groups.year) : undefined;
  return { iso: nextOccurrence(month0, day, year, today), span: spanOf(m) };
}

function relativeDate(text: string, today: string): DateMatch | null {
  const m = RELATIVE_RE.exec(text);
  if (!m?.groups) return null;
  const n = Number(m.groups.n);
  const unit = (m.groups.unit ?? '').toLowerCase();
  const iso = unit.startsWith('month')
    ? addMonths(today, n)
    : msToDate(dateToMs(today) + (unit.startsWith('week') ? n * 7 : n) * DAY_MS);
  return { iso, span: spanOf(m) };
}

function monthOnlyDate(text: string, current: string, today: string): DateMatch | null {
  const m = MONTH_ONLY_RE.exec(text);
  const month0 = monthIndex(m?.groups?.month);
  if (!m || month0 < 0) return null;
  return {
    iso: nextOccurrence(month0, Number(current.slice(8, 10)), undefined, today),
    span: spanOf(m),
  };
}

/**
 * Read a date from the sentence. Conservative by design: an explicit date,
 * a month with the day kept from the current date, or "in N days/weeks/months".
 * Returns the ISO date and the matched span (so it is removed before the
 * number parsers run), or null.
 */
export function parseDate(text: string, current: string, today: string): DateMatch | null {
  return (
    isoDate(text) ??
    dayMonthDate(DATE_DMY_RE, text, today) ??
    dayMonthDate(DATE_MDY_RE, text, today) ??
    relativeDate(text, today) ??
    monthOnlyDate(text, current, today)
  );
}

const ADJUSTMENT = 'Adjustment requested: ';
/** How many past adjustments travel with the brief. Enough for context, few enough to fit. */
const KEEP_ADJUSTMENTS = 3;

/** Separate the user's original wishes from adjustments added by earlier turns. */
export function splitWishes(preferences: string | null): {
  base: string | null;
  adjustments: string[];
} {
  if (!preferences) return { base: null, adjustments: [] };
  const lines = preferences.split('\n');
  const adjustments = lines
    .filter((l) => l.startsWith(ADJUSTMENT))
    .map((l) => l.slice(ADJUSTMENT.length));
  const base =
    lines
      .filter((l) => !l.startsWith(ADJUSTMENT))
      .join('\n')
      .trim() || null;
  return { base, adjustments };
}

/**
 * Rebuild the brief so it always fits the same limit the form enforces.
 * The newest adjustment is never dropped; older ones go first, then the
 * original wishes are shortened as a last resort.
 */
export function assembleWishes(
  base: string | null,
  adjustments: string[],
  max = LIMITS.preferences,
): string {
  let kept = adjustments.slice(-KEEP_ADJUSTMENTS);
  const render = (b: string | null): string =>
    [b, ...kept.map((a) => ADJUSTMENT + a)].filter((x): x is string => Boolean(x)).join('\n');
  let out = render(base);
  while (out.length > max && kept.length > 1) {
    kept = kept.slice(1);
    out = render(base);
  }
  if (out.length > max && base) {
    const room = max - render(null).length - 1;
    out = render(room > 0 ? base.slice(0, room).trim() : null);
  }
  return out.slice(0, max);
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
  const budget = readBudget(guests.rest);

  // The whole sentence goes to the model, numbers included: "cut decor" is
  // wording, and "12 lakh" is useful context for the notes even though the
  // budget line amounts are already recomputed. Earlier adjustments stay with
  // the brief, bounded so the result always passes the form's own limit.
  const { base, adjustments } = splitWishes(request.preferences);
  const next: PlanRequest = {
    ...request,
    eventDate: date.value ?? request.eventDate,
    guests: guests.value ?? request.guests,
    budget: budget ?? request.budget,
    preferences: assembleWishes(base, [...adjustments, text]),
  };
  return { request: next, changes: listChanges(request, next, text) };
}

/** The change as typed, whitespace collapsed; present and within the length limit. */
function readChange(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new InputError('Say what you would like to change.', 'type', 'refine');
  }
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) throw new InputError('Say what you would like to change.', 'missing', 'refine');
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

function takeDate(text: string, current: string, today: string): Taken<string> {
  const d = parseDate(text, current, today);
  if (!d) return { value: null, rest: text };
  return { value: asChange(() => validateDate(d.iso, today)), rest: without(text, d.span) };
}

function takeGuests(text: string): Taken<number> {
  const g = GUESTS_RE.exec(text);
  if (!g) return { value: null, rest: text };
  const guests = toNumber(g[1] ?? g[2] ?? '0', undefined);
  return { value: asChange(() => validateGuests(guests)), rest: without(text, spanOf(g)) };
}

function readBudget(text: string): number | null {
  const b = BUDGET_RE.exec(text) ?? BARE_BUDGET_RE.exec(text);
  return b ? asChange(() => validateBudget(toNumber(b[1] ?? '0', b[2]))) : null;
}

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
