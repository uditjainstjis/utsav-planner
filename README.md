# Utsav Planner

**Live: https://utsav-planner.seriouss.workers.dev**

A GenAI-powered planning assistant for **weddings, birthdays and community
events**. Tell it the occasion, date, headcount and budget — and in your own
words what you want — and it returns the four things every celebration needs:

| Deliverable                                                                                                                                                                                                                                                        | How it is produced                                                                             | Where                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------- |
| **Budget** — split by category, per-guest figures, warnings when the money is thin                                                                                                                                                                                 | Pure arithmetic from occasion-specific shares; lines always sum to the exact total             | `src/lib/budget.ts`                    |
| **Timeline** — dated milestones counted back from the event, compressed when time is short, exportable to any calendar                                                                                                                                             | Pure date arithmetic; RFC 5545 `.ics` export                                                   | `src/lib/timeline.ts`                  |
| **Vendor checklist** — who to book, by when, paid from which line, with the questions to ask                                                                                                                                                                       | Deterministic template tied to the timeline; the model adds questions specific to your wishes  | `src/lib/vendors.ts`                   |
| **Personalised ideas** — theme, decor, food, activities, favours, invitations, each with an honest cost tier and the budget line it draws on                                                                                                                       | Workers AI, JSON-schema constrained, validated against the plan, with a deterministic fallback | `src/lib/ai.ts`, `src/prompts/plan.ts` |
| **Refine in words** — "budget 12 lakh, 300 guests, move it to March, add a mehndi night": amounts, headcount and dates are re-read and the whole plan recomputed in code; the wording goes to the model and the ideas are rewritten; every change applied is shown | Deterministic parser for amounts and headcount; the rest is a labelled adjustment to the brief | `src/lib/refine.ts`                    |

Built for **PromptWars Virtual, Challenge 5: Celebration & Event Planner**.

---

## The design decision that carries the project

**The AI suggests; the code decides.**

A generative model is the right tool for _ideas that fit a dinosaur party for
twenty five-year-olds with two nut allergies_ and the wrong tool for _whether
₹4,95,000 is 33% of ₹15,00,000_. So the two jobs are separated completely:

- Everything numeric — the budget split, the per-guest figures, the warning
  thresholds, every date, the book-by deadlines — is computed by small pure
  functions with unit tests. The model is **told** those numbers and never asked
  to produce one.
- The model writes the parts that need taste: a summary in the user's terms, six
  ideas, a question per vendor, a sentence per budget line. Its reply is
  schema-constrained, then checked in code against the plan it was shown: every
  id must exist, every string is bounded, every enumeration re-verified.
- If the model is unavailable, the plan still ships complete — with generic
  ideas, clearly labelled as such — because `/api/plan` never waits for it.

A successful prompt injection can therefore change the wording of an idea. It
cannot change the budget. See [SECURITY.md](SECURITY.md).

## What happens when you press "Build my plan"

1. The browser `POST`s the form to **`/api/plan`**. The Worker validates every
   field (naming the one that failed), builds the budget, timeline and vendor
   checklist, and returns them with a ready-made `.ics` — in under a second,
   with no model call. The page renders them immediately.
2. The browser then `POST`s the same form to **`/api/personalise`**. The Worker
   rebuilds the plan server-side (it never trusts a plan sent by the client),
   fences the free-text wishes in a per-request nonce, and sends **four small
   concurrent asks** to Workers AI — two halves of the ideas, the vendor
   questions, the budget notes — each with its own JSON schema. Replies are
   validated and merged; any part that fails falls back to deterministic
   guidance. Ideas, budget notes and AI-written vendor questions fill in.
