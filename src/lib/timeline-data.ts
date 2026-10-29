import type { EventType } from '../shared/constants';
import type { Phase } from './types';
import type { VendorId } from './vendors-data';

/**
 * The milestone templates: for each occasion, the ideal lead time in days and
 * every step, counted back from the event day.
 */

interface Step<E extends EventType> {
  id: string;
  title: string;
  phase: Phase;
  daysBefore: number;
  /** The vendor on this occasion's checklist that this step books. */
  vendorId?: VendorId<E>;
}

/** Each occasion's ideal lead time and its steps. */
export const STEPS: { readonly [E in EventType]: { ideal: number; steps: readonly Step<E>[] } } = {
  wedding: {
    ideal: 180,
    steps: [
      {
        id: 'brief',
        title: 'Agree the budget, guest list and dates with both families',
        phase: 'foundation',
        daysBefore: 180,
      },
      {
        id: 'venue',
        title: 'Book the venue and mandap',
        phase: 'booking',
        daysBefore: 150,
        vendorId: 'venue',
      },
      {
        id: 'caterer',
        title: 'Book the caterer and agree a sample menu',
        phase: 'booking',
        daysBefore: 135,
        vendorId: 'caterer',
      },
      {
        id: 'photo',
        title: 'Book photographer and videographer',
        phase: 'booking',
        daysBefore: 120,
        vendorId: 'photographer',
      },
      {
        id: 'decor',
        title: 'Book the decorator; brief the theme',
        phase: 'booking',
        daysBefore: 100,
        vendorId: 'decorator',
      },
      {
        id: 'attire',
        title: 'Order outfits; book makeup and mehndi artists',
        phase: 'booking',
        daysBefore: 90,
        vendorId: 'attire',
      },
      {
        id: 'music',
        title: 'Book DJ, band or dhol for sangeet and baraat',
        phase: 'booking',
        daysBefore: 75,
        vendorId: 'entertainment',
      },
      {
        id: 'invites',
        title: 'Send invitations and open RSVPs',
        phase: 'details',
        daysBefore: 60,
        vendorId: 'invitations',
      },
      {
        id: 'travel',
        title: 'Arrange guest transport and stay',
        phase: 'details',
        daysBefore: 45,
        vendorId: 'logistics',
      },
      {
        id: 'tasting',
        title: 'Menu tasting; lock the final menu',
        phase: 'details',
        daysBefore: 30,
      },
      {
        id: 'headcount',
        title: 'Give the caterer the final headcount',
        phase: 'final',
        daysBefore: 14,
      },
      {
        id: 'confirm',
        title: 'Reconfirm every vendor: times, payments, contacts',
        phase: 'final',
        daysBefore: 7,
      },
      {
        id: 'runsheet',
        title: 'Share the run-of-day sheet with family and vendors',
        phase: 'final',
        daysBefore: 3,
      },
      { id: 'day', title: 'Wedding day', phase: 'event', daysBefore: 0 },
    ],
  },
  birthday: {
    ideal: 45,
    steps: [
      {
        id: 'brief',
        title: 'Pick a theme, guest list and budget',
        phase: 'foundation',
        daysBefore: 45,
      },
      {
        id: 'venue',
        title: 'Book the venue or plan the home setup',
        phase: 'booking',
        daysBefore: 35,
        vendorId: 'venue',
      },
      {
        id: 'invites',
        title: 'Send invitations',
        phase: 'details',
        daysBefore: 21,
        vendorId: 'favours',
      },
      {
        id: 'cake',
        title: 'Order the cake and book food',
        phase: 'booking',
        daysBefore: 21,
        vendorId: 'caterer',
      },
      {
        id: 'decor',
        title: 'Order decor and theme supplies',
        phase: 'booking',
        daysBefore: 18,
        vendorId: 'decorator',
      },
      {
        id: 'fun',
        title: 'Book entertainer or plan games and music',
        phase: 'booking',
        daysBefore: 14,
        vendorId: 'entertainment',
      },
      {
        id: 'photo',
        title: 'Book a photographer, or brief a friend with a good phone',
        phase: 'booking',
        daysBefore: 12,
        vendorId: 'photographer',
      },
      { id: 'favours', title: 'Buy return gifts', phase: 'details', daysBefore: 10 },
      {
        id: 'headcount',
        title: 'Confirm headcount with the caterer',
        phase: 'final',
        daysBefore: 5,
      },
      {
        id: 'confirm',
        title: 'Reconfirm vendors and collect the cake order slip',
        phase: 'final',
        daysBefore: 2,
      },
      { id: 'day', title: 'Party day', phase: 'event', daysBefore: 0 },
    ],
  },
  community: {
    ideal: 90,
    steps: [
      {
        id: 'brief',
        title: 'Set the goal, committee, budget and date',
        phase: 'foundation',
        daysBefore: 90,
      },
      {
        id: 'venue',
        title: 'Secure the venue and apply for permits',
        phase: 'booking',
        daysBefore: 75,
        vendorId: 'venue',
      },
      {
        id: 'sponsors',
        title: 'Approach sponsors and local businesses',
        phase: 'foundation',
        daysBefore: 60,
      },
      {
        id: 'stage',
        title: 'Book stage, sound and lighting',
        phase: 'booking',
        daysBefore: 45,
        vendorId: 'stage',
      },
      {
        id: 'volunteers',
        title: 'Recruit and assign volunteers',
        phase: 'details',
        daysBefore: 40,
        vendorId: 'volunteers',
      },
      {
        id: 'marketing',
        title: 'Posters, social posts and local announcements',
        phase: 'details',
        daysBefore: 35,
        vendorId: 'marketing',
      },
      {
        id: 'caterer',
        title: 'Book food and water supply',
        phase: 'booking',
        daysBefore: 30,
        vendorId: 'caterer',
      },
      {
        id: 'safety',
        title: 'Arrange first aid, security and insurance',
        phase: 'details',
        daysBefore: 21,
        vendorId: 'safety',
      },
      {
        id: 'performers',
        title: 'Confirm performers and activity leads',
        phase: 'details',
        daysBefore: 14,
        vendorId: 'entertainment',
      },
      {
        id: 'runsheet',
        title: 'Final run sheet and volunteer briefing',
        phase: 'final',
        daysBefore: 7,
      },
      { id: 'setup', title: 'Setup day: stage, signage, stalls', phase: 'final', daysBefore: 1 },
      { id: 'day', title: 'Event day', phase: 'event', daysBefore: 0 },
    ],
  },
};
