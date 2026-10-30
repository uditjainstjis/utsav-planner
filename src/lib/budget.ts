import { OCCASION_LABEL, rupees, type EventType } from '../shared/constants';
import { apportion } from './apportion';
import { TEMPLATES } from './budget-data';
import type { Budget, BudgetFlag, BudgetLine } from './types';

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
  const cateringPerGuest = lines.find((l) => l.id === 'catering')?.perGuest;
  if (perGuest < floor.total) {
    return [
      {
        code: 'tight_total',
        message:
          `At ${rupees(perGuest)} per guest this is tight for a ${OCCASION_LABEL[eventType].toLowerCase()}. ` +
          `Fewer guests, a simpler venue, or a budget nearer ${rupees(floor.total * guests)} would give room to breathe.`,
      },
    ];
  }
  if (typeof cateringPerGuest === 'number' && cateringPerGuest < floor.catering) {
    return [
      {
        code: 'tight_catering',
        message:
          `Catering works out to ${rupees(cateringPerGuest)} a head. ` +
          `Below about ${rupees(floor.catering)} the menu gets thin — consider moving a little from decor or entertainment.`,
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

/**
 * Build the budget for an occasion.
 *
 * @param eventType which template to use
 * @param total     the user's whole-rupee budget (already validated)
 * @param guests    headcount (already validated, ≥ 1)
 */
export function buildBudget(eventType: EventType, total: number, guests: number): Budget {
  const t = TEMPLATES[eventType];
  const lines: BudgetLine[] = apportion<(typeof t.lines)[number]>(total, t.lines).map(
    ({ item, amount }) => ({
      id: item.id,
      label: item.label,
      share: item.share,
      amount,
      perGuest: item.scalesWithGuests ? Math.round(amount / guests) : null,
    }),
  );

  const perGuest = Math.round(total / guests);
  return {
    currency: 'INR',
    total,
    perGuest,
    lines,
    flags: flagsFor(eventType, guests, perGuest, lines),
  };
}
