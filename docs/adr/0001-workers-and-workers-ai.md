# ADR 0001 — Cloudflare Workers and Workers AI

**Status:** accepted · 2026-10-23

## Context

The challenge requires a deployed, publicly reachable GenAI application with no
cloud credits provided. The application has one expensive step (a model call)
and an otherwise tiny request footprint. It must be safe to leave running
unattended with no API key to rotate and no bill to watch.

## Decision

Run on Cloudflare Workers with the static front end served as Workers Assets,
and reach the model through the **Workers AI binding** rather than any HTTP API
with a key.

## Consequences

- There is no credential anywhere: not in the repository, not in CI, not in the
  deployed bundle. The binding is injected by the platform. The `/api/health`
  test asserts that no model name, binding or key is disclosed.
- The free tier covers the challenge's traffic; inference is metered in neurons,
  and the plan itself costs none because it never calls a model.
- Static assets never invoke the Worker (`run_worker_first: ["/api/*"]`), so
  CSS, JS and fonts are served from the edge cache; the same security headers
  are applied to them through `public/_headers`, which is generated from the
  Worker's own definition in `src/lib/headers.ts`.
- The test suite runs inside **workerd** through
  `@cloudflare/vitest-pool-workers`, so Request/Response, the Cache API,
  HTMLRewriter and `crypto` behave in tests exactly as in production. The AI
  binding is stubbed in tests, keeping the suite hermetic.
- The model catalogue is the platform's. Two candidates (`glm-5.3-flash`,
  `deepseek-v4.1-flash`) were unavailable on the account tier; the choice among
  the rest was measured (docs/EVALUATION.md).
