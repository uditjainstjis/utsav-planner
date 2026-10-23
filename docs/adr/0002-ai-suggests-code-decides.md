# ADR 0002 — The AI suggests, the code decides

**Status:** accepted · 2026-10-23

## Context

A planning assistant produces two kinds of output. Some of it is arithmetic
and calendar logic — a budget that must sum to the total, dates counted back
from the event, which vendor is paid from which line. Some of it is taste —
ideas that fit a dinosaur party in Pune, the questions a vegetarian family
should ask a caterer in Jaipur. A language model is excellent at the second and
unreliable at the first, and a user checks the first with a calculator.

## Decision

Split the two completely.

- `budget.ts`, `timeline.ts`, `vendors.ts` are pure functions over the validated
  request. They produce every number and every date. They have unit tests that
  hold invariants (lines sum exactly to the total; every vendor's book-by date is
  a timeline milestone).
- The model is given those results as facts and asked only for words: a
  summary, ideas, questions, notes. Each reply is validated against the plan it
  was shown: ids must exist, enumerations are re-checked, strings are bounded.
- The system prompt states "you never invent numbers"; the schema has no
  numeric field; `coercePersonalisation` would discard one if it appeared.

## Consequences

- A prompt injection through the wishes field can at most change the wording
  of an idea. It cannot move money between lines or change a date. The
  injection screen still runs, and its findings are shown to the user.
- The plan is available in milliseconds and is complete without the model. A
  model outage degrades one section and is labelled (`source: "fallback"`).
- Testing is straightforward: the deterministic 80% has exhaustive unit tests;
  the generative 20% has tests for the validation gate and for every failure
  path, with the model stubbed.
- Ideas are less "magical" than a free-form chat would make them feel. That is
  the trade: a number the user can trust over a sentence that sounds confident.
