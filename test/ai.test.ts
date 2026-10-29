import { describe, expect, it, vi } from 'vitest';
import {
  coercePersonalisation,
  extractJson,
  FALLBACK_MODEL,
  REPLY_LIMITS,
  personalise,
  PRIMARY_MODEL,
  type Env,
} from '../src/lib/ai';
import { fallbackPersonalisation } from '../src/lib/fallback';
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

  it('returns null for text that is JSON but not an object, or braces around non-JSON', () => {
    expect(extractJson('[{"ideas":[]}]')).toBeNull();
    expect(extractJson('"{\\"ideas\\":[]}"')).toBeNull();
    expect(extractJson('Here: {ideas: none} sorry')).toBeNull();
    expect(extractJson('} backwards {')).toBeNull();
  });

  it('skips an unusable first choice and falls back to the response field', () => {
    expect(extractJson({ choices: [null], response: '{"summary":"r"}' })).toEqual({
      summary: 'r',
    });
    expect(extractJson({ choices: ['text'], summary: 's' })).toEqual({
      choices: ['text'],
      summary: 's',
    });
  });
});

describe('coercePersonalisation', () => {
  const plan = buildPlan(request(), TODAY);

  it('drops ideas that are not objects; sections that are not maps become the generic ones', () => {
    const q = coercePersonalisation(
      {
        ideas: [null, 'Fossil dig', ['x'], { title: 'Kept', detail: 'An object.' }],
        vendorQuestions: ['caterer'],
        budgetNotes: 'decor',
      },
      plan,
      { model: PRIMARY_MODEL, cached: false },
    );
    const generic = fallbackPersonalisation(plan);
    expect(q?.ideas.map((i) => i.title)).toEqual(['Kept']);
    expect(q?.vendorQuestions).toEqual(generic.vendorQuestions);
    expect(q?.budgetNotes).toEqual(generic.budgetNotes);
    expect(q?.sources).toEqual({
      ideas: 'model',
      vendorQuestions: 'fallback',
      budgetNotes: 'fallback',
    });
  });

  it('takes the generic section, labelled so, when no entry of the model’s survives', () => {
    const q = coercePersonalisation(
      { ...REPLY, vendorQuestions: { unicorn: ['?'] }, budgetNotes: { mandap: 'n' } },
      plan,
      { model: PRIMARY_MODEL, cached: false },
    )!;
    expect(q.vendorQuestions).toEqual(fallbackPersonalisation(plan).vendorQuestions);
    expect(q.sources).toEqual({
      ideas: 'model',
      vendorQuestions: 'fallback',
      budgetNotes: 'fallback',
    });
  });

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
    expect(p.vendorQuestions.caterer).toHaveLength(REPLY_LIMITS.questionsPerVendor);
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
    expect(q.summary.length).toBe(REPLY_LIMITS.summary);
    expect(q.ideas[0]!.title.length).toBe(REPLY_LIMITS.ideaTitle);
    expect(q.ideas[0]!.detail.length).toBe(REPLY_LIMITS.ideaDetail);
    expect(q.vendorQuestions.caterer![0]!.length).toBe(REPLY_LIMITS.question);
    expect(q.budgetNotes.decor!.length).toBe(REPLY_LIMITS.note);
  });

  it('rejects a reply with no usable ideas so the caller can try again', () => {
    expect(
      coercePersonalisation({ summary: 'x', ideas: [] }, plan, { model: 'm', cached: false }),
    ).toBeNull();
    expect(coercePersonalisation({ summary: 'x' }, plan, { model: 'm', cached: false })).toBeNull();
  });

  it('records provenance', () => {
    expect(p.sources).toEqual({ ideas: 'model', vendorQuestions: 'model', budgetNotes: 'model' });
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
    expect(p.sources).toEqual({ ideas: 'model', vendorQuestions: 'model', budgetNotes: 'model' });
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
    expect(p.sources).toEqual({
      ideas: 'fallback',
      vendorQuestions: 'fallback',
      budgetNotes: 'fallback',
    });
    expect(p.model).toBeNull();
    expect(p.ideas.length).toBeGreaterThan(0);
    expect(p.summary).toMatch(/unavailable/);
  });

  it('ships generic ideas but keeps checked model questions and notes when no idea is usable', async () => {
    const run = vi.fn(async () => ({ response: { ...REPLY, ideas: [] } }));
    const p = await personalise(env(run as never), buildPlan(request(), TODAY));
    expect(p.sources).toEqual({
      ideas: 'fallback',
      vendorQuestions: 'model',
      budgetNotes: 'model',
    });
    expect(p.model).toBeNull();
    expect(p.ideas.length).toBeGreaterThan(0);
    expect(p.vendorQuestions.caterer).toHaveLength(REPLY_LIMITS.questionsPerVendor);
    expect(p.vendorQuestions.unicorn).toBeUndefined();
    expect(p.budgetNotes).toEqual({ decor: 'One colour, many balloons.' });
  });

  it('gives up on a hung primary and uses the fallback within the timeout', async () => {
    const run = vi.fn(async (model: string) => {
      if (model === PRIMARY_MODEL) return new Promise<never>(() => undefined); // never settles
      return { response: REPLY };
    });
    const p = await personalise(env(run as never), buildPlan(request(), TODAY), { timeoutMs: 50 });
    expect(p.sources.ideas).toBe('model');
    expect(p.model).toBe(FALLBACK_MODEL);
  });

  it('ships deterministic guidance when every model hangs', async () => {
    const run = vi.fn(() => new Promise<never>(() => undefined));
    const started = Date.now();
    const p = await personalise(env(run as never), buildPlan(request(), TODAY), { timeoutMs: 50 });
    expect(p.sources.ideas).toBe('fallback');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  /** A model that answers every ask except the ones whose prompt asks for `key`. */
  const failing = (key: string) =>
    vi.fn(async (_model: string, input: { messages: { content: string }[] }) => {
      if (input.messages[1]!.content.includes(`Produce "${key}"`)) throw new Error('down');
      return { response: REPLY };
    });

  it('labels each section by who wrote it when the vendor ask alone fails', async () => {
    const plan = buildPlan(request(), TODAY);
    const p = await personalise(env(failing('vendorQuestions') as never), plan);
    expect(p.sources).toEqual({
      ideas: 'model',
      vendorQuestions: 'fallback',
      budgetNotes: 'model',
    });
    expect(p.model).toBe(PRIMARY_MODEL);
    expect(p.vendorQuestions).toEqual(fallbackPersonalisation(plan).vendorQuestions);
    expect(p.budgetNotes).toEqual({ decor: 'One colour, many balloons.' });
  });

  it('labels each section by who wrote it when the notes ask alone fails', async () => {
    const plan = buildPlan(request(), TODAY);
    const p = await personalise(env(failing('budgetNotes') as never), plan);
    expect(p.sources).toEqual({
      ideas: 'model',
      vendorQuestions: 'model',
      budgetNotes: 'fallback',
    });
    expect(p.budgetNotes).toEqual(fallbackPersonalisation(plan).budgetNotes);
  });

  it('does not cache an answer with a generic section, so that part is retried', async () => {
    const req = request();
    // Every part answers, but no vendor id in the reply is in the plan.
    const strays = vi.fn(async () => ({
      response: { ...REPLY, vendorQuestions: { unicorn: ['?'] } },
    }));
    const first = await personalise(env(strays as never), buildPlan(req, TODAY));
    expect(first.sources.vendorQuestions).toBe('fallback');
    const good = vi.fn(async () => ({ response: REPLY }));
    const p = await personalise(env(good as never), buildPlan(req, TODAY));
    expect(p.cached).toBe(false);
    expect(p.sources.vendorQuestions).toBe('model');
  });

  it('serves a repeat request from cache without a model call', async () => {
    const run = vi.fn(async () => ({ response: REPLY }));
    const req = request();
    const first = await personalise(env(run as never), buildPlan(req, TODAY));
    const second = await personalise(env(run as never), buildPlan(req, TODAY));
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.model).toBe(PRIMARY_MODEL);
    expect(second.sources).toEqual(first.sources);
    expect(run).toHaveBeenCalledTimes(4);
  });

  it('labels a cache hit with the model that actually wrote the answer', async () => {
    const run = vi.fn(async (model: string) => {
      if (model === PRIMARY_MODEL) throw new Error('capacity');
      return { response: REPLY };
    });
    const req = request();
    const first = await personalise(env(run as never), buildPlan(req, TODAY));
    const second = await personalise(env(run as never), buildPlan(req, TODAY));
    expect(first.model).toBe(FALLBACK_MODEL);
    expect(second.cached).toBe(true);
    expect(second.model).toBe(FALLBACK_MODEL);
    expect(run).toHaveBeenCalledTimes(8);
  });

  it('does not cache a fallback answer, so the model is retried next time', async () => {
    const req = request();
    const bad = vi.fn(async () => {
      throw new Error('down');
    });
    await personalise(env(bad as never), buildPlan(req, TODAY));
    const good = vi.fn(async () => ({ response: REPLY }));
    const p = await personalise(env(good as never), buildPlan(req, TODAY));
    expect(p.sources.ideas).toBe('model');
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
