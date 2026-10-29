/**
 * Calendar-date arithmetic on YYYY-MM-DD strings.
 *
 * Plain UTC calendar days, so a plan made in Mumbai and read in Toronto shows
 * the same dates. Inputs are already validated by the time they reach here.
 */

export const DAY_MS = 86_400_000;

/** Parse YYYY-MM-DD as a UTC midnight timestamp. */
export function dateToMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
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
