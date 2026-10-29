import { describe, expect, it } from 'vitest';
import { applyRefinement } from '../src/lib/refine/apply';
import { parseDate } from '../src/lib/refine/dates';
import type { PlanRequest } from '../src/lib/types';
import { InputError } from '../src/lib/validate';

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

describe('dates in a refinement', () => {
  it.each([
    ['move it to 2027-05-01', '2027-05-01'],
    ['15 March 2027 works better', '2027-03-15'],
    ['March 15, 2027', '2027-03-15'],
    ['on the 3rd Nov', '2026-11-03'],
    ['Dec 20', '2026-12-20'],
    ['in 3 weeks', '2026-11-13'],
    ['in 10 days', '2026-11-02'],
    ['in 2 months', '2026-12-23'],
  ])('reads "%s" as %s', (text, iso) => {
    const { request, changes } = applyRefinement(REQ, text, TODAY);
    expect(request.eventDate).toBe(iso);
    expect(changes.find((c) => c.field === 'date')).toMatchObject({ from: '2027-03-20', to: iso });
  });

  it('reads a month alone and keeps the current day of month', () => {
    const { request, changes } = applyRefinement(
      { ...REQ, eventDate: '2027-05-20' },
      'move it to March',
      TODAY,
    );
    expect(request.eventDate).toBe('2027-03-20');
    expect(changes.find((c) => c.field === 'date')).toMatchObject({
      from: '2027-05-20',
      to: '2027-03-20',
    });
  });

  it('keeps the day of month when only a month is named, clamped to the month', () => {
    const feb = applyRefinement({ ...REQ, eventDate: '2027-03-31' }, 'to February', TODAY);
    expect(feb.request.eventDate).toBe('2027-02-28');
  });

  it('never reads a date out of a headcount or an amount', () => {
    expect(parseDate('300 guests and 12 lakh', REQ.eventDate, TODAY)).toBeNull();
    expect(parseDate('just 15 kids', REQ.eventDate, TODAY)).toBeNull();
    const both = applyRefinement(REQ, 'budget 12 lakh, 300 guests, 15 March 2027', TODAY);
    expect(both.request).toMatchObject({ budget: 1_200_000, guests: 300, eventDate: '2027-03-15' });
    expect(both.changes.map((c) => c.field)).toEqual(['budget', 'guests', 'date', 'wishes']);
  });

  it('rejects a past or impossible date, naming the refine field', () => {
    expect(() => applyRefinement(REQ, 'move it to 2020-01-01', TODAY)).toThrow(/in the past/);
    expect(() => applyRefinement(REQ, '2027-02-30 maybe', TODAY)).toThrow(/does not exist/);
    try {
      applyRefinement(REQ, 'move it to 2020-01-01', TODAY);
    } catch (err) {
      expect((err as InputError).field).toBe('refine');
    }
  });

  it('reports no date change when the date is unchanged', () => {
    const { changes } = applyRefinement(REQ, '20 March 2027, simpler decor', TODAY);
    expect(changes.map((c) => c.field)).toEqual(['wishes']);
  });
});

describe('month names in a refinement', () => {
  it.each([
    'spend less on decor',
    'more for marketing',
    'add 2 marquees',
    'cheaper decorations',
    'a marching band',
    'junk food',
    'augment the budget',
    'octagonal tent',
    'novel theme',
    'maybe',
    "mayor's visit",
    // The same words where the old prefix match fired: after "to/in/for/on",
    // or next to a day number.
    'spend on decorations',
    'decorations 2 lakh',
    'hire 2 marching bands',
    'cut down on junk food',
    'we need to augment the budget',
    'switch to octagonal tents',
    '2 octagonal tents',
    'go for novel theme ideas',
    'maybe 30 guests',
    "time for mayor's speech",
  ])('reads no date from "%s"', (text) => {
    expect(parseDate(text, REQ.eventDate, TODAY)).toBeNull();
    const { request, changes } = applyRefinement(REQ, text, TODAY);
    expect(request.eventDate).toBe(REQ.eventDate);
    expect(changes.map((c) => c.field)).not.toContain('date');
  });

  it('leaves the numbers next to a month-like word to the number parsers', () => {
    expect(applyRefinement(REQ, 'decorations 2 lakh', TODAY).request.budget).toBe(200_000);
    expect(applyRefinement(REQ, 'maybe 30 guests', TODAY).request.guests).toBe(30);
  });

  it.each([
    ['5 Sept', '2027-09-05'],
    ['Sept 5', '2027-09-05'],
    ['september 3', '2027-09-03'],
    ['15 Mar. 2027', '2027-03-15'],
    ['Dec. 20', '2026-12-20'],
    ['1st june', '2027-06-01'],
    ['July 4th', '2027-07-04'],
    ['2 may', '2027-05-02'],
  ])('still reads a real month name in "%s"', (text, iso) => {
    expect(parseDate(text, REQ.eventDate, TODAY)?.iso).toBe(iso);
  });

  it.each([
    ['move it to Jun', '2027-06-20'],
    ['in August', '2027-08-20'],
    ['to may', '2027-05-20'],
    ['for nov.', '2026-11-20'],
  ])('still reads a month alone in "%s"', (text, iso) => {
    expect(parseDate(text, REQ.eventDate, TODAY)?.iso).toBe(iso);
  });
});
