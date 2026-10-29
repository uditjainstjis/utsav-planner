import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fallbackPersonalisation } from '../../src/lib/fallback';
import { buildPlan } from '../../src/lib/plan';
import { applyRefinement } from '../../src/lib/refine/apply';
import {
  loadApp,
  $,
  ALL_MODEL,
  byModel,
  deferredFetch,
  fill,
  ok,
  PLAN,
  REQUEST,
  settled,
  stubFetch,
  submit,
  TODAY,
  type Reply,
} from './harness.dom';

/** The "Change something" round trip, after a plan is on screen. */

beforeEach(loadApp);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the refine form', () => {
  async function planFirst(...after: Reply[]): Promise<ReturnType<typeof vi.fn>> {
    const fetch = stubFetch(
      ok({ plan: PLAN, ics: '' }),
      ok(fallbackPersonalisation(PLAN)),
      ...after,
    );
    fill(REQUEST.eventDate);
    submit();
    await settled();
    return fetch;
  }

  function refine(text: string): void {
    $('refine', HTMLInputElement).value = text;
    $('refine-form', HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
  }

  async function refineSettled(): Promise<void> {
    await vi.waitFor(() => {
      expect($('refine-btn').getAttribute('aria-disabled')).not.toBe('true');
    });
  }

  it('applies a change, shows it, and writes the new brief back to the form', async () => {
    const refined = applyRefinement(REQUEST, '30 guests', TODAY);
    const plan = buildPlan(refined.request, TODAY);
    await planFirst(
      ok({ ...refined, plan, ics: '' }),
      ok({ ...fallbackPersonalisation(plan), sources: ALL_MODEL, model: 'm', cached: true }),
    );

    refine('30 guests');
    await refineSettled();

    expect($('changes').textContent).toContain('Guests: 20 → 30');
    expect($('guests', HTMLInputElement).value).toBe('30');
    expect($('refine', HTMLInputElement).value).toBe('');
    expect($('refine-btn').textContent).toBe('Update the plan');
    expect($('ideas-status').textContent).toMatch(/ideas from m, cached/);
    await vi.waitFor(() => {
      expect($('progress').textContent).toMatch(/ideas rewritten/);
    });
  });

  describe('while the first plan’s ideas are still being written', () => {
    const refined = applyRefinement(REQUEST, '30 guests', TODAY);
    const plan = buildPlan(refined.request, TODAY);

    /** Build, leave that plan's ideas call (call 1) open, then refine. */
    async function buildThenRefine(fetch: ReturnType<typeof deferredFetch>): Promise<void> {
      fill(REQUEST.eventDate);
      submit();
      await fetch.answer(0, ok({ plan: PLAN, ics: '' }));
      await fetch.requested(1);
      refine('30 guests');
      await fetch.answer(2, ok({ ...refined, plan, ics: '' }));
      await fetch.answer(3, ok(byModel(plan, 'fresh')));
      await refineSettled();
    }

    it('drops the earlier plan’s ideas when they arrive after the new plan’s', async () => {
      const fetch = deferredFetch();
      await buildThenRefine(fetch);
      const aiQuestions = (): number =>
        $('vendor-list').querySelectorAll('.vendor__question--ai').length;
      const fresh = aiQuestions();
      expect(fresh).toBeGreaterThan(0);

      const stale = { ...byModel(PLAN, 'stale'), vendorQuestions: { caterer: ['Stale?'] } };
      await fetch.answer(1, ok(stale));
      await settled();

      expect($('ideas-status').textContent).toMatch(/ideas from fresh/);
      expect($('ai-summary').textContent).toBe('Summary from fresh');
      expect(aiQuestions()).toBe(fresh);
      expect($('vendor-list').textContent).not.toContain('Stale?');
    });

    it('does not report the earlier plan’s failed ideas against the new plan', async () => {
      const fetch = deferredFetch();
      await buildThenRefine(fetch);

      await fetch.answer(1, { status: 500, body: { error: 'boom' } });
      await settled();

      expect($('ideas-status').textContent).toMatch(/ideas from fresh/);
      expect($('ideas-status').dataset.state).toBe('ok');
    });
  });

  it('shows a rejected change next to the change field', async () => {
    const message = 'Guests must be between 1 and 5,000.';
    await planFirst({ status: 400, body: { error: message, code: 'range', field: 'refine' } });

    refine('9000 guests');
    await refineSettled();

    expect($('refine-error').textContent).toBe(message);
    expect($('refine').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe($('refine'));
    expect($('form-error').hidden).toBe(true);
  });
});
