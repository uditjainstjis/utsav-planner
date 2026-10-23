import { describe, expect, it } from 'vitest';
import { applyRefinement, MAX_REFINE_CHARS } from '../src/lib/refine';
import { InputError } from '../src/lib/validate';
import type { PlanRequest } from '../src/lib/types';

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
  ])('reads a budget from "%s"', (text, expected) => {
    const { request, changes } = applyRefinement(REQ, text);
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
    const { request, changes } = applyRefinement(REQ, text);
    expect(request.guests).toBe(expected);
    expect(changes.find((c) => c.field === 'guests')).toMatchObject({
      from: '250',
      to: String(expected),
    });
  });

  it('reads both at once', () => {
    const { request } = applyRefinement(REQ, 'budget 12 lakh and 300 guests');
    expect(request.budget).toBe(1_200_000);
    expect(request.guests).toBe(300);
  });

  it('does not confuse a headcount with a budget', () => {
    const { request } = applyRefinement(REQ, '300 guests');
    expect(request.budget).toBe(REQ.budget);
  });

  it('does not mistake wishes for numbers', () => {
    const { request, changes } = applyRefinement(REQ, 'more budget-friendly, add a mehndi night');
    expect(request.budget).toBe(REQ.budget);
    expect(request.guests).toBe(REQ.guests);
    expect(changes.map((c) => c.field)).toEqual(['wishes']);
  });

  it('always carries the sentence to the model as a labelled adjustment', () => {
    const { request } = applyRefinement(REQ, 'add a mehndi night');
    expect(request.preferences).toBe('Vegetarian only.\nAdjustment requested: add a mehndi night');
    const noWishes = applyRefinement({ ...REQ, preferences: null }, 'add a mehndi night');
    expect(noWishes.request.preferences).toBe('Adjustment requested: add a mehndi night');
  });

  it('reports no numeric change when the number is unchanged', () => {
    const { changes } = applyRefinement(REQ, '250 guests, simpler decor');
    expect(changes.map((c) => c.field)).toEqual(['wishes']);
  });

  it('rejects out-of-range numbers with the field named', () => {
    expect(() => applyRefinement(REQ, 'budget 500')).toThrow(InputError);
    expect(() => applyRefinement(REQ, '9000 guests')).toThrow(/Guests must be/);
  });

  it('rejects an empty, non-string or over-long change', () => {
    expect(() => applyRefinement(REQ, '')).toThrow(/would like to change/);
    expect(() => applyRefinement(REQ, 42)).toThrow(InputError);
    expect(() => applyRefinement(REQ, 'x'.repeat(MAX_REFINE_CHARS + 1))).toThrow(/under/);
  });

  it('does not mutate the original request', () => {
    const before = { ...REQ };
    applyRefinement(REQ, 'budget 12 lakh, 300 guests');
    expect(REQ).toEqual(before);
  });
});
