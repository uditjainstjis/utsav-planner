import { describe, expect, it } from 'vitest';
import { apportion, buildBudget } from '../src/lib/budget';
import { EVENT_TYPES } from '../src/lib/types';

/**
 * The budget is arithmetic a user will check with a calculator. These tests
 * hold the invariants that make it trustworthy: lines sum to the total, shares
 * sum to one, per-guest figures are honest, and warnings fire on the right
 * side of their thresholds.
 */

describe('apportion', () => {
  it('returns whole numbers that sum exactly to the total', () => {
    const shares = [0.22, 0.33, 0.12, 0.08, 0.08, 0.05, 0.02, 0.05, 0.05];
    for (const total of [1000, 1001, 12345, 99_999, 1_000_000, 7_777_777]) {
      const parts = apportion(total, shares);
      expect(parts.every(Number.isInteger)).toBe(true);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it('never moves any line more than one rupee from its exact share', () => {
    const shares = [0.5, 0.25, 0.25];
    const parts = apportion(1001, shares);
    parts.forEach((p, i) => {
      expect(Math.abs(p - 1001 * (shares[i] ?? 0))).toBeLessThan(1);
    });
  });

  it('gives the leftover rupee to the line that lost the most to flooring', () => {
    // 10 * 0.33 = 3.3, 10 * 0.33 = 3.3, 10 * 0.34 = 3.4 → floors 3,3,3, one left
    expect(apportion(10, [0.33, 0.33, 0.34])).toEqual([3, 3, 4]);
  });

  it('handles a total smaller than the number of lines', () => {
    expect(apportion(2, [0.5, 0.3, 0.2]).reduce((a, b) => a + b, 0)).toBe(2);
  });
});

describe('buildBudget', () => {
  it.each(EVENT_TYPES)('%s: shares sum to one and amounts sum to the total', (type) => {
    for (const [total, guests] of [
      [1000, 1],
      [50_000, 40],
      [1_234_567, 333],
      [100_000_000, 5000],
    ] as const) {
      const b = buildBudget(type, total, guests);
      expect(b.lines.reduce((a, l) => a + l.share, 0)).toBeCloseTo(1, 9);
      expect(b.lines.reduce((a, l) => a + l.amount, 0)).toBe(total);
      expect(b.total).toBe(total);
      expect(b.currency).toBe('INR');
    }
  });

  it.each(EVENT_TYPES)('%s: has unique ids, including the catering line the flags read', (type) => {
    const ids = buildBudget(type, 100_000, 50).lines.map((l) => l.id);
    expect(ids).toContain('catering');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reports per-guest figures only for lines that scale with headcount', () => {
    const b = buildBudget('wedding', 500_000, 200);
    const catering = b.lines.find((l) => l.id === 'catering')!;
    const venue = b.lines.find((l) => l.id === 'venue')!;
    expect(catering.perGuest).toBe(Math.round(catering.amount / 200));
    expect(venue.perGuest).toBeNull();
    expect(b.perGuest).toBe(2500);
  });

  it('keeps contingency as the last line, so the UI can present it apart', () => {
    for (const type of EVENT_TYPES) {
      const b = buildBudget(type, 100_000, 50);
      expect(b.lines.at(-1)!.id).toBe('contingency');
    }
  });

  describe('flags', () => {
    it('warns when the total is too thin per guest', () => {
      const b = buildBudget('wedding', 100_000, 200); // ₹500 a head
      expect(b.flags.map((f) => f.code)).toEqual(['tight_total']);
      expect(b.flags[0]!.message).toMatch(/₹500/);
    });

    it('warns on catering alone when the total clears the floor but catering does not', () => {
      // Wedding floor: total 1500/guest, catering 600/guest; catering is 33%.
      // 1700/guest → catering 561/guest: total ok, catering tight.
      const b = buildBudget('wedding', 170_000, 100);
      expect(b.flags.map((f) => f.code)).toEqual(['tight_catering']);
    });

    it('notes a generous budget rather than staying silent', () => {
      const b = buildBudget('birthday', 200_000, 20); // ₹10,000 a head
      expect(b.flags.map((f) => f.code)).toEqual(['generous']);
    });

    it('raises nothing in the comfortable middle', () => {
      const b = buildBudget('community', 100_000, 200); // ₹500 a head
      expect(b.flags).toEqual([]);
    });

    it('formats amounts with Indian digit grouping', () => {
      const b = buildBudget('wedding', 1_00_000, 500);
      expect(b.flags[0]!.message).toMatch(/₹7,50,000/);
    });
  });
});
