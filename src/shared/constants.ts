/**
 * Values and wording the page and the Worker must agree on, defined once.
 *
 * The Worker imports this module. scripts/build-assets.mjs compiles it to
 * public/js/constants.js, with its declarations in constants.d.ts, so the page
 * runs the same code. It imports nothing: the compiled copy must stand alone.
 */

/** The three occasions named in the brief: the form's radio values. */
export const EVENT_TYPES = ['wedding', 'birthday', 'community'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Bounds on a planning request. The Worker enforces them; the form checks them first. */
export const LIMITS = {
  guests: { min: 1, max: 5000 },
  budget: { min: 1000, max: 100_000_000 },
  /** How far ahead a plan may be made. Two years covers every real booking. */
  maxLeadDays: 730,
  city: 60,
  occasion: 80,
  preferences: 600,
  /** The "Change something" sentence. */
  refine: 200,
} as const;

/** What the form and the Worker say about an event date outside the limits. */
export const DATE_MESSAGE = {
  past: 'The event date is in the past.',
  tooFar: 'Plans can be made up to two years ahead.',
} as const;

/**
 * What each occasion is called when the brief does not name it: in the copied
 * plan and as the calendar's name.
 */
export const OCCASION_LABEL: Readonly<Record<EventType, string>> = {
  wedding: 'Wedding',
  birthday: 'Birthday',
  community: 'Community event',
};

const INR = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** Whole rupees in Indian digit grouping, "₹12,00,000": how the page and the Worker both write money. */
export const rupees = (n: number): string => `₹${INR.format(n)}`;

/**
 * The message for a number outside its range, worded once so it reads the
 * same whether the form or the Worker caught it.
 * @param label  the field, as the sentence starts with it
 */
export const rangeMessage = (label: string, { min, max }: { min: number; max: number }): string =>
  `${label} must be between ${INR.format(min)} and ${INR.format(max)}.`;

/**
 * Today as YYYY-MM-DD in UTC: the day the form's date bounds and the Worker's
 * planning day are both counted from, so the two agree on what "past" means.
 */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
