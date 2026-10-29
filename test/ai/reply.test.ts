import { describe, expect, it } from 'vitest';
import { extractJson } from '../../src/lib/ai/reply';

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
