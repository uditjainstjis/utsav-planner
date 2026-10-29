import { OCCASION_LABEL } from '../shared/constants';
import { buildBudget } from './budget';
import { scanForInjection } from './guard';
import { toIcs } from './ics';
import { buildTimeline } from './timeline';
import { SCREENED_FIELDS, type Plan, type PlanRequest } from './types';
import { buildVendors } from './vendors';

/**
 * Assemble the deterministic plan.
 *
 * This is the function a user's numbers go through. It is synchronous, has
 * no I/O, and is the reason a plan renders in milliseconds while the model is
 * still thinking about ideas.
 */
export function buildPlan(request: PlanRequest, today: string): Plan {
  const budget = buildBudget(request.eventType, request.budget, request.guests);
  const timeline = buildTimeline(request.eventType, request.eventDate, today);
  const vendors = buildVendors(request.eventType, timeline);
  return {
    request,
    plannedOn: today,
    budget,
    timeline,
    vendors,
    guard: {
      injectionFindings: SCREENED_FIELDS.flatMap((field) =>
        scanForInjection(request[field] ?? '', field),
      ),
    },
  };
}

/** The calendar export for a plan. */
export function planIcs(plan: Plan, stamp: string): string {
  const label = plan.request.occasion ?? OCCASION_LABEL[plan.request.eventType];
  return toIcs(plan.timeline, label, stamp);
}
