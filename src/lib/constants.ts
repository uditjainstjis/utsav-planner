import type { PlanRequest } from './types';

/**
 * The Worker's runtime enumerations; types.ts derives its types from them.
 * Constants the page shares with the Worker live in src/shared/constants.ts.
 */

/** The one definition of each enumeration; the reply schema and its validation read these. */
export const IDEA_CATEGORIES = [
  'theme',
  'decor',
  'food',
  'activity',
  'favour',
  'invite',
  'other',
] as const;

/** How expensive an idea is, as the model may say it and the page shows it. */
export const COST_TIERS = ['low', 'medium', 'high'] as const;

/** The request fields written in a visitor's own words. Each reaches the model, so each is screened. */
export const SCREENED_FIELDS = [
  'occasion',
  'city',
  'preferences',
] as const satisfies readonly (keyof PlanRequest)[];
