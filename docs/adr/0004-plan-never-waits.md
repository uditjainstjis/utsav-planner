# ADR 0004 — The plan never waits for the model

**Status:** accepted · 2026-10-23

## Context

Even at a few seconds, a model call is the slowest thing in the request and the
only thing that can fail for reasons outside this code. A page that shows a
spinner until the model answers makes the whole product only as reliable and as
fast as inference.

## Decision

Two routes, called in sequence by the client:

1. `POST /api/plan` — validation, budget, timeline, vendors, `.ics`. Pure
   computation, returns in milliseconds, rendered immediately.
2. `POST /api/personalise` — the model. Rebuilds the plan from the validated
   request (never trusting a client-supplied plan), asks the model, validates,
   and returns. Rendered when it arrives; any part that fails is filled from the
   deterministic fallback, `sources` labels that section `fallback`, and the
   page says so.

## Consequences

- A visitor sees their budget, dates and checklist before the model has started;
  a screen-reader user hears "plan ready" and then, separately, "ideas added".
- The server rebuilds the plan for the second call instead of accepting it in
  the body. This costs a millisecond and removes an entire class of attack in
  which the client tells the model what the numbers are.
- The calendar export and CSV are generated from the first response, so they
  work even when the model does not.
- The client has to coordinate two requests and two states; the front end
  (`public/js/state.js`) keeps a single current plan and renders the AI parts
  into cells and lists that already exist, so they fill in place rather than
  rebuilding the page.
