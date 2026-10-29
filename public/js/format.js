// @ts-check
/** Money, share and date formatting, and the calendar arithmetic the form needs. */

/** @typedef {import('../../src/lib/types').Plan} Plan */

export const INR = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** @param {number} n */
export const rupees = (n) => `₹${INR.format(n)}`;

/** @param {number} share */
export const percent = (share) => `${Math.round(share * 100)}%`;

/**
 * The name of a budget line, for text that refers to one by id.
 * @param {Plan} plan
 * @param {string} id
 */
export const lineLabel = (plan, id) => plan.budget.lines.find((l) => l.id === id)?.label ?? id;

const DATE_FMT = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** @param {string} iso */
export const fmtDate = (iso) => DATE_FMT.format(new Date(`${iso}T00:00:00Z`));

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * @param {string} iso
 * @param {number} days
 */
export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
