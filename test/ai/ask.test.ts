import { describe, expect, it, vi } from 'vitest';
import { mergeAnswers, MODELS, type Generation, type TextGenerator } from '../../src/lib/ai/ask';
import { personalise } from '../../src/lib/ai/personalise';
import { workersAi } from '../../src/lib/ai/workers-ai';
import { buildPlan } from '../../src/lib/plan';
import { ctx, REPLY, request, TODAY } from './fixtures';

/**
 * Personalisation depends on the TextGenerator it declares, not on Workers AI.
 * The adapter is held to its one job, and generators that share nothing with
 * Workers AI — no binding, no reply envelope — are held to the same contract:
 * any implementation can stand in for any other.
 */

const [PRIMARY_MODEL] = MODELS;

describe('workersAi, the production TextGenerator', () => {
  it('makes exactly one AI.run call per generation, signal included, and returns its reply as is', async () => {
    const reply = { response: '{"ideas":[]}' };
    const run = vi.fn(async () => reply);
    const signal = new AbortController().signal;
    const generation: Generation = {
      model: PRIMARY_MODEL,
      system: 'You plan.',
      prompt: 'Plan this.',
      schema: { type: 'object' },
      maxTokens: 300,
      temperature: 0.5,
    };
    const answer = await workersAi({ run } as unknown as Ai).generate(generation, signal);
    expect(answer).toBe(reply);
    expect(run).toHaveBeenCalledExactlyOnceWith(
      PRIMARY_MODEL,
      {
        messages: [
          { role: 'system', content: 'You plan.' },
          { role: 'user', content: 'Plan this.' },
        ],
        response_format: { type: 'json_schema', json_schema: { type: 'object' } },
        max_tokens: 300,
        temperature: 0.5,
      },
      { signal },
    );
  });
});

describe('any TextGenerator', () => {
  /** A generator with no Workers AI in it, which records what it was asked. */
  function fake(answer: () => Promise<unknown>): { seen: Generation[]; generator: TextGenerator } {
    const seen: Generation[] = [];
    return {
      seen,
      generator: {
        generate: async (generation) => {
          seen.push(generation);
          return answer();
        },
      },
    };
  }

  it('personalises from a generator that answers with the bare object, no envelope', async () => {
    const { seen, generator } = fake(async () => REPLY);
    const p = await personalise(generator, buildPlan(request(), TODAY), ctx());
    expect(p.sources).toEqual({ ideas: 'model', vendorQuestions: 'model', budgetNotes: 'model' });
    expect(p.model).toBe(PRIMARY_MODEL);
    // Four parts, one generation each: one system prompt, a schema and a token budget per part.
    expect(seen).toHaveLength(4);
    expect(new Set(seen.map((g) => g.system)).size).toBe(1);
    expect(seen.every((g) => g.model === PRIMARY_MODEL && g.maxTokens > 0)).toBe(true);
  });

  it('keeps the contract — never throws, always ideas — when a generator rejects with a non-Error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the case under test: a host that rejects with something other than an Error
    const { generator } = fake(() => Promise.reject('offline'));
    const p = await personalise(generator, buildPlan(request(), TODAY), ctx());
    const kinds = warn.mock.calls.map((c) => (c[0] as { kind: string }).kind);
    warn.mockRestore();
    expect(p.sources.ideas).toBe('fallback');
    expect(p.ideas.length).toBeGreaterThan(0);
    // Both models, all four parts, each failure logged with the kind of what was thrown.
    expect(kinds).toEqual(Array(8).fill('string'));
  });
});

describe('mergeAnswers', () => {
  const idea = (title: string) => ({ title, detail: 'd', category: 'theme', costTier: 'low' });

  it('takes the summary from the second half when the first half has none', () => {
    const { reply, model } = mergeAnswers({
      ideasA: { model: 'a', obj: { ideas: [idea('one')] } },
      ideasB: { model: 'b', obj: { summary: 'From B.', ideas: [idea('two')] } },
      vendors: null,
      notes: null,
    });
    expect(reply.summary).toBe('From B.');
    expect(reply.ideas).toEqual([idea('one'), idea('two')]);
    expect(model).toBe('a');
  });

  it('keeps one half’s ideas when the other half’s `ideas` is not a list', () => {
    const { reply } = mergeAnswers({
      ideasA: { model: 'a', obj: { summary: 'S', ideas: 'three ideas' } },
      ideasB: { model: 'b', obj: { ideas: [idea('two')] } },
      vendors: null,
      notes: null,
    });
    expect(reply.ideas).toEqual([idea('two')]);
    expect(reply.vendorQuestions).toBeUndefined();
    expect(reply.budgetNotes).toBeUndefined();
  });
});