3. Repeat briefs are served from the Workers Cache API and say so.
4. Under the plan, **"Change something"** takes a sentence. `POST /api/refine`
   reads any budget, headcount or date in it ("12 lakh", "₹9,50,000", "300
   guests", "15 March 2027", "in 3 weeks", "move it to March"), recomputes
   budget, timeline and checklist in code, and returns the exact changes it
   applied. The sentence is appended to the brief as a labelled adjustment and
   the page calls `/api/personalise` again, so the ideas, questions and notes
   are rewritten around it. Nothing is silently reinterpreted: what changed is
   listed, and a number the parser could not read is simply not changed.

Measured end to end in the browser against the live deployment: the first build
took **65.8 s** with one large schema-constrained reply; the same content as
four parallel parts arrives in **8.5 s** on a fresh brief (and instantly on a
repeat). The measurements and the model comparison are in
[docs/EVALUATION.md](docs/EVALUATION.md).

## Try it

- **Jaipur wedding, 250 guests** — ₹15 lakh, vegetarian, pastel and marigold,
  live dhol. Watch the catering line and the questions it generates for the
  caterer.
- **5th birthday, 20 kids** — ₹25,000, dinosaur theme, nut allergies. Thirty
  days out, so the template compresses.
- **Society Diwali mela, 400 people** — ₹1.8 lakh, eco-friendly. Permits, first
  aid and volunteers appear only for a community event.
- **Wishes with hidden AI instructions** — the fourth example carries "ignore
  all previous instructions…" in the wishes. The screen catches it, the page
  shows you exactly what it found, and the plan is built from the rest.

Then: tick vendors as you book them (ticks persist on your device), download the
timeline to your calendar, the budget as CSV, copy the whole plan as text, or
print it.

## Generative AI: where and how

| Where                                                      | Model                                                                                                                          | Why                                                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `/api/personalise` — ideas, vendor questions, budget notes | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` via the Workers AI binding; fallback `@cf/mistralai/mistral-small-3.1-24b-instruct` | Chosen by measurement: the only models that returned schema-valid, plan-consistent output on every run; see docs/EVALUATION.md |

No API key exists anywhere in this project. Inference is reached through a
Cloudflare binding, so there is nothing to leak in the repository, in CI or in
the deployed bundle.

## Architecture

```
public/            static single-page app: index.html, app.js, styles.css
src/index.ts       Hono router: /api/health, /api/plan, /api/refine, /api/personalise, assets
src/lib/validate   field-level validation, named errors
src/lib/budget     shares → whole-rupee lines that sum exactly; warnings
src/lib/timeline   milestones counted back from the date; compression; .ics
src/lib/vendors    checklist tied to timeline milestones and budget lines
src/lib/plan       assembles the deterministic plan; injection screen
src/lib/refine     reads amounts and headcount from a sentence; applies them
src/lib/guard      deterministic prompt-injection screen + nonce fence
src/prompts/plan   the facts block and the four schema-constrained asks
src/lib/ai         Workers AI client: concurrency, fallback, validation, cache
src/lib/fallback   deterministic guidance when no model answers
src/lib/headers    CSP, Trusted Types, COOP/COEP/CORP, HSTS, permissions policy
src/lib/cache      content-addressed Workers Cache API wrapper
```

Runs on Cloudflare Workers with one runtime dependency (`hono`). Static assets
are served from the edge without invoking the Worker; `run_worker_first` is
scoped to `/api/*`.

## Security

Threat model and controls in [SECURITY.md](SECURITY.md). In short: content-type
and `Sec-Fetch-Site` gate (CSRF), per-IP rate limit, bounded and typed inputs,
deterministic prompt-injection screening that is _shown_ to the user, a nonce
fence around the only free text, a CSP with no `unsafe-*`, Trusted Types
enforced by the browser, `no-store` on every API response, no server-side
storage, no third-party origin, SHA-pinned Actions, CodeQL, dependency review
and Dependabot in CI, and `/.well-known/security.txt`.

## Accessibility

Enforced in CI: axe-core over the shipped markup in both themes, a contrast test
that converts the OKLCH tokens and asserts WCAG ratios, and structural checks
through the runtime's own HTML parser. Design decisions and the measured numbers
are in [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md).

## Testing

```
npm run check     # typecheck (strict + noUncheckedIndexedAccess), lint, format, tests
npm run coverage  # istanbul report
```

232 tests across 13 files, run inside **workerd** (the deployed runtime) for
everything but the DOM-only axe and contrast suites, which run in jsdom.
Coverage of `src/`: 99% statements, 100% functions, 86% branches (the uncovered
branches are defensive arms of the model-reply coercion). The suite is hermetic:
the AI binding is a stub, so it runs identically on a laptop and on a CI runner
holding no credentials.

What is covered, and the property each test holds:

- **budget** — lines sum exactly to the total for any input (largest-remainder
  apportionment), shares sum to one, per-guest arithmetic, every warning
  threshold from both sides, Indian digit grouping.
- **timeline** — every milestone lands on the right calendar day across month
  ends and a leap day; proportional compression keeps order; nothing is overdue
  for a same-day event; the `.ics` is well-formed, CRLF, folded at 75 octets
  without splitting a multi-byte character, escaped, deterministic.
- **vendors** — every vendor is paid from a budget line that exists and booked
  by a milestone that exists; checklists are fresh arrays.
- **validate** — every error code and the field it names; impossible dates are
  rejected rather than rolled over; control characters are stripped.
- **ai** — envelope unwrapping, enum normalisation, id checking, string bounds,
  primary→fallback→deterministic, cache hit and cache bypass on fallback,
  schema-constrained call shape.
- **api** — CSRF gate, cross-site rejection, rate limit by IP (and that it is
  not spent on rejected requests), identical security headers on API and assets,
  no configuration leaked by `/api/health`, fenced wishes in the actual prompt
  sent, 404 under `/api`.
- **refine** — Indian and Western magnitudes (lakh, crore, k, million),
  headcount phrasings, explicit/relative/month-only dates, all three at once, a
  sentence with no numbers, unchanged values reported as no change, out-of-range
  or past values named by field, the brief re-bounded across six turns.
- **guard** — each injection rule, the finding cap, document order, fence
  defanging, nonce forgery.
- **a11y / axe / contrast** — see above.

## Running locally

```
npm ci
npm run dev        # wrangler dev, with a remote Workers AI binding
npm run check
npm run deploy
```

## Decisions

- [ADR 0001 — Cloudflare Workers and Workers AI](docs/adr/0001-workers-and-workers-ai.md)
- [ADR 0002 — The AI suggests, the code decides](docs/adr/0002-ai-suggests-code-decides.md)
- [ADR 0003 — Four concurrent asks instead of one](docs/adr/0003-four-concurrent-asks.md)
- [ADR 0004 — The plan never waits for the model](docs/adr/0004-plan-never-waits.md)
- [ADR 0005 — Refining in words, with the numbers parsed in code](docs/adr/0005-refine-in-words.md)

## Licence

MIT. Built with Cloudflare Workers AI for PromptWars Virtual (Hack2skill ×
Google for Developers), Challenge 5.
