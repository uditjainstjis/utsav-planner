import { describe, expect, it, vi } from 'vitest';
import {
  coercePersonalisation,
  extractJson,
  FALLBACK_MODEL,
  LIMITS,
  personalise,
  PRIMARY_MODEL,
  type Env,
} from '../src/lib/ai';
import { buildPlan } from '../src/lib/plan';
import type { PlanRequest } from '../src/lib/types';

const TODAY = '2026-10-23';

type Calls = Array<[string, Record<string, unknown>]>;
const callsOf = (fn: { mock: { calls: unknown[] } }): Calls => fn.mock.calls as unknown as Calls;

let seed = 0;
/** Each test gets a request no earlier test has personalised, so the shared
 *  Cache API inside the isolate cannot turn a model assertion into a hit. */
function request(extra: Partial<PlanRequest> = {}): PlanRequest {
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

const REPLY = {
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

describe('extractJson', () => {
  it('unwraps a Workers AI envelope', () => {
    expect(extractJson({ response: { ideas: [] } })).toEqual({ ideas: [] });
  });
  it('parses a string, including one wrapped in a code fence', () => {
    expect(extractJson('```json\n{"summary":"x","ideas":[]}\n```')).toEqual({
      summary: 'x',
      ideas: [],
    });
  });
  it('recovers an object embedded in prose', () => {
    expect(extractJson('Sure! {"summary":"x","ideas":[]} Hope this helps.')).toEqual({
      summary: 'x',
      ideas: [],
    });
  });
  it('unwraps an OpenAI-style envelope, preferring choices over an empty response', () => {
    const env = {
      response: null,
      choices: [{ message: { content: '{"vendorQuestions":{"venue":["Q?"]}}' } }],
    };
    expect(extractJson(env)).toEqual({ vendorQuestions: { venue: ['Q?'] } });
    expect(extractJson({ choices: [{ text: '{"budgetNotes":{"decor":"n"}}' }] })).toEqual({
      budgetNotes: { decor: 'n' },
    });
  });

  it('returns null for arrays, numbers, and unrelated objects', () => {
    expect(extractJson([1])).toBeNull();
    expect(extractJson(42)).toBeNull();
    expect(extractJson({ unrelated: true })).toBeNull();
    expect(extractJson('nothing here')).toBeNull();
  });
});

describe('coercePersonalisation', () => {
  const plan = buildPlan(request(), TODAY);
  const p = coercePersonalisation(REPLY, plan, { model: PRIMARY_MODEL, cached: false })!;

  it('normalises whitespace and keeps the summary bounded', () => {
    expect(p.summary).toBe('A dinosaur party for twenty.');
  });

  it('keeps well-formed ideas and normalises enum case', () => {
    expect(p.ideas.map((i) => i.title)).toEqual([
      'Fossil dig',
      'Volcano cake',
      'Bad line',
      'Odd enum',
    ]);
    expect(p.ideas[1]).toMatchObject({
      category: 'food',
      costTier: 'high',
      budgetLineId: 'catering',
    });
  });

  it('nulls a budget line id the plan does not have, rather than inventing one', () => {
    expect(p.ideas[2]!.budgetLineId).toBeNull();
  });

  it('maps unknown enums to safe defaults', () => {
    expect(p.ideas[3]).toMatchObject({ category: 'other', costTier: 'medium' });
  });

  it('drops an idea with no title', () => {
    expect(p.ideas.some((i) => i.detail.startsWith('No title'))).toBe(false);
  });

  it('keeps only vendor ids in the plan and caps questions per vendor', () => {
    expect(Object.keys(p.vendorQuestions)).toEqual(['caterer']);
    expect(p.vendorQuestions.caterer).toHaveLength(LIMITS.questionsPerVendor);
  });

  it('keeps only budget line ids in the plan', () => {
    expect(p.budgetNotes).toEqual({ decor: 'One colour, many balloons.' });
  });

  it('bounds every string', () => {
    const long = {
      summary: 'x'.repeat(5000),
      ideas: [
        {
          title: 'y'.repeat(500),
          detail: 'z'.repeat(5000),
          category: 'decor',
          costTier: 'low',
          budgetLineId: null,
        },
      ],
      vendorQuestions: { caterer: ['q'.repeat(1000)] },
      budgetNotes: { decor: 'n'.repeat(1000) },
    };
    const q = coercePersonalisation(long, plan, { model: 'm', cached: false })!;
    expect(q.summary.length).toBe(LIMITS.summary);
    expect(q.ideas[0]!.title.length).toBe(LIMITS.ideaTitle);
    expect(q.ideas[0]!.detail.length).toBe(LIMITS.ideaDetail);
    expect(q.vendorQuestions.caterer![0]!.length).toBe(LIMITS.question);
    expect(q.budgetNotes.decor!.length).toBe(LIMITS.note);
  });

  it('rejects a reply with no usable ideas so the caller can try again', () => {
    expect(
      coercePersonalisation({ summary: 'x', ideas: [] }, plan, { model: 'm', cached: false }),
    ).toBeNull();
    expect(coercePersonalisation({ summary: 'x' }, plan, { model: 'm', cached: false })).toBeNull();
  });

  it('records provenance', () => {
    expect(p.source).toBe('model');
    expect(p.model).toBe(PRIMARY_MODEL);
    expect(p.cached).toBe(false);
  });
});

function env(run: Env['AI']['run']): Env {
  return { AI: { run } as unknown as Ai, ASSETS: {} as Fetcher };
}

describe('personalise', () => {
  it('uses the primary model when it answers well', async () => {
    const run = vi.fn(async () => ({ response: REPLY }));
    const p = await personalise(env(run as never), buildPlan(request(), TODAY));
    expect(p.source).toBe('model');
    expect(p.model).toBe(PRIMARY_MODEL);
    expect(run).toHaveBeenCalledTimes(4);
    for (const c of callsOf(run)) expect(c[0]).toBe(PRIMARY_MODEL);
  });

  it('falls through to the fallback model when the primary throws', async () => {
    const run = vi.fn(async (model: string) => {
      if (model === PRIMARY_MODEL) throw new Error('capacity');
      return { response: REPLY };
    });
    const p = await personalise(env(run as never), buildPlan(request(), TODAY));
    expect(p.model).toBe(FALLBACK_MODEL);
    expect(run).toHaveBeenCalledTimes(8);
  });

  it('falls through when the primary returns unusable JSON', async () => {
    const run = vi.fn(async (model: string) =>
      model === PRIMARY_MODEL ? { response: 'I cannot help with that.' } : { response: REPLY },
    );
    const p = await personalise(env(run as never), buildPlan(request(), TODAY));
    expect(p.model).toBe(FALLBACK_MODEL);
  });

  it('never throws: both models failing yields labelled deterministic guidance', async () => {
    const run = vi.fn(async () => {
      throw new Error('down');
    });
    const p = await personalise(env(run as never), buildPlan(request(), TODAY));
    expect(p.source).toBe('fallback');
    expect(p.model).toBeNull();
    expect(p.ideas.length).toBeGreaterThan(0);
    expect(p.summary).toMatch(/unavailable/);
  });

  it('gives up on a hung primary and uses the fallback within the timeout', async () => {
    const run = vi.fn(async (model: string) => {
      if (model === PRIMARY_MODEL) return new Promise<never>(() => undefined); // never settles
      return { response: REPLY };
    });
    const p = await personalise(env(run as never), buildPlan(request(), TODAY), { timeoutMs: 50 });
    expect(p.source).toBe('model');
    expect(p.model).toBe(FALLBACK_MODEL);
  });

  it('ships deterministic guidance when every model hangs', async () => {
    const run = vi.fn(() => new Promise<never>(() => undefined));
    const started = Date.now();
    const p = await personalise(env(run as never), buildPlan(request(), TODAY), { timeoutMs: 50 });
    expect(p.source).toBe('fallback');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('serves a repeat request from cache without a model call', async () => {
    const run = vi.fn(async () => ({ response: REPLY }));
    const req = request();
    const first = await personalise(env(run as never), buildPlan(req, TODAY));
    const second = await personalise(env(run as never), buildPlan(req, TODAY));
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(run).toHaveBeenCalledTimes(4);
  });

  it('does not cache a fallback answer, so the model is retried next time', async () => {
    const req = request();
    const bad = vi.fn(async () => {
      throw new Error('down');
    });
    await personalise(env(bad as never), buildPlan(req, TODAY));
    const good = vi.fn(async () => ({ response: REPLY }));
    const p = await personalise(env(good as never), buildPlan(req, TODAY));
    expect(p.source).toBe('model');
    expect(good).toHaveBeenCalledTimes(4);
  });

  it('asks for schema-constrained JSON at a modest temperature', async () => {
    const run = vi.fn(async () => ({ response: REPLY }));
    await personalise(env(run as never), buildPlan(request(), TODAY));
    const opts = callsOf(run)[0]![1];
    expect(opts.response_format).toMatchObject({ type: 'json_schema' });
    expect(opts.temperature).toBeLessThanOrEqual(0.6);
    expect(opts.max_tokens).toBeLessThanOrEqual(800);
  });
});
