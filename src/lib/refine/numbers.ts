/** Reading a budget and a headcount out of a sentence, in Indian or Western magnitudes. */

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

/** A headcount read from the sentence, and where in the sentence it was. */
export function parseGuests(text: string): { value: number; span: [number, number] } | null {
  const g = GUESTS_RE.exec(text);
  if (!g) return null;
  return {
    value: toNumber(g[1] ?? g[2] ?? '0', undefined),
    span: [g.index, g.index + g[0].length],
  };
}

/** A budget in rupees read from the sentence. */
export function parseBudget(text: string): number | null {
  const b = BUDGET_RE.exec(text) ?? BARE_BUDGET_RE.exec(text);
  return b ? toNumber(b[1] ?? '0', b[2]) : null;
}
