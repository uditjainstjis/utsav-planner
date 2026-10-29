import { OCCASION_LABEL } from '../../public/js/shared.js';
import type { EventType, Idea, Personalisation, Plan } from './types';

/**
 * Deterministic personalisation, for when no model answers.
 *
 * A plan must never ship without ideas, questions and notes merely because a
 * model timed out. This module produces sensible, generic guidance from the
 * occasion type and the computed budget — clearly labelled as such in the UI
 * (`source: 'fallback'`), so the user knows the ideas are general guidance
 * rather than written for their wishes.
 */

const IDEAS: Readonly<Record<EventType, readonly Idea[]>> = {
  wedding: [
    {
      title: 'Marigold and jasmine, not imported blooms',
      detail:
        'Seasonal Indian flowers cost a fraction of orchids and photograph beautifully under warm light.',
      category: 'decor',
      costTier: 'low',
      budgetLineId: 'decor',
    },
    {
      title: 'Live chaat and dosa counters',
      detail:
        'A few live counters feel generous and cut plated-service staff; agree the counter count per 100 guests.',
      category: 'food',
      costTier: 'medium',
      budgetLineId: 'catering',
    },
    {
      title: 'Sangeet with a family playlist',
      detail:
        'Collect one song per household on WhatsApp and hand the list to the DJ — instant participation, no choreographer fee.',
      category: 'activity',
      costTier: 'low',
      budgetLineId: 'entertainment',
    },
    {
      title: 'Digital invitation with an RSVP form',
      detail:
        'A WhatsApp-ready card plus a simple RSVP link gives the caterer a real headcount two weeks out.',
      category: 'invite',
      costTier: 'low',
      budgetLineId: 'invitations',
    },
    {
      title: 'Mithai box favours from a local sweet shop',
      detail: 'Order in bulk a week ahead; a printed thank-you sticker personalises each box.',
      category: 'favour',
      costTier: 'low',
      budgetLineId: 'contingency',
    },
    {
      title: 'One decor focal point',
      detail:
        'Spend the decor budget on the mandap or stage and keep tables simple — guests remember one striking view.',
      category: 'theme',
      costTier: 'medium',
      budgetLineId: 'decor',
    },
  ],
  birthday: [
    {
      title: 'A single strong theme colour',
      detail:
        'Pick one colour for balloons, plates and cake; it looks designed and costs less than a licensed character set.',
      category: 'theme',
      costTier: 'low',
      budgetLineId: 'decor',
    },
    {
      title: 'DIY craft station',
      detail:
        'Paper crowns or mask-decorating keeps children busy for twenty minutes and doubles as the return gift.',
      category: 'activity',
      costTier: 'low',
      budgetLineId: 'entertainment',
    },
    {
      title: 'Mini-meal boxes',
      detail:
        'Pre-packed boxes with a sandwich, fruit and a treat serve faster than a buffet and waste less.',
      category: 'food',
      costTier: 'low',
      budgetLineId: 'catering',
    },
    {
      title: 'Photo wall with a printed banner',
      detail: 'One banner and a few props give every family a picture to take home.',
      category: 'decor',
      costTier: 'low',
      budgetLineId: 'decor',
    },
    {
      title: 'Cake cutting as the finale',
      detail:
        'Schedule the cake forty minutes before the end so everyone is still there and parents can leave on time.',
      category: 'other',
      costTier: 'low',
      budgetLineId: null,
    },
    {
      title: 'Book or seed-packet return gifts',
      detail: 'Lasts longer than plastic and costs about the same.',
      category: 'favour',
      costTier: 'low',
      budgetLineId: 'favours',
    },
  ],
  community: [
    {
      title: 'Local talent stage',
      detail:
        'Invite school groups and neighbourhood performers; they bring their own audience and need only a slot.',
      category: 'activity',
      costTier: 'low',
      budgetLineId: 'entertainment',
    },
    {
      title: 'Sponsored water and first-aid point',
      detail: 'A local clinic or pharmacy will often staff a first-aid desk for a banner credit.',
      category: 'other',
      costTier: 'low',
      budgetLineId: 'safety',
    },
    {
      title: 'Food stalls on a revenue share',
      detail:
        'Let vendors sell at agreed prices instead of paying for catering; keep one free water and snack counter.',
      category: 'food',
      costTier: 'low',
      budgetLineId: 'catering',
    },
    {
      title: 'Bilingual signage',
      detail:
        'Print direction and schedule boards in the local language and English; one design, two prints.',
      category: 'decor',
      costTier: 'low',
      budgetLineId: 'marketing',
    },
    {
      title: 'Volunteer tee-shirts',
      detail:
        'A coloured shirt makes helpers findable from across the ground and costs less than radios.',
      category: 'theme',
      costTier: 'low',
      budgetLineId: 'safety',
    },
    {
      title: 'Community wall',
      detail:
        'A long sheet and markers where people write what the event means to them — free, and a photo for next year’s poster.',
      category: 'activity',
      costTier: 'low',
      budgetLineId: null,
    },
  ],
};

const QUESTION = 'What is included, what costs extra, and by when must we confirm?';

const NOTE: Record<string, string> = {
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
  const lineIds = new Set(budget.lines.map((l) => l.id));
  const ideas = IDEAS[request.eventType].map((i) => ({
    ...i,
    budgetLineId: i.budgetLineId && lineIds.has(i.budgetLineId) ? i.budgetLineId : null,
  }));
  const vendorQuestions: Record<string, string[]> = {};
  for (const v of vendors) vendorQuestions[v.id] = [QUESTION];
  const budgetNotes: Record<string, string> = {};
  for (const l of budget.lines) budgetNotes[l.id] = NOTE[l.id] ?? 'Spend only what the plan needs.';

  return {
    summary:
      `A ${OCCASION_LABEL[request.eventType].toLowerCase()} for ${request.guests} guests at about ₹${budget.perGuest.toLocaleString('en-IN')} a head. ` +
      'The ideas below are general starting points; personalised suggestions were unavailable just now.',
    ideas,
    vendorQuestions,
    budgetNotes,
    source: 'fallback',
    model: null,
    cached: false,
  };
}
