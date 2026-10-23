# ADR 0003 — Four concurrent asks instead of one

**Status:** accepted · 2026-10-23

## Context

The first build requested the entire personalisation in one schema-constrained
reply of ~1,500 tokens. Measured in the browser against the live deployment:
65.8 seconds on `llama-4-scout`. Schema-constrained decoding on Workers AI runs
at tens of tokens per second, so the cost is per output token, and a long reply
is slow on every model.

Dropping the schema roughly halves the time but every model tested then drifted
from the contract (missing `title`/`category`, capitalised enumerations, code
fences). The schema is what makes the reply safe to validate mechanically.

## Decision

Keep the schema. Split the reply into **four independent asks** sent with
`Promise.all`:

| Part                                             | Schema           | Tokens |
| ------------------------------------------------ | ---------------- | ------ |
| ideas, first half (theme, decor, food) + summary | `IDEAS_SCHEMA`   | 360    |
| ideas, second half (activity, favour, invite)    | `IDEAS_SCHEMA`   | 340    |
| vendor questions                                 | `VENDORS_SCHEMA` | 450    |
| budget notes                                     | `NOTES_SCHEMA`   | 400    |

Each part tries the primary model then the fallback model on its own, so one
slow or failed part does not hold the others.

## Consequences

- Wall-clock time is the slowest part, not the sum. Measured per part on
  `llama-3.3-70b`: 2.3–4.5 s for questions and notes, 9–11 s for six ideas in
  one call; halving the ideas brings the longest part to roughly the others. The
  first deployment of three parts measured 13.3 s end to end in the browser,
  from 65.8 s.
- Four small prompts repeat the same facts block, costing input tokens. Input
  tokens are cheap and fast; output tokens are what the schema makes slow.
- The two idea halves are merged in code (`mergeIdeas`). The summary rides with
  the first half; the second asks only for a one-line mood so its schema stays
  identical and its reply short.
- A cache entry is written only when all four parts came from a model, so a
  partial answer is never remembered as a complete one.
