/** Reading a budget and a headcount out of a sentence, in Indian or Western magnitudes. */
import { group, spanOf } from './span';

/** Indian and Western magnitudes, lower-cased, matched as a whole word after a number. */
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
/** Every key of {@link MAGNITUDE}, longest first, as one alternation. */
const MAGNITUDES = Object.keys(MAGNITUDE)
  .sort((a, b) => b.length - a.length)
  .join('|');
const AMOUNT = String.raw`(\d[\d,]*(?:\.\d+)?)`;
/**
 * "budget 12,00,000", "₹1.5 crore", "rs 50k", "budget of 50000" → rupees.
 * Keywords are whole words, so the "rs" in "speakers 3000" is not rupees.
 */
const BUDGET_RE = new RegExp(
  String.raw`(?:\b(?:budget|total|spend|rs\.?|inr)|₹)\s*(?:of|to|is|=|:)?\s*(?:rs\.?|inr|₹)?\s*${AMOUNT}\s*(${MAGNITUDES})?\b`,
  'i',
);
/** A bare amount is a budget only when a magnitude word makes it unambiguous: "12 lakh", "1.2 crore", "50k". */
const BARE_BUDGET_RE = new RegExp(String.raw`(?<![\d,.])${AMOUNT}\s*(${MAGNITUDES})\b`, 'i');
/** "300 guests", "guests 300", "for 120 people", "headcount 80"; never the "people" in "townspeople". */
const GUESTS_RE =
  /(?:(\d[\d,]*)\s*(?:guests|people|pax|persons|heads|attendees|kids|children)|\b(?:guests|guest count|headcount|people)\s*(?:of|to|is|=|:)?\s*(\d[\d,]*))\b/i;

function toNumber(raw: string, magnitude: string): number {
  const n = Number(raw.replace(/,/g, ''));
  return Math.round(n * (MAGNITUDE[magnitude.toLowerCase()] ?? 1));
}

/** A number read from the sentence, and where in the sentence it was. */
interface Found {
  value: number;
  span: [number, number];
}

/** A headcount read from the sentence. */
export function parseGuests(text: string): Found | null {
  const g = GUESTS_RE.exec(text);
  return g ? { value: toNumber(group(g, 1) || group(g, 2), ''), span: spanOf(g) } : null;
}

/** A budget in rupees read from the sentence. */
export function parseBudget(text: string): Found | null {
  const b = BUDGET_RE.exec(text) ?? BARE_BUDGET_RE.exec(text);
  return b ? { value: toNumber(group(b, 1), group(b, 2)), span: spanOf(b) } : null;
}
