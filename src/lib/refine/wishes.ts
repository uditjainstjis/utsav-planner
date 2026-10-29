import { LIMITS } from '../../shared/constants';

/**
 * The wishes as the brief carries them: the user's own words, then each
 * change they asked for, one per line, labelled as an adjustment.
 */

const ADJUSTMENT = 'Adjustment requested: ';
/** How many past adjustments travel with the brief. Enough for context, few enough to fit. */
const KEEP_ADJUSTMENTS = 3;

/** Separate the user's original wishes from adjustments added by earlier turns. */
export function splitWishes(preferences: string | null): {
  base: string | null;
  adjustments: string[];
} {
  if (!preferences) return { base: null, adjustments: [] };
  const lines = preferences.split('\n');
  const adjustments = lines
    .filter((l) => l.startsWith(ADJUSTMENT))
    .map((l) => l.slice(ADJUSTMENT.length));
  const base =
    lines
      .filter((l) => !l.startsWith(ADJUSTMENT))
      .join('\n')
      .trim() || null;
  return { base, adjustments };
}

/**
 * Rebuild the brief so it always fits the same limit the form enforces.
 * The newest adjustment is never dropped; older ones go first, then the
 * original wishes are shortened as a last resort.
 */
export function assembleWishes(
  base: string | null,
  adjustments: string[],
  max = LIMITS.preferences,
): string {
  let kept = adjustments.slice(-KEEP_ADJUSTMENTS);
  const render = (b: string | null): string =>
    [b, ...kept.map((a) => ADJUSTMENT + a)].filter((x): x is string => Boolean(x)).join('\n');
  let out = render(base);
  while (out.length > max && kept.length > 1) {
    kept = kept.slice(1);
    out = render(base);
  }
  if (out.length > max && base) {
    const room = max - render(null).length - 1;
    out = render(room > 0 ? base.slice(0, room).trim() : null);
  }
  return out.slice(0, max);
}
