/**
 * Split `total` along `shares` into whole rupees that sum to exactly `total`.
 *
 * Largest-remainder (Hamilton) apportionment: floor every line, then hand the
 * leftover rupees, one each, to the lines that lost the most to flooring.
 */
export function apportion(total: number, shares: readonly number[]): number[] {
  const raw = shares.map((s) => total * s);
  const floors = raw.map(Math.floor);
  let leftover = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - (floors[i] ?? 0) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (leftover <= 0) break;
    floors[i] = (floors[i] ?? 0) + 1;
    leftover -= 1;
  }
  return floors;
}
