# Utsav Planner

**Live: https://utsav-planner.seriouss.workers.dev**

A GenAI-powered planning assistant for **weddings, birthdays and community
events**. Tell it the occasion, date, headcount and budget — and in your own
words what you want — and it returns the four things every celebration needs:

| Deliverable                                                                                                                                                                                                                                                        | How it is produced                                                                                           | Where                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| **Budget** — split by category, per-guest figures, warnings when the money is thin                                                                                                                                                                                 | Pure arithmetic from occasion-specific shares; lines always sum to the exact total                           | `src/lib/budget.ts`                     |
| **Timeline** — dated milestones counted back from the event, compressed when time is short, exportable to any calendar                                                                                                                                             | Pure date arithmetic; RFC 5545 `.ics` export                                                                 | `src/lib/timeline.ts`, `src/lib/ics.ts` |
| **Vendor checklist** — who to book, by when, paid from which line, with the questions to ask                                                                                                                                                                       | Deterministic template tied to the timeline; the model adds questions specific to your wishes                | `src/lib/vendors.ts`                    |
| **Personalised ideas** — theme, decor, food, activities, favours, invitations, each with an honest cost tier and the budget line it draws on                                                                                                                       | Workers AI, JSON-schema constrained, validated against the plan, with a deterministic fallback               | `src/lib/ai/`, `src/prompts/plan.ts`    |
| **Refine in words** — "budget 12 lakh, 300 guests, move it to March, add a mehndi night": amounts, headcount and dates are re-read and the whole plan recomputed in code; the wording goes to the model and the ideas are rewritten; every change applied is shown | Deterministic parser for amounts, headcount and dates; the sentence joins the brief as a labelled adjustment | `src/lib/refine/`                       |

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
  ideas, one or two questions per vendor, a sentence per budget line. Its reply
  is schema-constrained, then checked in code against the plan it was shown:
  every id must exist, every string is bounded, every enumeration re-verified.
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
   removes every sentence the injection screen flags from the occasion name,
   city and wishes, fences what is left in a per-request nonce, and sends **four
   small concurrent asks** to Workers AI — two halves of the ideas, the vendor
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
  all previous instructions…" in the wishes. The screen catches it and the page
  shows you exactly what it found; those sentences are removed before the model
  sees the brief, and it is given only the rest.

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
src/index.ts                Hono router: /api/health, /api/plan, /api/refine, /api/personalise, assets
src/env.ts                  the Worker's bindings, as `wrangler types` generates them
src/shared/constants.ts     event types, limits, labels, messages, money, today: for page and Worker
src/lib/types.ts            the domain types: request, plan, personalisation
src/lib/constants.ts        the Worker's runtime enumerations: idea categories, cost tiers, screened fields
src/lib/validate.ts         field-level validation, named errors
src/lib/dates.ts            calendar-day arithmetic on YYYY-MM-DD strings, in UTC
src/lib/apportion.ts        largest-remainder split of a total into whole rupees
src/lib/budget.ts           occasion shares → lines that sum exactly; warnings
src/lib/budget-data.ts      the budget templates: shares and per-guest floors (data)
src/lib/timeline.ts         milestones counted back from the date; compression
src/lib/timeline-data.ts    the milestone templates (data)
src/lib/ics.ts              RFC 5545 calendar export
src/lib/vendors.ts          checklist tied to timeline milestones and budget lines
src/lib/vendors-data.ts     the vendor checklists (data)
src/lib/plan.ts             assembles the deterministic plan; injection screen
src/lib/refine/apply.ts     applies a change sentence to a request; lists what changed
src/lib/refine/dates.ts     reads a date from a sentence
src/lib/refine/numbers.ts   reads a budget and a headcount from a sentence
src/lib/refine/span.ts      where in the sentence a match was
src/lib/refine/wishes.ts    the wishes and the adjustments appended to them
src/lib/guard.ts            deterministic prompt-injection screen + nonce fence
src/prompts/plan.ts         the facts block and the four schema-constrained asks
src/lib/ai/ask.ts           Workers AI calls: four concurrent parts, fallback model, timeout
src/lib/ai/reply.ts         the JSON object in a reply, whatever wraps it
src/lib/ai/coerce.ts        reply → checked personalisation: ids, bounds, enums
src/lib/ai/personalise.ts   cache, then ask, then deterministic guidance per section
src/lib/fallback.ts         deterministic guidance when no model answers
src/lib/fallback-data.ts    the generic ideas (data)
src/lib/headers.ts          CSP, Trusted Types, COOP/COEP/CORP, HSTS, permissions policy
src/lib/cache.ts            content-addressed Workers Cache API wrapper
scripts/build-assets.mjs    writes the generated files in public/ from src/

