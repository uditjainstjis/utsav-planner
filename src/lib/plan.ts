import { buildBudget } from './budget';
import { scanForInjection } from './guard';
import { buildTimeline, toIcs } from './timeline';
import type { Plan, PlanRequest } from './types';
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
      injectionFindings: request.preferences ? scanForInjection(request.preferences) : [],
    },
  };
}

/** The calendar export for a plan. */
export function planIcs(plan: Plan, stamp: string): string {
  const label =
    plan.request.occasion ??
    { wedding: 'Wedding', birthday: 'Birthday', community: 'Community event' }[
      plan.request.eventType
    ];
  return toIcs(plan.timeline, label, stamp);
}

/** Today as YYYY-MM-DD in UTC. One place, so tests can reason about it. */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
