import { describe, expect, it } from 'vitest';
import { MODELS } from '../../src/lib/ai/ask';
import { coercePersonalisation } from '../../src/lib/ai/coerce';
import { fallbackPersonalisation } from '../../src/lib/fallback';
import { buildPlan } from '../../src/lib/plan';
import { REPLY, request, TODAY } from './fixtures';

const [PRIMARY_MODEL] = MODELS;

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
    expect(p.vendorQuestions.caterer).toHaveLength(3);
  });

  it('keeps only budget line ids in the plan', () => {
    expect(p.budgetNotes).toEqual({ decor: 'One colour, many balloons.' });
  });

  it('bounds every string, at a length that does not grow with the input', () => {
    const lengths = (n: number): number[] => {
      const long = 'x'.repeat(n);
      const reply = {
        summary: long,
        ideas: [{ title: long, detail: long, category: 'decor', costTier: 'low' }],
        vendorQuestions: { caterer: [long] },
        budgetNotes: { decor: long },
      };
      const q = coercePersonalisation(reply, plan, { model: 'm', cached: false })!;
      const idea = q.ideas[0]!;
      return [
        q.summary,
        idea.title,
        idea.detail,
        q.vendorQuestions.caterer![0]!,
        q.budgetNotes.decor!,
      ].map((s) => s.length);
    };
    const capped = lengths(5_000);
    expect(lengths(50_000)).toEqual(capped);
    for (const n of capped) expect(n).toBeLessThan(5_000);
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
