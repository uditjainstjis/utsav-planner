# ADR 0005 — Refining in words, with the numbers parsed in code

**Status:** accepted · 2026-10-23

## Context

The brief asks for a planning **assistant**. A form that returns a plan is a
generator; an assistant is something you can answer back to — "that's too much,
make it twelve lakh", "we're up to three hundred now", "add a mehndi night". The
first build had no second turn.

A free-form chat would be the obvious shape, and the wrong one here: a model
handed "budget 12 lakh" would be trusted to re-divide the money, which is
exactly the responsibility ADR 0002 keeps out of its hands.

## Decision

Add one more turn, `POST /api/refine`, with the same split as everything else:

- **Numbers are parsed deterministically** (`src/lib/refine.ts`): rupee amounts
  in Indian and Western magnitudes (`12 lakh`, `₹9,50,000`, `1.2 crore`, `50k`,
  `2 million`) and headcounts in the ways people say them (`300 guests`,
  `for 120 people`, `headcount 80`, `15 kids`), and dates. The parsed values are
  range-checked with the same limits as the form and applied to the validated
  request; the budget, timeline and checklist are rebuilt in code.
- **The sentence is appended to the brief** as a labelled adjustment
  ("Adjustment requested: …") and the client calls `/api/personalise` again, so
  ideas, vendor questions and budget notes are rewritten around it by the model,
  under the same schemas and the same validation.
- **Every change applied is returned and shown** as chips: "Budget: ₹15,00,000 →
  ₹12,00,000", "Guests: 250 → 300", "Ideas rewritten for: “add a mehndi night”".
  A number the parser could not read is not changed, and the user can see that
  it was not.

## Consequences

- The interaction loop is: plan → say what to change → see exactly what changed
  → new ideas. That is the assistant the brief describes, without ever letting
  the model touch a number.
- The parser is small and conservative by design. It reads an amount, a
  headcount and a date — explicit (`15 March 2027`, `2027-03-15`), relative
  (`in 3 weeks`) or a month alone (`move it to March`, keeping the day) — and
  nothing else; a city or occasion change is made in the form. Extending it is a
  matter of adding a pattern and a test, not of prompting.
- Adjustments accumulate in the brief across turns, bounded in length: the model
  sees the three most recent, and older ones are dropped first.
- Refining never calls the model itself (`test/api.test.ts` asserts it), so the
  numbers update in milliseconds and the words follow.
