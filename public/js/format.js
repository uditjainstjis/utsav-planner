// @ts-check
/** Share, date and cost-tier formatting. Money is in constants.js, calendar arithmetic in dates.js. */

/** @typedef {import('../../src/lib/types').CostTier} CostTier */
/** @typedef {import('../../src/lib/types').Plan} Plan */

/**
 * Cost tiers carry a glyph and a word, never colour alone.
 * @type {Record<CostTier, { glyph: string, word: string }>}
 */
export const TIER = {
  low: { glyph: '●', word: 'Low cost' },
  medium: { glyph: '●●', word: 'Mid cost' },
  high: { glyph: '●●●', word: 'Higher cost' },
};

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
