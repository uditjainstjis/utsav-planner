import { describe, expect, it } from 'vitest';
import { applyRefinement } from '../src/lib/refine/apply';
import { assembleWishes, splitWishes } from '../src/lib/refine/wishes';
import { LIMITS } from '../src/shared/constants';
import { InputError } from '../src/lib/validate';
import type { PlanRequest } from '../src/lib/types';

const TODAY = '2026-10-23';

const REQ: PlanRequest = {
  eventType: 'wedding',
  eventDate: '2027-03-20',
  guests: 250,
  budget: 1_500_000,
  city: 'Jaipur',
  occasion: 'Riya & Arjun',
  preferences: 'Vegetarian only.',
};

describe('applyRefinement', () => {
  it.each([
    ['budget 12 lakh', 1_200_000],
    ['Budget to ₹12,00,000 please', 1_200_000],
    ['rs 9.5 lakh total', 950_000],
    ['spend 1.2 crore', 12_000_000],
    ['budget of 50k', 50_000],
    ['total 2 million', 2_000_000],
    ['INR 800000', 800_000],
    ['12 lakh', 1_200_000],
    ['make it 1.2 crore', 12_000_000],
    ['50k is all we have', 50_000],
  ])('reads a budget from "%s"', (text, expected) => {
    const { request, changes } = applyRefinement(REQ, text, TODAY);
    expect(request.budget).toBe(expected);
    expect(changes.find((c) => c.field === 'budget')).toMatchObject({ from: '₹15,00,000' });
  });

  it.each([
    ['300 guests', 300],
    ['make it for 120 people', 120],
    ['guests 80', 80],
    ['headcount: 400', 400],
    ['just 15 kids', 15],
  ])('reads a headcount from "%s"', (text, expected) => {
    const { request, changes } = applyRefinement(REQ, text, TODAY);
    expect(request.guests).toBe(expected);
    expect(changes.find((c) => c.field === 'guests')).toMatchObject({
      from: '250',
      to: String(expected),
    });
  });

  it('reads both at once', () => {
    const { request } = applyRefinement(REQ, 'budget 12 lakh and 300 guests', TODAY);
    expect(request.budget).toBe(1_200_000);
    expect(request.guests).toBe(300);
  });

  it.each([
    'two speakers 3000 watts each',
    'add 2 dancers 4 hours',
    'invite the townspeople 2 days early',
    'more lakes 5 km away',
  ])('reads a keyword only as a whole word in "%s"', (text) => {
    const { request, changes } = applyRefinement(REQ, text, TODAY);
    expect(request).toMatchObject({ budget: REQ.budget, guests: REQ.guests });
    expect(changes.map((c) => c.field)).toEqual(['wishes']);
  });

  it('does not confuse a headcount with a budget', () => {
    expect(applyRefinement(REQ, '300 guests', TODAY).request.budget).toBe(REQ.budget);
    const total = applyRefinement(REQ, 'total 300 guests', TODAY);
    expect(total.request.guests).toBe(300);
    expect(total.request.budget).toBe(REQ.budget);
    expect(applyRefinement(REQ, 'about 300 people', TODAY).request.budget).toBe(REQ.budget);
  });

  it('keeps the brief within the form limit across many turns, newest adjustment always present', () => {
    let req: PlanRequest = { ...REQ, preferences: 'x'.repeat(LIMITS.preferences) };
    for (let turn = 1; turn <= 6; turn++) {
      const text = `turn ${turn} ${'y'.repeat(150)}`;
      req = applyRefinement(req, text, TODAY).request;
      expect(req.preferences!.length).toBeLessThanOrEqual(LIMITS.preferences);
      expect(req.preferences).toContain(`Adjustment requested: turn ${turn}`);
    }
    // Only the most recent adjustments are carried, oldest dropped first.
    expect(req.preferences).not.toContain('turn 1 ');
  });

  it('does not mistake wishes for numbers', () => {
    const { request, changes } = applyRefinement(
      REQ,
      'more budget-friendly, add a mehndi night',
      TODAY,
    );
    expect(request.budget).toBe(REQ.budget);
    expect(request.guests).toBe(REQ.guests);
    expect(changes.map((c) => c.field)).toEqual(['wishes']);
  });

  it('always carries the sentence to the model as a labelled adjustment', () => {
    const { request } = applyRefinement(REQ, 'add a mehndi night', TODAY);
    expect(request.preferences).toBe('Vegetarian only.\nAdjustment requested: add a mehndi night');
    const noWishes = applyRefinement({ ...REQ, preferences: null }, 'add a mehndi night', TODAY);
    expect(noWishes.request.preferences).toBe('Adjustment requested: add a mehndi night');
  });

  it('reports no numeric change when the number is unchanged', () => {
    const { changes } = applyRefinement(REQ, '250 guests, simpler decor', TODAY);
    expect(changes.map((c) => c.field)).toEqual(['wishes']);
  });

  it('rejects out-of-range numbers with the field named', () => {
    expect(() => applyRefinement(REQ, 'budget 500', TODAY)).toThrow(InputError);
    expect(() => applyRefinement(REQ, '9000 guests', TODAY)).toThrow(/Guests must be/);
  });

  it('rejects an empty, non-string or over-long change', () => {
    expect(() => applyRefinement(REQ, '', TODAY)).toThrow(/would like to change/);
    expect(() => applyRefinement(REQ, 42, TODAY)).toThrow(InputError);
    expect(() => applyRefinement(REQ, 'x'.repeat(LIMITS.refine + 1), TODAY)).toThrow(/under/);
  });

  it('does not mutate the original request', () => {
    const before = { ...REQ };
    applyRefinement(REQ, 'budget 12 lakh, 300 guests', TODAY);
    expect(REQ).toEqual(before);
  });
});

describe('splitWishes / assembleWishes', () => {
  it('round-trips a brief with adjustments', () => {
    const s = splitWishes('Vegetarian.\nAdjustment requested: a\nAdjustment requested: b');
    expect(s).toEqual({ base: 'Vegetarian.', adjustments: ['a', 'b'] });
    expect(assembleWishes(s.base, s.adjustments)).toBe(
      'Vegetarian.\nAdjustment requested: a\nAdjustment requested: b',
    );
  });

  it('handles no wishes at all', () => {
    expect(splitWishes(null)).toEqual({ base: null, adjustments: [] });
    expect(assembleWishes(null, ['only'])).toBe('Adjustment requested: only');
  });

  it('shortens the original wishes only after older adjustments are gone', () => {
    const out = assembleWishes('w'.repeat(590), ['first', 'second', 'third'], 600);
    expect(out.length).toBeLessThanOrEqual(600);
    expect(out).toContain('Adjustment requested: third');
    expect(out).not.toContain('first');
  });
});
