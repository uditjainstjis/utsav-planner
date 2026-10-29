import { isRecord } from '../validate';

/**
 * Reading a JSON object out of a model reply, whatever wraps it.
 *
 * Schema-constrained decoding is requested, but a model under load can still
 * wrap its output in prose or a fenced code block. Recovering here costs
 * nothing and avoids discarding an otherwise good answer.
 */

/** Keys a reply part carries. An object with none of them is not a reply. */
const REPLY_KEYS = ['ideas', 'summary', 'vendorQuestions', 'budgetNotes'];

/** `choices[0].message.content`, else `choices[0].text`. */
function firstChoice(choices: unknown): unknown {
  const first: unknown = Array.isArray(choices) ? choices[0] : undefined;
  if (!isRecord(first)) return undefined;
  return (isRecord(first.message) ? first.message.content : undefined) ?? first.text;
}

/**
 * Workers AI wraps replies two ways depending on the model: a `response`
 * field, or an OpenAI-style `choices[0].message.content`. Some models return
 * both with `response` empty, so the choices are tried first.
 */
function fromEnvelope(obj: Record<string, unknown>): Record<string, unknown> | null {
  const inner = extractJson(firstChoice(obj.choices));
  if (inner) return inner;
  if ('response' in obj) return extractJson(obj.response);
  return REPLY_KEYS.some((k) => k in obj) ? obj : null;
}

function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
}

/** JSON.parse, or undefined (which JSON never produces) when the text is not JSON. */
function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** An object parsed from the text, or from its outermost braces when prose surrounds it. */
function parseObject(text: string): Record<string, unknown> | null {
  const whole = tryParse(text);
  if (whole !== undefined) return isRecord(whole) ? whole : null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  const inner = tryParse(text.slice(start, end + 1));
  return isRecord(inner) ? inner : null;
}

/** The JSON object in a model reply, or null when there is none. */
export function extractJson(raw: unknown): Record<string, unknown> | null {
  if (isRecord(raw)) return fromEnvelope(raw);
  return typeof raw === 'string' ? parseObject(stripFences(raw)) : null;
}
