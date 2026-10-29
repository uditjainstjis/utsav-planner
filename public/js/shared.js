// @ts-check
/**
 * Values and wording the page and the Worker must agree on, defined once.
 *
 * Plain JavaScript, so the browser loads this file as it is. The Worker imports
 * the same file (src/index.ts and src/lib/), so there is no second
 * copy to drift; test/assets.dom.test.ts holds the form's own min, max and
 * maxlength attributes to these numbers.
 */

/** Bounds on a planning request. The Worker enforces them; the form checks them first. */
export const LIMITS = Object.freeze({
  guests: Object.freeze({ min: 1, max: 5000 }),
  budget: Object.freeze({ min: 1000, max: 100_000_000 }),
  /** How far ahead a plan may be made. Two years covers every real booking. */
  maxLeadDays: 730,
  city: 60,
  occasion: 80,
  preferences: 600,
  /** The "Change something" sentence. */
  refine: 200,
});

/**
 * What each occasion is called when the brief does not name it: in the copied
 * plan and as the calendar's name.
 * @type {Readonly<Record<import('../../src/lib/types').EventType, string>>}
 */
export const OCCASION_LABEL = Object.freeze({
  wedding: 'Wedding',
  birthday: 'Birthday',
  community: 'Community event',
});

const INR = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/**
 * Whole rupees in Indian digit grouping, "₹12,00,000": how the page and the
 * Worker both write money.
 * @param {number} n
 */
export const rupees = (n) => `₹${INR.format(n)}`;

/**
 * The message for a number outside its range, worded once so it reads the
 * same whether the form or the Worker caught it.
 * @param {string} label  the field, as the sentence starts with it
 * @param {{ min: number, max: number }} range
 */
export const rangeMessage = (label, { min, max }) =>
  `${label} must be between ${INR.format(min)} and ${INR.format(max)}.`;

/**
 * Today as YYYY-MM-DD in UTC: the day the form's date bounds and the Worker's
 * planning day are both counted from, so the two agree on what "past" means.
 * @param {Date} [now]
 */
export function todayIso(now = new Date()) {
  return now.toISOString().slice(0, 10);
}
