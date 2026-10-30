/**
 * Split `total` across `items` by their `share`, in whole rupees that sum to
 * exactly `total`. Each item comes back paired with its amount, in order.
 *
 * Largest-remainder (Hamilton) apportionment: floor every line, then hand the
 * leftover rupees, one each, to the lines that lost the most to flooring.
 */
export function apportion<T extends { readonly share: number }>(
  total: number,
  items: readonly T[],
): { item: T; amount: number }[] {
  const parts = items.map((item, i) => {
    const raw = total * item.share;
    return { item, i, amount: Math.floor(raw), frac: raw - Math.floor(raw) };
  });
  let leftover = total - parts.reduce((sum, p) => sum + p.amount, 0);
  for (const p of [...parts].sort((a, b) => b.frac - a.frac || a.i - b.i)) {
    if (leftover <= 0) break;
    p.amount += 1;
    leftover -= 1;
  }
  return parts.map(({ item, amount }) => ({ item, amount }));
}
