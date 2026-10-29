import { vi } from 'vitest';
import worker from '../../src/index';
import type { Env } from '../../src/env';

/**
 * Requests and a stubbed environment for the tests of the Worker's HTTP
 * surface in test/api/.
 *
 * The AI binding is stubbed so those tests assert *our* behaviour — routing,
 * validation, headers, rate limiting, failure handling — not a model's.
 * Model output quality is measured separately (docs/EVALUATION.md).
 */

export function futureDate(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const GOOD = {
  eventType: 'wedding',
  eventDate: futureDate(120),
  guests: 200,
  budget: 1_200_000,
  city: 'Jaipur',
  occasion: 'Riya & Arjun',
  preferences: 'Vegetarian only, pastel decor',
};

export const MODEL_REPLY = {
  summary: 'A pastel Jaipur wedding for two hundred.',
  ideas: [
    {
      title: 'Marigold arches',
      detail: 'Local flowers, big effect.',
      category: 'decor',
      costTier: 'low',
      budgetLineId: 'decor',
    },
    {
      title: 'Live chaat',
      detail: 'Three counters.',
      category: 'food',
      costTier: 'medium',
      budgetLineId: 'catering',
    },
  ],
  vendorQuestions: { caterer: ['Is the kitchen fully vegetarian?'], bogus: ['ignored'] },
  budgetNotes: { catering: 'Protect this line.', nope: 'ignored' },
};

/** A stub binding that answers with a schema-shaped personalisation. */
export function stubEnv(overrides: Partial<Env> = {}, reply: unknown = MODEL_REPLY): Env {
  const run = vi.fn(async () => ({ response: reply }));
  return {
    AI: { run } as unknown as Ai,
    ASSETS: {
      fetch: async () =>
        new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }),
    } as unknown as Fetcher,
    RATE_LIMITER: { limit: async () => ({ success: true }) },
    ...overrides,
  };
}

/** An execution context: what the Worker hands to waitUntil still runs, unawaited. */
const CTX = { waitUntil: () => undefined, passThroughOnException: () => undefined };

export async function post(
  path: string,
  body: unknown,
  env: Env = stubEnv(),
  extra: Record<string, string> = {},
) {
  return worker.fetch(
    new Request(`https://utsav.test${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': '203.0.113.9',
        ...extra,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    env,
    CTX as unknown as ExecutionContext,
  );
}

export const get = (path: string, env: Env = stubEnv()) =>
  worker.fetch(new Request(`https://utsav.test${path}`), env, CTX as unknown as ExecutionContext);
