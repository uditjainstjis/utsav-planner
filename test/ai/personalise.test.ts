import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../src/env';
import { MODELS } from '../../src/lib/ai/ask';
import { personalise } from '../../src/lib/ai/personalise';
import { fallbackPersonalisation } from '../../src/lib/fallback';
import { buildPlan } from '../../src/lib/plan';
import { REPLY, request, TODAY } from './fixtures';

const [PRIMARY_MODEL, FALLBACK_MODEL] = MODELS;

type Calls = Array<[string, Record<string, unknown>]>;
const callsOf = (fn: { mock: { calls: unknown[] } }): Calls => fn.mock.calls as unknown as Calls;

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
    expect(p.vendorQuestions.caterer).toHaveLength(3);
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

  it('aborts the call it gives up on, so the binding can cancel it', async () => {
    const signals: AbortSignal[] = [];
    const run = vi.fn(async (model: string, _input: unknown, opts: { signal: AbortSignal }) => {
      signals.push(opts.signal);
      if (model === PRIMARY_MODEL) return new Promise<never>(() => undefined);
      return { response: REPLY };
    });
    const p = await personalise(env(run as never), buildPlan(request(), TODAY), { timeoutMs: 50 });
    expect(p.model).toBe(FALLBACK_MODEL);
    const byModel = (m: string) => signals.filter((_, i) => callsOf(run)[i]![0] === m);
    expect(byModel(PRIMARY_MODEL).map((s) => s.aborted)).toEqual([true, true, true, true]);
    expect(byModel(FALLBACK_MODEL).map((s) => s.aborted)).toEqual([false, false, false, false]);
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
