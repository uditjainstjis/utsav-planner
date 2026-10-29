import type { EventType } from '../shared/constants';

/** The budget templates: for each occasion, its lines with their shares, and the per-guest floors. */

interface Template {
  /** Shares in allocation order; they sum to 1. */
  lines: readonly { id: string; label: string; share: number; scalesWithGuests: boolean }[];
  /** Minimum sensible rupees per guest, overall and for catering alone. */
  floor: { total: number; catering: number };
}

/** Every occasion keeps the same share aside, as its last line. */
const CONTINGENCY = {
  id: 'contingency',
  label: 'Contingency (keep aside)',
  share: 0.05,
  scalesWithGuests: false,
} as const;

export const TEMPLATES = {
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
      CONTINGENCY,
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
      CONTINGENCY,
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
      CONTINGENCY,
    ],
    floor: { total: 200, catering: 120 },
  },
} as const satisfies Readonly<Record<EventType, Template>>;

/**
 * A budget line id, read off the templates: of occasion `E`'s budget when `E`
 * is given, else of any. Vendors, milestones and ideas name lines by this
 * type, so a reference to a line the occasion does not have fails to compile.
 */
export type BudgetLineId<E extends EventType = EventType> =
  (typeof TEMPLATES)[E]['lines'][number]['id'];
