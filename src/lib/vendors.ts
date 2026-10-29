import { bookByFor } from './timeline';
import type { EventType, Timeline, VendorItem } from './types';

/**
 * Vendor checklist.
 *
 * Which vendors an occasion needs, which budget line pays each one, and the
 * questions worth asking before money changes hands. Book-by dates come from
 * the timeline, so the checklist and the calendar can never disagree.
 *
 * The questions here are the deterministic baseline — the ones every planner
 * should ask regardless of theme. The model adds a few that depend on the
 * user's stated preferences (a vegetarian-only kitchen, an outdoor venue in
 * monsoon), which arrive separately and are merged in the UI.
 */

interface VendorTemplate {
  id: string;
  label: string;
  budgetLineId: string;
  questions: readonly string[];
}

const VENDORS: Readonly<Record<EventType, readonly VendorTemplate[]>> = {
  wedding: [
    {
      id: 'venue',
      label: 'Venue',
      budgetLineId: 'venue',
      questions: [
        'What is included in the hire — chairs, stage, basic lighting, power backup?',
        'What are the overtime charges and the latest end time permitted?',
        'Is there a wet-weather plan for outdoor areas?',
      ],
    },
    {
      id: 'caterer',
      label: 'Caterer',
      budgetLineId: 'catering',
      questions: [
        'Is the quote per plate or per guest, and does it include service staff and crockery?',
        'What is the cut-off date for the final headcount, and what happens if numbers change after it?',
        'Can we taste the menu before confirming?',
      ],
    },
    {
      id: 'decorator',
      label: 'Decorator',
      budgetLineId: 'decor',
      questions: [
        'Are fresh flowers or artificial, and what is the price difference?',
        'When does setup start, and is dismantling included?',
        'Can we see photos of the same venue decorated before?',
      ],
    },
    {
      id: 'photographer',
      label: 'Photographer & videographer',
      budgetLineId: 'photography',
      questions: [
        'How many hours and how many people are included?',
        'When do we receive edited photos and the film, and in what format?',
        'Who owns the raw files?',
      ],
    },
    {
      id: 'attire',
      label: 'Outfits, makeup & mehndi',
      budgetLineId: 'attire',
      questions: [
        'How many fittings are included, and by when must measurements be final?',
        'Does the makeup quote cover a trial and travel to the venue?',
      ],
    },
    {
      id: 'entertainment',
      label: 'Music & entertainment',
      budgetLineId: 'entertainment',
      questions: [
        'Is sound equipment included, or do we hire it separately?',
        'What is the backup if a performer falls ill?',
      ],
    },
    {
      id: 'invitations',
      label: 'Invitations',
      budgetLineId: 'invitations',
      questions: [
        'What is the turnaround time from final proof to delivery?',
        'Is a digital version included for WhatsApp?',
      ],
    },
    {
      id: 'logistics',
      label: 'Transport & guest stay',
      budgetLineId: 'logistics',
      questions: [
        'Is there a group rate, and what is the cancellation policy?',
        'Who coordinates pickups on the day?',
      ],
    },
  ],
  birthday: [
    {
      id: 'venue',
      label: 'Venue',
      budgetLineId: 'venue',
      questions: [
        'How many hours are included and what does extra time cost?',
        'Can we bring our own cake and decorations?',
        'Is there a safe play area for children?',
      ],
    },
    {
      id: 'caterer',
      label: 'Cake & food',
      budgetLineId: 'catering',
      questions: [
        'Can the cake be made without nuts or eggs if a guest needs it?',
        'Is delivery included, and at what time will it arrive?',
        'Are kids’ portions priced separately?',
      ],
    },
    {
      id: 'decorator',
      label: 'Decor',
      budgetLineId: 'decor',
      questions: [
        'Does the price include setup and takedown?',
        'Can the theme colours be matched exactly?',
      ],
    },
    {
      id: 'entertainment',
      label: 'Entertainer',
      budgetLineId: 'entertainment',
      questions: [
        'What age range is the act suited to, and how long is the set?',
        'Do they bring their own sound and props?',
      ],
    },
    {
      id: 'photographer',
      label: 'Photographer',
      budgetLineId: 'photography',
      questions: ['How soon will we get the edited photos?'],
    },
    {
      id: 'favours',
      label: 'Invitations & return gifts',
      budgetLineId: 'favours',
      questions: ['Is there a minimum order quantity?', 'Can gifts be personalised with names?'],
    },
  ],
  community: [
    {
      id: 'venue',
      label: 'Venue & permits',
      budgetLineId: 'venue',
      questions: [
        'Which permissions are needed — police, municipal, fire, sound — and who applies?',
        'Is power, water and toilet access included?',
        'What is the maximum permitted crowd?',
      ],
    },
    {
      id: 'caterer',
      label: 'Food & water',
      budgetLineId: 'catering',
      questions: [
        'Is the vendor licensed, and will food be served hot throughout?',
        'How is drinking water provided and in what quantity?',
      ],
    },
    {
      id: 'stage',
      label: 'Stage, sound & lighting',
      budgetLineId: 'stage',
      questions: [
        'What is the setup time, and is a sound engineer present throughout?',
        'Is there a generator in case of a power cut?',
      ],
    },
    {
      id: 'marketing',
      label: 'Printing & publicity',
      budgetLineId: 'marketing',
      questions: ['What is the print turnaround?', 'Can we get a design in two languages?'],
    },
    {
      id: 'safety',
      label: 'First aid & security',
      budgetLineId: 'safety',
      questions: [
        'How many trained first-aiders, and where is the nearest hospital?',
        'Who manages entry and crowd flow?',
      ],
    },
    {
      id: 'volunteers',
      label: 'Volunteer coordinator',
      budgetLineId: 'safety',
      questions: ['How many volunteers per 100 attendees?', 'Is there a briefing before the day?'],
    },
    {
      id: 'entertainment',
      label: 'Performers & activities',
      budgetLineId: 'entertainment',
      questions: [
        'What stage size and sound do they need?',
        'Is the content suitable for all ages?',
      ],
    },
  ],
};

/** Build the vendor checklist with book-by dates taken from the timeline. */
export function buildVendors(eventType: EventType, timeline: Timeline): VendorItem[] {
  return VENDORS[eventType].map((v) => {
    const m = bookByFor(timeline, v.id);
    // Every vendor template has a booking milestone in the timeline template
    // (test/vendors.test.ts holds this for all three occasions), so a missing
    // one is a programming error, not a runtime condition to paper over.
    if (!m) throw new Error(`no milestone books vendor "${v.id}" for ${eventType}`);
    return {
      id: v.id,
      label: v.label,
      budgetLineId: v.budgetLineId,
      bookBy: m.dueDate,
      daysBefore: m.daysBefore,
      questions: [...v.questions],
    };
  });
}
