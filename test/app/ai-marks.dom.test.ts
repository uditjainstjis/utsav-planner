import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fallbackPersonalisation } from '../../src/lib/fallback';
import {
  loadApp,
  $,
  byModel,
  fill,
  ok,
  PLAN,
  REQUEST,
  settled,
  stubFetch,
  submit,
} from './harness.dom';
import type { Personalisation } from '../../src/lib/types';

/**
 * The "AI" mark goes on a section exactly when a model wrote that section,
 * whatever the sections beside it are.
 */

beforeEach(loadApp);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the AI marks', () => {
  it('marks nothing as written by the AI when the guidance is generic', async () => {
    const generic = fallbackPersonalisation(PLAN);
    stubFetch(ok({ plan: PLAN, ics: '' }), ok(generic));

    fill(REQUEST.eventDate);
    submit();
    await settled();

    const question = Object.values(generic.vendorQuestions)[0]![0]!;
    expect($('vendor-list').textContent).toContain(question);
    expect($('vendor-list').querySelectorAll('.ai-mark, .vendor__question--ai')).toHaveLength(0);
    expect($('budget-body').querySelectorAll('[data-ai]')).toHaveLength(0);
  });

  /** Build the plan and answer its ideas call with `p`. */
  async function buildWith(p: Personalisation): Promise<void> {
    stubFetch(ok({ plan: PLAN, ics: '' }), ok(p));
    fill(REQUEST.eventDate);
    submit();
    await settled();
  }

  const aiQuestions = (): number =>
    $('vendor-list').querySelectorAll('.vendor__question--ai .ai-mark').length;
  /** Notes marked as the AI's, counted by the badge itself: real text, not CSS content. */
  const aiNotes = (): number => {
    const marks = $('budget-body').querySelectorAll('[data-ai] > .ai-mark:first-child');
    expect(marks).toHaveLength($('budget-body').querySelectorAll('[data-ai]').length);
    for (const mark of marks) expect(mark.textContent).toBe('AI');
    return marks.length;
  };

  it('marks the model’s notes but not the generic questions beside them', async () => {
    await buildWith({
      ...byModel(PLAN, 'm'),
      sources: { ideas: 'model', vendorQuestions: 'fallback', budgetNotes: 'model' },
    });

    expect($('ideas-status').textContent).toMatch(/ideas from m/);
    expect(aiQuestions()).toBe(0);
    expect(aiNotes()).toBe(PLAN.budget.lines.length);
    const firstNote = $('budget-body').querySelector('.budget__note');
    expect(firstNote?.textContent).toMatch(/^AI \S/);
  });

  it('marks the model’s questions even when the ideas are generic', async () => {
    const generic = fallbackPersonalisation(PLAN);
    await buildWith({
      ...generic,
      vendorQuestions: { caterer: ['Is the cake nut-free?'] },
      sources: { ...generic.sources, vendorQuestions: 'model' },
    });

    expect($('ideas-status').dataset.state).toBe('degraded');
    expect($('ideas-status').textContent).toMatch(/general ideas/);
    expect(aiQuestions()).toBe(1);
    expect($('vendor-list').textContent).toContain('Is the cake nut-free?');
    expect(aiNotes()).toBe(0);
  });
});
