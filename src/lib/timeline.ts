import { addDays, daysBetween } from './dates';
import type { EventType } from '../shared/constants';
import { STEPS } from './timeline-data';
import type { Milestone, Timeline } from './types';
import type { VendorId } from './vendors-data';

/**
 * Timeline construction.
 *
 * Each occasion has an ideal lead time and a list of milestones expressed as
 * days before the event. When the user has less runway than the ideal, every
 * milestone is compressed proportionally so the *order* survives and nothing
 * silently lands in the past. Dates are plain calendar arithmetic in UTC so a
 * plan made in Mumbai and read in Toronto shows the same dates.
 */

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

  const milestones: Milestone[] = steps.map((s) => {
    const daysBefore = Math.round(s.daysBefore * scale);
    return {
      id: s.id,
      title: s.title,
      phase: s.phase,
      daysBefore,
      dueDate: addDays(eventDate, -daysBefore),
      vendorId: s.vendorId ?? null,
    };
  });

  // Stable order: furthest-out first, ties broken by template order.
  milestones.sort((a, b) => b.daysBefore - a.daysBefore);
  return { leadDays, rushed, milestones };
}

/** The milestone that books `vendorId`, or null when none does. */
export function bookByFor(timeline: Timeline, vendorId: VendorId): Milestone | null {
  return timeline.milestones.find((m) => m.vendorId === vendorId) ?? null;
}
