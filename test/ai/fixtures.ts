import type { Env } from '../../src/env';
import type { PlanRequest } from '../../src/lib/types';

/** Shared by the ai/ suites: a planning day, fresh requests, and a reply to check. */

export const TODAY = '2026-10-23';

let seed = 0;
/** Each test gets a request no earlier test has personalised, so the shared
 *  Cache API inside the isolate cannot turn a model assertion into a hit. */
export function request(extra: Partial<PlanRequest> = {}): PlanRequest {
  seed++;
  return {
    eventType: 'birthday',
    eventDate: '2026-12-07',
    guests: 20,
    budget: 25_000,
    city: 'Pune',
    occasion: `Aarav turns 5 (${seed})`,
    preferences: 'Dinosaur theme, nut allergies',
    ...extra,
  };
}

/** A reply mixing well-formed entries with each defect the checks must catch. */
export const REPLY = {
  summary: ' A dinosaur party   for twenty. ',
  ideas: [
    {
      title: 'Fossil dig',
      detail: 'Sand tray with toy bones.',
      category: 'activity',
      costTier: 'low',
      budgetLineId: 'entertainment',
    },
    {
      title: 'Volcano cake',
      detail: 'Chocolate lava.',
      category: 'FOOD',
      costTier: 'HIGH',
      budgetLineId: 'catering',
    },
    {
      title: 'Bad line',
      detail: 'Uses an id not in the plan.',
      category: 'decor',
      costTier: 'low',
      budgetLineId: 'mandap',
    },
    {
      title: 'Odd enum',
      detail: 'Unknown category and tier.',
      category: 'pyro',
      costTier: 'free',
      budgetLineId: null,
    },
    {
      title: '',
      detail: 'No title; dropped.',
      category: 'decor',
      costTier: 'low',
      budgetLineId: null,
    },
  ],
  vendorQuestions: {
    caterer: ['Nut-free kitchen?', 'Egg-free sponge available?', 'Q3', 'Q4 over the cap'],
    unicorn: ['dropped'],
  },
  budgetNotes: { decor: 'One colour, many balloons.', mandap: 'dropped' },
};

/** An environment whose AI binding is `run`. */
export function env(run: Env['AI']['run']): Env {
  return {
    AI: { run } as unknown as Ai,
    ASSETS: {} as Fetcher,
    RATE_LIMITER: { limit: async () => ({ success: true }) },
  };
}

/**
 * An execution context that keeps what is handed to `waitUntil`, so a test
 * can let the cache write finish before it asks again.
 */
export function ctx(): {
  waitUntil: (p: Promise<unknown>) => void;
  settled: () => Promise<unknown>;
} {
  const pending: Promise<unknown>[] = [];
  return {
    waitUntil: (p) => {
      pending.push(p);
    },
    settled: () => Promise.all(pending),
  };
}
