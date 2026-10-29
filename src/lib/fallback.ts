import { OCCASION_LABEL, rupees } from '../shared/constants';
import type { BudgetLineId } from './budget';
import { IDEAS } from './fallback-data';
import type { Personalisation, Plan } from './types';

/**
 * Deterministic personalisation, for when no model answers.
 *
 * A plan must never ship without ideas, questions and notes merely because a
 * model timed out. This module produces sensible, generic guidance from the
 * occasion type and the computed budget. `sources` labels every section
 * `fallback`, and the page says so, so the user knows it is general guidance
 * rather than written for their wishes.
 */

const QUESTION = 'What is included, what costs extra, and by when must we confirm?';

const NOTE: Readonly<Record<BudgetLineId, string>> = {
  venue:
    'Spend here if the location is the memory; otherwise a simpler space and better food wins.',
  catering: 'Protect this line — guests forgive plain decor, not a thin plate.',
  decor: 'One focal point well done beats many small touches.',
  photography: 'Good coverage of two hours beats average coverage of eight.',
  attire: 'Rent or borrow for everything worn once.',
  entertainment: 'A playlist and a good speaker covers most of the evening.',
  invitations: 'Digital first; print only for elders who will keep the card.',
  logistics: 'Shared transport saves money and gets everyone there on time.',
  favours: 'Useful beats shiny.',
  stage: 'Sound matters more than lights; spend on the engineer.',
  marketing: 'Local WhatsApp groups reach more people than posters.',
  safety: 'Never trim this — it is what lets everything else run.',
  contingency: 'Leave it untouched until the week of the event.',
};

/** Build generic guidance for a plan, with no model involved. */
export function fallbackPersonalisation(plan: Plan): Personalisation {
  const { request, budget, vendors } = plan;
  const vendorQuestions: Record<string, string[]> = {};
  for (const v of vendors) vendorQuestions[v.id] = [QUESTION];
  const budgetNotes: Record<string, string> = {};
  for (const l of budget.lines) budgetNotes[l.id] = NOTE[l.id];

  return {
    summary:
      `A ${OCCASION_LABEL[request.eventType].toLowerCase()} for ${request.guests} guests at about ${rupees(budget.perGuest)} a head. ` +
      'The ideas below are general starting points; personalised ideas were unavailable just now.',
    ideas: [...IDEAS[request.eventType]],
    vendorQuestions,
    budgetNotes,
    sources: { ideas: 'fallback', vendorQuestions: 'fallback', budgetNotes: 'fallback' },
    model: null,
    cached: false,
  };
}
