import type { Env } from '../../env';
import type { TextGenerator } from './ask';

/**
 * The production {@link TextGenerator}: the Workers AI binding.
 *
 * Single responsibility: translate one generation into one `AI.run` call, in
 * the chat shape both models accept, passing the abort signal through so a
 * call given up on is cancelled. It adds no policy — model order, timeouts,
 * fallback and reply checking all live in src/lib/ai/ask.ts — so it can be
 * swapped for any other implementation without touching that code.
 */
export function workersAi(ai: Env['AI']): TextGenerator {
  return {
    generate: ({ model, system, prompt, schema, maxTokens, temperature }, signal) =>
      ai.run(
        model,
        {
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_schema', json_schema: schema },
          max_tokens: maxTokens,
          temperature,
        },
        { signal },
      ),
  };
}
