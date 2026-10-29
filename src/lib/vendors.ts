import type { EventType } from '../shared/constants';
import { bookByFor } from './timeline';
import type { Timeline, VendorItem } from './types';
import { VENDORS } from './vendors-data';

/**
 * Vendor checklist.
 *
 * Which vendors an occasion needs, which budget line pays each one, and the
 * questions worth asking before money changes hands. Book-by dates come from
 * the timeline, so the checklist and the calendar can never disagree.
 *
 * The questions in vendors-data.ts are the deterministic baseline — the ones
 * every planner should ask regardless of theme. The model adds a few that
 * depend on the user's stated preferences (a vegetarian-only kitchen, an
 * outdoor venue in monsoon), which arrive separately and are merged in the UI.
 */

/** Build the vendor checklist with book-by dates taken from the timeline. */
export function buildVendors(eventType: EventType, timeline: Timeline): VendorItem[] {
  return VENDORS[eventType].map((v) => {
    const m = bookByFor(timeline, v.id);
    // The types hold every step to a vendor of its own occasion. The other
    // direction, that every vendor has a step that books it, is held by
    // test/vendors.test.ts for all three occasions; this throw only guards it.
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
