import type { Budget, BudgetFlag, BudgetLine, EventType } from './types';

/**
 * Budget allocation.
 *
 * Pure arithmetic, no model. The split for each occasion is a set of shares
 * drawn from how Indian celebrations typically spend — catering dominates a
 * wedding, cake and entertainment dominate a child's birthday, stage and
 * permits appear only for a community event — and the user's total is divided
 * along those shares. Rounding is reconciled by largest remainder so the lines
 * always sum to exactly the amount the user typed: a budget whose parts do not
 * add up to its total is the first thing a reader distrusts.
 *
 * Per-guest floors flag a plan that cannot feed people at the headcount given.
 * The figures are deliberately conservative; the message says what to change,
 * not that the plan is impossible.
 */

interface Template {
  /** Shares in allocation order; they sum to 1. */
  lines: ReadonlyArray<{ id: string; label: string; share: number; scalesWithGuests: boolean }>;
  /** Minimum sensible rupees per guest, overall and for catering alone. */
  floor: { total: number; catering: number };
}

const TEMPLATES: Readonly<Record<EventType, Template>> = {
  wedding: {
    lines: [
      { id: 'venue', label: 'Venue & mandap', share: 0.22, scalesWithGuests: false },
      { id: 'catering', label: 'Catering & beverages', share: 0.33, scalesWithGuests: true },
      { id: 'decor', label: 'Decor & flowers', share: 0.12, scalesWithGuests: false },
      { id: 'photography', label: 'Photography & video', share: 0.08, scalesWithGuests: false },
      { id: 'attire', label: 'Outfits, jewellery & makeup', share: 0.08, scalesWithGuests: false },
      { id: 'entertainment', label: 'Music, DJ & sangeet', share: 0.05, scalesWithGuests: false },
      { id: 'invitations', label: 'Invitations & stationery', share: 0.02, scalesWithGuests: true },
      { id: 'logistics', label: 'Transport & guest stay', share: 0.05, scalesWithGuests: true },
      {
        id: 'contingency',
        label: 'Contingency (keep aside)',
        share: 0.05,
        scalesWithGuests: false,
      },
    ],
    floor: { total: 1500, catering: 600 },
  },
  birthday: {
    lines: [
      { id: 'venue', label: 'Venue or home setup', share: 0.2, scalesWithGuests: false },
      { id: 'catering', label: 'Food, drinks & cake', share: 0.38, scalesWithGuests: true },
      { id: 'decor', label: 'Decor & theme supplies', share: 0.14, scalesWithGuests: false },
      {
        id: 'entertainment',
        label: 'Games, music & entertainer',
        share: 0.12,
        scalesWithGuests: false,
      },
      { id: 'photography', label: 'Photography', share: 0.04, scalesWithGuests: false },
      { id: 'favours', label: 'Invitations & return gifts', share: 0.07, scalesWithGuests: true },
      {
        id: 'contingency',
        label: 'Contingency (keep aside)',
        share: 0.05,
        scalesWithGuests: false,
      },
    ],
    floor: { total: 400, catering: 250 },
  },
  community: {
    lines: [
      { id: 'venue', label: 'Venue, permits & power', share: 0.22, scalesWithGuests: false },
      { id: 'catering', label: 'Food & water', share: 0.28, scalesWithGuests: true },
      { id: 'stage', label: 'Stage, sound & lighting', share: 0.15, scalesWithGuests: false },
      { id: 'decor', label: 'Decor, banners & signage', share: 0.08, scalesWithGuests: false },
      {
        id: 'marketing',
        label: 'Posters, social & printing',
        share: 0.07,
        scalesWithGuests: false,
      },
      {
        id: 'safety',
        label: 'Safety, first aid & volunteers',
        share: 0.08,
        scalesWithGuests: true,
      },
      {
        id: 'entertainment',
        label: 'Performers & activities',
        share: 0.07,
        scalesWithGuests: false,
      },
      {
        id: 'contingency',
        label: 'Contingency (keep aside)',
        share: 0.05,
        scalesWithGuests: false,
      },
    ],
    floor: { total: 200, catering: 120 },
  },
};

/**
 * Split `total` along `shares` into whole rupees that sum to exactly `total`.
 *
 * Largest-remainder (Hamilton) apportionment: floor every line, then hand the
 * leftover rupees, one each, to the lines that lost the most to flooring.
 * Exported for the test suite, which checks the invariant directly.
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

/**
 * Build the budget for an occasion.
 *
 * @param eventType which template to use
 * @param total     the user's whole-rupee budget (already validated)
 * @param guests    headcount (already validated, ≥ 1)
 */
export function buildBudget(eventType: EventType, total: number, guests: number): Budget {
  const t = TEMPLATES[eventType];
  const amounts = apportion(
    total,
    t.lines.map((l) => l.share),
  );
  const lines: BudgetLine[] = t.lines.map((l, i) => {
    const amount = amounts[i] ?? 0;
    return {
      id: l.id,
      label: l.label,
      share: l.share,
      amount,
      perGuest: l.scalesWithGuests ? Math.round(amount / guests) : null,
    };
  });

  const perGuest = Math.round(total / guests);
  return {
    currency: 'INR',
    total,
    perGuest,
    lines,
    flags: flagsFor(eventType, guests, perGuest, lines),
  };
}

/**
 * The one warning, if any, a budget earns: thin overall, thin for food, or
 * comfortable. Every template has a `catering` line, which the second reads.
 */
function flagsFor(
  eventType: EventType,
  guests: number,
  perGuest: number,
  lines: readonly BudgetLine[],
): BudgetFlag[] {
  const { floor } = TEMPLATES[eventType];
  const cateringPerGuest = lines.find((l) => l.id === 'catering')?.perGuest ?? null;
  if (perGuest < floor.total) {
    const enough = (floor.total * guests).toLocaleString('en-IN');
    return [
      {
        code: 'tight_total',
        message:
          `At ₹${perGuest.toLocaleString('en-IN')} per guest this is tight for a ${eventType}. ` +
          `Fewer guests, a simpler venue, or a budget nearer ₹${enough} would give room to breathe.`,
      },
    ];
  }
  if (cateringPerGuest !== null && cateringPerGuest < floor.catering) {
    return [
      {
        code: 'tight_catering',
        message:
          `Catering works out to ₹${cateringPerGuest.toLocaleString('en-IN')} a head. ` +
          `Below about ₹${floor.catering} the menu gets thin — consider moving a little from decor or entertainment.`,
      },
    ];
  }
  if (perGuest < floor.total * 6) return [];
  return [
    {
      code: 'generous',
      message:
        'This budget is comfortable for the headcount. The shares below are a starting point; ' +
        'it is normal to move money towards whatever matters most to you.',
    },
  ];
}
