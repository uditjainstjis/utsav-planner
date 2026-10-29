/**
 * Calendar-date arithmetic on YYYY-MM-DD strings.
 *
 * Plain UTC calendar days, so a plan made in Mumbai and read in Toronto shows
 * the same dates. Inputs are already validated by the time they reach here.
 *
 * The page runs this same code: scripts/build-assets.mjs compiles it to
 * public/js/dates.js, so it imports nothing.
 */

const DAY_MS = 86_400_000;

/** Year, month (1–12) and day of a YYYY-MM-DD string. */
export function dateParts(iso: string): { y: number; m: number; d: number } {
  return { y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)), d: Number(iso.slice(8, 10)) };
}

/** Parse YYYY-MM-DD as a UTC midnight timestamp. */
function dateToMs(iso: string): number {
  const { y, m, d } = dateParts(iso);
  return Date.UTC(y, m - 1, d);
}

/** Format a UTC timestamp as YYYY-MM-DD. */
export function msToDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((dateToMs(to) - dateToMs(from)) / DAY_MS);
}

/** The date `days` calendar days after `iso` (before it, when negative). */
export function addDays(iso: string, days: number): string {
  return msToDate(dateToMs(iso) + days * DAY_MS);
}
