import type { EventType } from '../shared/constants';
import type { BudgetLineId } from './budget-data';
import type { Idea } from './types';

/** A generic idea for occasion `E`, drawing on a line of `E`'s own budget. */
type FallbackIdea<E extends EventType> = Omit<Idea, 'budgetLineId'> & {
  budgetLineId: BudgetLineId<E> | null;
};

/** The generic ideas for each occasion. */
export const IDEAS: { readonly [E in EventType]: readonly FallbackIdea<E>[] } = {
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