public/                     static single-page app: index.html, styles.css, fonts/, js/
public/_headers             generated from src/lib/headers.ts
public/js/constants.js      generated: src/shared/constants.ts compiled, with its .d.ts
public/js/dates.js          generated: src/lib/dates.ts compiled, with its .d.ts
public/js/main.js           entry point: wires the modules below
public/js/dom.js            every element the script touches, looked up once
public/js/state.js          the plan on screen, the progress announcer, busy buttons
public/js/api.js            the three POST calls, with timeouts and readable errors
public/js/form.js           the brief form: limits, reading, client checks, field errors
public/js/samples.js        the four example briefs
public/js/build.js          "Build my plan": numbers first, then ideas
public/js/refine.js         "Change something": the refine round trip
public/js/personalise.js    the ideas call, dropped if its plan was replaced
public/js/render-*.js       plan summary, budget, timeline, vendors, ideas
public/js/exports.js        CSV, .ics, copy as text, print
public/js/format.js         share, date and cost-tier formatting
public/js/theme.js          the light/dark toggle
```

Runs on Cloudflare Workers with one runtime dependency (`hono`). Static assets
are served from the edge without invoking the Worker; `run_worker_first` is
scoped to `/api/*`.

`public/js/constants.js`, `public/js/dates.js` (each with its `.d.ts`) and
`public/_headers` are build outputs, generated from `src/shared/constants.ts`,
`src/lib/dates.ts` and `src/lib/headers.ts` by `scripts/build-assets.mjs`, which
npm runs before typechecking, linting and tests and wrangler runs as its
`build.command` before `dev` and `deploy`; they are gitignored, so they cannot
drift from their sources.

## Security

Threat model and controls in [SECURITY.md](SECURITY.md). In short: content-type
and `Sec-Fetch-Site` gate (CSRF), per-IP rate limit, bounded and typed inputs,
deterministic prompt-injection screening of the occasion name, city and wishes
that is _shown_ to the user and keeps flagged sentences from the model, a nonce
fence around the rest, a CSP with no `unsafe-*`, Trusted Types enforced by the
browser, `no-store` on every API response, no server-side storage, no
third-party origin, SHA-pinned Actions, CodeQL, dependency review and Dependabot
in CI, and `/.well-known/security.txt`.

## Accessibility

Enforced in CI: axe-core over the shipped markup in both themes, a contrast test
that converts the OKLCH tokens and asserts WCAG ratios, and structural checks
through the runtime's own HTML parser. Design decisions and the measured numbers
are in [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md).

## Testing

```
npm run check     # Worker types and generated files, typecheck (strict, noUncheckedIndexedAccess; public/js via JSDoc), lint (type-aware, public/js included; functions ≤ 40 lines outside tests), format check, tests
npm run coverage  # istanbul report
```

351 tests across 25 files. 288 run inside **workerd** (the deployed runtime);
the 63 in the seven `*.dom.test.ts` suites (axe, contrast, the shipped assets,
the file references, and the front end's plan form, refine form and AI marks)
run in jsdom, because they need a DOM or read files off disk. Coverage of
`src/`: 99.46% statements, 92.19% branches, 100% functions, 99.59% lines. 26 of
333 branches are uncovered, 16 of them in the model-reply handling
(`src/lib/ai/`) and the refine parser (`src/lib/refine/`), mostly `??` fallbacks
and defensive checks. The suite is hermetic: the AI binding is a stub, so it
runs identically on a laptop and on a CI runner holding no credentials.

What is covered, and the property each test holds:

- **budget** — lines sum exactly to the total for any input (largest-remainder
  apportionment), shares sum to one, per-guest arithmetic, every warning
  threshold from both sides, Indian digit grouping.
- **timeline** — every milestone lands on the right calendar day across month
  ends and a leap day; proportional compression keeps order; a same-day event
  puts every milestone on the day; the `.ics` is well-formed, CRLF, folded at 75
  octets without splitting a multi-byte character, escaped, deterministic.
- **vendors** — every vendor is paid from a budget line that exists and booked
  by a milestone that exists; checklists are fresh arrays.
- **validate** — every error code and the field it names; impossible dates are
  rejected rather than rolled over; control characters other than tab and line
  breaks are stripped.
- **ai** — envelope unwrapping, enum normalisation, id checking, string bounds,
  primary→fallback→deterministic, `sources` per section when one ask fails and
  the others answer, a call given up on aborted through its signal, cache hit
  and cache bypass on any generic section, the cache written through
  `waitUntil`, schema-constrained call shape.
- **api** — CSRF gate, cross-site rejection, rate limit by IP (and that it is
  not spent on rejected requests), the full security policy on API responses,
  faults and the front end, no configuration leaked by `/api/health`, no flagged
  sentence in any of the four prompts sent and the rest of the name, city and
  wishes fenced, 404 under `/api`.
- **headers** — `public/_headers` states exactly the headers the Worker sets,
  plus caching for fonts and `security.txt` only; no `unsafe-*` in the CSP.
- **refine** — Indian and Western magnitudes (lakh, crore, k, million),
  headcount phrasings, explicit/relative/month-only dates, all three at once, a
  sentence with no numbers, month names and keywords read only as whole words
  ("decor", "marquees", "maybe" are not months; the "rs" in "speakers" is not
  rupees), unchanged values reported as no change, out-of-range or past values
  named by field, the brief re-bounded across six turns.
- **guard** — each injection rule, its keywords as whole words ("promptly" is
  not "prompt"), the finding cap keeping the earliest findings, the field named;
  sentence removal of every match, not only those shown; fence defanging, nonce
  forgery.
- **app** (jsdom, the real `index.html` and `public/js` modules) — every
  control's bounds and the help stating them come from the shared limits; a
  brief the server rejects is shown at its field and focused, also on a second
  submit with a plan already on screen; an ideas failure degrades only the ideas
  card; the 730-day limit is enforced before any request; a refinement is
  applied, announced and written back to the form, and a rejected one is shown
  at the change field; ideas that arrive, or fail, after their plan was replaced
  are dropped; the guard notice names the field each finding was in; vendor
  questions and budget notes carry the AI mark exactly when a model wrote that
  section, also when the ideas beside them are generic, and the other way round;
  a ticked vendor stays ticked when a change moves the headcount; the plan
  copied as text names an unnamed occasion once.
- **assets** (jsdom) — fonts are content-addressed and preloaded as used;
  `public/js/constants.js` exports exactly what `src/shared/constants.ts` does,
  with the same values and wording, and `public/js/dates.js` what
  `src/lib/dates.ts` does, with the same days; `index.html` states no `min`,
  `max` or `maxlength` and leaves the guest and budget help empty, because
  `form.js` sets all of them from `constants.js` when the page starts (the
  **app** suite checks the result); the calendar's name matches the occasion
  label.
- **references** (jsdom) — every file a comment or a document names exists, so a
  renamed or split module leaves no stale name behind. It reads the tree less
  what `.gitignore` names, so it runs the same outside a git checkout.
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
