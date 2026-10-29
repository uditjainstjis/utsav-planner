import { describe, expect, it, vi } from 'vitest';
import { MODELS } from '../../src/lib/ai/ask';
import { personalise } from '../../src/lib/ai/personalise';
import { buildPlan } from '../../src/lib/plan';
import { binding, ctx, REPLY, request, TODAY } from './fixtures';

const [PRIMARY_MODEL, FALLBACK_MODEL] = MODELS;

describe('personalise and the cache', () => {
  it('writes a complete answer through waitUntil, so the response does not wait on it', async () => {
    const run = vi.fn(async () => ({ response: REPLY }));
    const req = request();
    const waitUntil = vi.fn();
    const first = await personalise(binding(run as never), buildPlan(req, TODAY), { waitUntil });
    expect(first.cached).toBe(false);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await waitUntil.mock.calls[0]![0];
    const second = await personalise(binding(run as never), buildPlan(req, TODAY), { waitUntil });
    expect(second.cached).toBe(true);
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

  it('hands waitUntil nothing for an answer it does not cache', async () => {
    const waitUntil = vi.fn();
    const down = vi.fn(async () => {
      throw new Error('down');
    });
    await personalise(binding(down as never), buildPlan(request(), TODAY), { waitUntil });
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('does not cache an answer with a generic section, so that part is retried', async () => {
    const req = request();
    const c = ctx();
    // Every part answers, but no vendor id in the reply is in the plan.
    const strays = vi.fn(async () => ({
      response: { ...REPLY, vendorQuestions: { unicorn: ['?'] } },
    }));
    const first = await personalise(binding(strays as never), buildPlan(req, TODAY), c);
    expect(first.sources.vendorQuestions).toBe('fallback');
    await c.settled();
    const good = vi.fn(async () => ({ response: REPLY }));
    const p = await personalise(binding(good as never), buildPlan(req, TODAY), c);
    expect(p.cached).toBe(false);
    expect(p.sources.vendorQuestions).toBe('model');
  });

  it('serves a repeat request from cache without a model call', async () => {
    const run = vi.fn(async () => ({ response: REPLY }));
    const req = request();
    const c = ctx();
    const first = await personalise(binding(run as never), buildPlan(req, TODAY), c);
    await c.settled();
    const second = await personalise(binding(run as never), buildPlan(req, TODAY), c);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.model).toBe(PRIMARY_MODEL);
    expect(second.sources).toEqual(first.sources);
    expect(run).toHaveBeenCalledTimes(4);
  });

  it('does not share an entry between briefs that differ only in the date', async () => {
    const run = vi.fn(async () => ({ response: REPLY }));
    const req = request();
    const c = ctx();
    const first = buildPlan(req, TODAY);
    // A day later for both the event and the planning day: the lead time is
    // the same, so only the date the prompt states differs.
    const later = buildPlan({ ...req, eventDate: '2026-12-08' }, '2026-10-24');
    expect(later.timeline.leadDays).toBe(first.timeline.leadDays);
    await personalise(binding(run as never), first, c);
    await c.settled();
    const second = await personalise(binding(run as never), later, c);
    expect(second.cached).toBe(false);
    expect(run).toHaveBeenCalledTimes(8);
  });

  it('labels a cache hit with the model that actually wrote the answer', async () => {
    const run = vi.fn(async (model: string) => {
      if (model === PRIMARY_MODEL) throw new Error('capacity');
      return { response: REPLY };
    });
    const req = request();
    const c = ctx();
    const first = await personalise(binding(run as never), buildPlan(req, TODAY), c);
    await c.settled();
    const second = await personalise(binding(run as never), buildPlan(req, TODAY), c);
    expect(first.model).toBe(FALLBACK_MODEL);
    expect(second.cached).toBe(true);
    expect(second.model).toBe(FALLBACK_MODEL);
    expect(run).toHaveBeenCalledTimes(8);
  });

  it('does not cache a fallback answer, so the model is retried next time', async () => {
    const req = request();
    const c = ctx();
    const bad = vi.fn(async () => {
      throw new Error('down');
    });
    await personalise(binding(bad as never), buildPlan(req, TODAY), c);
    await c.settled();
    const good = vi.fn(async () => ({ response: REPLY }));
    const p = await personalise(binding(good as never), buildPlan(req, TODAY), c);
    expect(p.sources.ideas).toBe('model');
    expect(good).toHaveBeenCalledTimes(4);
  });

  it('treats a cache that cannot be read as a miss, and still answers from the model', async () => {
    const match = vi.spyOn(caches.default, 'match').mockRejectedValue(new Error('cache down'));
    const run = vi.fn(async () => ({ response: REPLY }));
    const p = await personalise(binding(run as never), buildPlan(request(), TODAY), ctx());
    match.mockRestore();
    expect(p.sources.ideas).toBe('model');
    expect(p.cached).toBe(false);
    expect(run).toHaveBeenCalledTimes(4);
  });

  it('caches a brief with no name, city or wishes like any other', async () => {
    // A budget no other test uses, since the brief carries no unique name.
    const req = request({ occasion: null, city: null, preferences: null, budget: 31_337 });
    const run = vi.fn(async () => ({ response: REPLY }));
    const c = ctx();
    await personalise(binding(run as never), buildPlan(req, TODAY), c);
    await c.settled();
    const second = await personalise(binding(run as never), buildPlan(req, TODAY), c);
    expect(second.cached).toBe(true);
    expect(run).toHaveBeenCalledTimes(4);
  });
});
