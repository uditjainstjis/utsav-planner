import { DAY_MS, dateToMs, daysBetween, msToDate } from './dates';
import type { EventType, Milestone, Phase, Timeline } from './types';

/**
 * Timeline construction and calendar export.
 *
 * Each occasion has an ideal lead time and a list of milestones expressed as
 * days before the event. When the user has less runway than the ideal, every
 * milestone is compressed proportionally so the *order* survives and nothing
 * silently lands in the past. Dates are plain calendar arithmetic in UTC so a
 * plan made in Mumbai and read in Toronto shows the same dates.
 *
 * The ICS export is deterministic for a given plan — same input, byte-identical
 * file — which is what makes it testable and lets a browser cache it.
 */

interface Step {
  id: string;
  title: string;
  phase: Phase;
  daysBefore: number;
  vendorId?: string;
}

const STEPS: Readonly<Record<EventType, { ideal: number; steps: readonly Step[] }>> = {
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

/**
 * Build the milestone list for an occasion.
 *
 * @param eventType  which template
 * @param eventDate  YYYY-MM-DD
 * @param today      YYYY-MM-DD; the day the plan is being made
 */
export function buildTimeline(eventType: EventType, eventDate: string, today: string): Timeline {
  const { ideal, steps } = STEPS[eventType];
  const leadDays = Math.max(0, daysBetween(today, eventDate));
  // Compress only when needed; never stretch a short template to fill a long
  // runway — early is fine, late is not.
  const scale = leadDays < ideal ? leadDays / ideal : 1;
  const rushed = leadDays < ideal / 2;
  const eventMs = dateToMs(eventDate);

  const milestones: Milestone[] = steps.map((s) => {
    const daysBefore = Math.round(s.daysBefore * scale);
    return {
      id: s.id,
      title: s.title,
      phase: s.phase,
      daysBefore,
      dueDate: msToDate(eventMs - daysBefore * DAY_MS),
      vendorId: s.vendorId ?? null,
    };
  });

  // Stable order: furthest-out first, ties broken by template order.
  milestones.sort((a, b) => b.daysBefore - a.daysBefore);
  return { leadDays, rushed, milestones };
}

/** Days-before for the milestone that books `vendorId`, or null. */
export function bookByFor(timeline: Timeline, vendorId: string): Milestone | null {
  return timeline.milestones.find((m) => m.vendorId === vendorId) ?? null;
}

// ---------------------------------------------------------------- ICS

/** RFC 5545 text escaping. */
function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** Fold a content line at 75 octets, as RFC 5545 §3.1 requires. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  let first = true;
  while (i < bytes.length) {
    const take = first ? 75 : 74;
    // Never split inside a multi-byte sequence.
    let end = Math.min(i + take, bytes.length);
    while (end < bytes.length && ((bytes[end] ?? 0) & 0xc0) === 0x80) end--;
    out.push((first ? '' : ' ') + new TextDecoder().decode(bytes.subarray(i, end)));
    i = end;
    first = false;
  }
  return out.join('\r\n');
}

/**
 * Serialise a timeline as an iCalendar file with one all-day event per
 * milestone. `stamp` (an ISO instant) is injected rather than read from the
 * clock so the output is reproducible.
 */
export function toIcs(timeline: Timeline, occasion: string, stamp: string): string {
  const dtstamp = stamp.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Utsav Planner//EN',
    'CALSCALE:GREGORIAN',
  ];
  for (const m of timeline.milestones) {
    const start = m.dueDate.replace(/-/g, '');
    const end = msToDate(dateToMs(m.dueDate) + DAY_MS).replace(/-/g, '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${m.id}-${start}@utsav-planner`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${icsText(`${occasion}: ${m.title}`)}`,
      `CATEGORIES:${icsText(m.phase)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
