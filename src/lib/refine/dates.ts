import { DAY_MS, dateParts, dateToMs, daysBetween, msToDate } from '../dates';

/**
 * Reading an event date out of a sentence: an explicit date, a month with the
 * day kept from the current date, or "in N days/weeks/months".
 */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/**
 * A month's full name or standard abbreviation, as a whole word: "Mar", "March"
 * and "Mar." are March, but "marquee", "decor" and "maybe" are not months.
 */
const MONTH =
  '(?<month>jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|' +
  'sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\b\\.?';
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
