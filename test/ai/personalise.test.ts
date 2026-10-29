import { describe, expect, it, vi } from 'vitest';
import { MODELS } from '../../src/lib/ai/ask';
import { personalise } from '../../src/lib/ai/personalise';
import { fallbackPersonalisation } from '../../src/lib/fallback';
import { buildPlan } from '../../src/lib/plan';
import { ctx, env, REPLY, request, TODAY } from './fixtures';

const [PRIMARY_MODEL, FALLBACK_MODEL] = MODELS;

type Calls = Array<[string, Record<string, unknown>]>;
const callsOf = (fn: { mock: { calls: unknown[] } }): Calls => fn.mock.calls as unknown as Calls;

describe('personalise', () => {
  it('uses the primary model when it answers well', async () => {
    const run = vi.fn(async () => ({ response: REPLY }));
    const p = await personalise(env(run as never), buildPlan(request(), TODAY), ctx());
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
    const p = await personalise(env(run as never), buildPlan(request(), TODAY), ctx());
    expect(p.model).toBe(FALLBACK_MODEL);
    expect(run).toHaveBeenCalledTimes(8);
  });

  it('falls through when the primary returns unusable JSON', async () => {
    const run = vi.fn(async (model: string) =>
      model === PRIMARY_MODEL ? { response: 'I cannot help with that.' } : { response: REPLY },
    );
    const p = await personalise(env(run as never), buildPlan(request(), TODAY), ctx());
    expect(p.model).toBe(FALLBACK_MODEL);
  });

  it('logs one structured line per failed model call', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const run = vi.fn(async (model: string) => {
      if (model === PRIMARY_MODEL) throw new Error('capacity');
      return { response: 'I cannot help with that.' };
    });
    await personalise(env(run as never), buildPlan(request(), TODAY), ctx());
    const lines = warn.mock.calls.map((c) => c[0] as Record<string, unknown>);
    warn.mockRestore();
    expect(lines).toHaveLength(8);
    const line = (model: string, kind: string): unknown =>
      expect.objectContaining({
        event: 'model_call_failed',
        model,
        kind,
        elapsedMs: expect.any(Number),
      });
    expect(lines).toContainEqual(line(PRIMARY_MODEL, 'Error'));
    expect(lines).toContainEqual(line(FALLBACK_MODEL, 'unusable_reply'));
  });

  it('never throws: both models failing yields labelled deterministic guidance', async () => {
    const run = vi.fn(async () => {
      throw new Error('down');
    });
    const p = await personalise(env(run as never), buildPlan(request(), TODAY), ctx());
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
    const p = await personalise(env(run as never), buildPlan(request(), TODAY), ctx());
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
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const p = await personalise(env(run as never), buildPlan(request(), TODAY), ctx(), {
      timeoutMs: 50,
    });
    const kinds = warn.mock.calls.map((c) => (c[0] as { kind: string }).kind);
    warn.mockRestore();
    expect(p.sources.ideas).toBe('model');
    expect(p.model).toBe(FALLBACK_MODEL);
    expect(kinds).toEqual(Array(4).fill('TimeoutError'));
  });

  it('aborts the call it gives up on, so the binding can cancel it', async () => {
    const signals: AbortSignal[] = [];
    const run = vi.fn(async (model: string, _input: unknown, opts: { signal: AbortSignal }) => {
      signals.push(opts.signal);
      if (model === PRIMARY_MODEL) return new Promise<never>(() => undefined);
      return { response: REPLY };
    });
    const p = await personalise(env(run as never), buildPlan(request(), TODAY), ctx(), {
      timeoutMs: 50,
    });
    expect(p.model).toBe(FALLBACK_MODEL);
    const byModel = (m: string) => signals.filter((_, i) => callsOf(run)[i]![0] === m);
    expect(byModel(PRIMARY_MODEL).map((s) => s.aborted)).toEqual([true, true, true, true]);
    expect(byModel(FALLBACK_MODEL).map((s) => s.aborted)).toEqual([false, false, false, false]);
  });

  it('ships deterministic guidance when every model hangs', async () => {
    const run = vi.fn(() => new Promise<never>(() => undefined));
    const started = Date.now();
    const p = await personalise(env(run as never), buildPlan(request(), TODAY), ctx(), {
      timeoutMs: 50,
    });
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
    const p = await personalise(env(failing('vendorQuestions') as never), plan, ctx());
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
    const p = await personalise(env(failing('budgetNotes') as never), plan, ctx());
    expect(p.sources).toEqual({
      ideas: 'model',
      vendorQuestions: 'model',
      budgetNotes: 'fallback',
    });
    expect(p.budgetNotes).toEqual(fallbackPersonalisation(plan).budgetNotes);
  });

  it('asks for schema-constrained JSON at a modest temperature', async () => {
    const run = vi.fn(async () => ({ response: REPLY }));
    await personalise(env(run as never), buildPlan(request(), TODAY), ctx());
    const opts = callsOf(run)[0]![1];
    expect(opts.response_format).toMatchObject({ type: 'json_schema' });
    expect(opts.temperature).toBeLessThanOrEqual(0.6);
    expect(opts.max_tokens).toBeLessThanOrEqual(800);
  });
});
