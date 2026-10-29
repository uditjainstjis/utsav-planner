import { describe, expect, it } from 'vitest';
import { LIMITS } from '../src/shared/constants';
import { InputError, validateDate, validatePlanRequest } from '../src/lib/validate';

const TODAY = '2026-10-23';

const GOOD = {
  eventType: 'wedding',
  eventDate: '2027-02-14',
  guests: 250,
  budget: 1_500_000,
  city: 'Jaipur',
  occasion: 'Riya & Arjun',
  preferences: 'Vegetarian only, pastel decor, no fireworks',
};

function fails(body: unknown, code: string, field: string): void {
  try {
    validatePlanRequest(body, TODAY);
  } catch (err) {
    expect(err).toBeInstanceOf(InputError);
    expect((err as InputError).code).toBe(code);
    expect((err as InputError).field).toBe(field);
    return;
  }
  throw new Error('expected validation to fail');
}

describe('validatePlanRequest', () => {
  it('accepts a complete request and normalises it', () => {
    expect(validatePlanRequest(GOOD, TODAY)).toEqual(GOOD);
  });

  it('accepts numbers sent as strings, as HTML forms do', () => {
    const r = validatePlanRequest({ ...GOOD, guests: '250', budget: '1500000' }, TODAY);
    expect(r.guests).toBe(250);
    expect(r.budget).toBe(1_500_000);
  });

  it('treats optional fields as null when absent or blank', () => {
    const r = validatePlanRequest(
      { eventType: 'birthday', eventDate: '2026-12-01', guests: 20, budget: 15000, city: '' },
      TODAY,
    );
    expect(r.city).toBeNull();
    expect(r.occasion).toBeNull();
    expect(r.preferences).toBeNull();
  });

  it('rejects a body that is not an object', () => {
    fails(null, 'type', 'body');
    fails([], 'type', 'body');
    fails('wedding', 'type', 'body');
  });

  it('rejects an unknown occasion', () => {
    fails({ ...GOOD, eventType: 'funeral' }, 'invalid', 'eventType');
    fails({ ...GOOD, eventType: 1 }, 'invalid', 'eventType');
  });

  it('bounds guests and budget, naming the field', () => {
    fails({ ...GOOD, guests: 0 }, 'range', 'guests');
    fails({ ...GOOD, guests: LIMITS.guests.max + 1 }, 'range', 'guests');
    fails({ ...GOOD, guests: 'many' }, 'type', 'guests');
    fails({ ...GOOD, budget: 999 }, 'range', 'budget');
    fails({ ...GOOD, budget: Infinity }, 'type', 'budget');
  });

  it('rounds a fractional headcount rather than rejecting it', () => {
    expect(validatePlanRequest({ ...GOOD, guests: 24.6 }, TODAY).guests).toBe(25);
  });

  it('caps text fields and strips control characters', () => {
    fails({ ...GOOD, city: 'x'.repeat(LIMITS.city + 1) }, 'too_long', 'city');
    fails({ ...GOOD, preferences: 'x'.repeat(LIMITS.preferences + 1) }, 'too_long', 'preferences');
    const r = validatePlanRequest({ ...GOOD, occasion: 'Riya\u0000 &\u001f Arjun' }, TODAY);
    expect(r.occasion).toBe('Riya & Arjun');
  });

  it('rejects non-string text', () => {
    fails({ ...GOOD, city: 42 }, 'type', 'city');
  });
});

describe('validateDate', () => {
  it('requires YYYY-MM-DD', () => {
    expect(() => validateDate('14/02/2027', TODAY)).toThrow(/YYYY-MM-DD/);
    expect(() => validateDate(20270214, TODAY)).toThrow(InputError);
  });

  it('rejects a date that does not exist instead of rolling it over', () => {
    expect(() => validateDate('2027-02-30', TODAY)).toThrow(/does not exist/);
    expect(() => validateDate('2027-13-01', TODAY)).toThrow(/does not exist/);
  });

  it('accepts today and rejects yesterday', () => {
    expect(validateDate(TODAY, TODAY)).toBe(TODAY);
    expect(() => validateDate('2026-10-22', TODAY)).toThrow(/in the past/);
  });

  it('allows up to two years ahead and no further', () => {
    expect(validateDate('2028-10-22', TODAY)).toBe('2028-10-22'); // 730 days
    expect(() => validateDate('2028-10-23', TODAY)).toThrow(/two years/);
  });
});
