// @ts-check
/**
 * Values the page and the Worker must agree on, defined once.
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

/**
 * Today as YYYY-MM-DD in UTC: the day the form's date bounds and the Worker's
 * planning day are both counted from, so the two agree on what "past" means.
 * @param {Date} [now]
 */
export function todayIso(now = new Date()) {
  return now.toISOString().slice(0, 10);
}
