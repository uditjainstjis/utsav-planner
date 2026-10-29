# Security

Utsav Planner takes four numbers, a date and one free-text field from an
anonymous visitor, and shows them a plan. That is the whole attack surface, and
this document describes how each part of it is defended, in the order a request
meets the controls.

## Threat model

| Asset                                       | Threat                                               | Control                                                                                                                                                            |
| ------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The visitor's inputs (budget, date, wishes) | Disclosure to a third party or an intermediary cache | No storage; `no-store` on every API response; no third-party origins; no analytics                                                                                 |
| The model                                   | Prompt injection through the wishes field            | Deterministic screen + nonce fence; model never sees numbers it can change                                                                                         |
| The page                                    | Script injection through model output                | `textContent` only; CSP without `unsafe-inline`; Trusted Types enforced by the browser                                                                             |
| The service                                 | Abuse: cross-site requests, floods, oversized bodies | Content-type gate, `Sec-Fetch-Site` check, per-IP rate limit, bounded fields                                                                                       |
| The supply chain                            | A compromised dependency or Action                   | One runtime dependency; lockfile; patched overrides and an install-script allowlist; CodeQL, dependency-review and Dependabot in CI; Actions pinned to commit SHAs |

There is no login, no session and no database. A visitor has nothing to steal
from another visitor, and the service holds no credential that a request could
exfiltrate: inference is reached through a Workers AI **binding**, so no API key
exists in the repository, in CI, or in the deployed bundle.

## 1. The request gate (`src/index.ts`)

Both `POST` routes run the same three checks, in this order:

1. **`Content-Type: application/json` is required.** This is the CSRF control. A
   cross-origin page can fire a `fetch` with `text/plain` without a preflight —
   a CORS "simple request" — but it cannot claim `application/json` without one,
   and this service has no CORS policy for a preflight to succeed against.
2. **`Sec-Fetch-Site` must be `same-origin` or `none`.** Browsers set this
   header and page script cannot forge it. It is absent for `curl`, which is
   allowed: a direct API call carries no ambient authority, so there is nothing
   to protect it from. What must not happen is a _browser_ being used as a
   confused deputy.
3. **Per-IP rate limit** (60 requests a minute, Cloudflare's rate-limit
   binding), applied last so a rejected cross-site request never spends the
   victim's budget.

## 2. Validation (`src/lib/validate.ts`)

Every field is checked for type, bounds and shape, and the error names the field
(`{ error, code, field }`) so the UI can mark the control that failed.

- Occasion: one of three values. Date: `YYYY-MM-DD`, must exist on the calendar
  (`2027-02-30` is rejected, not rolled into March), today or later, at most two
  years ahead.
- Guests 1–5,000; budget ₹1,000–₹10,00,00,000; whole numbers after rounding.
- Text fields are capped (60 / 80 / 600 characters) and stripped of C0/C1
  control characters.
- The JSON body is parsed once; a non-object body is a 400, never an exception.
  Every field inside it is bounded (600-character wishes, 200-character change,
  80/60-character names), so the largest useful body is about a kilobyte;
  anything beyond Cloudflare's request limit never reaches the Worker.

There is no regular expression in the validation path that can backtrack
polynomially: the date pattern is anchored and fixed-width, and the control
character strip is a single character class.

## 3. The model boundary (`src/lib/guard.ts`, `src/prompts/plan.ts`, `src/lib/ai.ts`)

The wishes field is the only free text a visitor can send, and the only place a
visitor's words reach a model.

**On the way in:**

- `scanForInjection` runs seven deterministic rules — instruction override, role
  hijack, verdict steering, suppression, prompt exfiltration, chat delimiter
  tokens, runs of invisible characters. Findings are **shown to the user**, not
  silently dropped: a planner should know their wishes contained text aimed at a
  machine. The screen is pure code so it cannot be argued with.
- `fenceUntrusted` defangs chat control tokens and wraps the text in a delimiter
  generated from 12 random bytes per request. The text cannot guess the
  delimiter, so it cannot close the data section and start issuing instructions.
  The nonce itself is removed from the text first, so it cannot be forged. The
  system prompt names the fence and tells the model it is data.
- **The model is never asked for a number.** Budget lines, dates, per-guest
  figures and the vendor list are computed in code and _stated_ to the model. A
  successful injection can therefore change the wording of an idea; it cannot
  change the budget.

**On the way out** (`coercePersonalisation`):

- The reply is parsed defensively (`extractJson` tolerates prose and code
  fences; anything that is not an object is discarded).
- Every string is whitespace-normalised and length-bounded.
- Every enumeration is re-checked in code even though the schema asked for it.
- Every `budgetLineId` and every vendor id must belong to the plan the model was
  shown; anything else is nulled or dropped.
- A reply with no usable ideas is rejected so the next model is tried; if both
  fail, deterministic guidance is returned and **labelled**
  `source: "fallback"`.

Nothing a model writes is ever executed, templated, or interpreted as markup.

### The refine step

`POST /api/refine` accepts one more free-text field, the change (≤200
characters). It is read by anchored regular expressions for an amount, a
headcount and a date — fixed alternations and bounded repeats, no nested
quantifiers, so no input can make them backtrack polynomially — and the parsed
values go through the same range limits as the form (`validateDate` for the
date, the guest and budget bounds for the numbers). The sentence is then
appended to the wishes as a labelled "Adjustment requested" line and re-bounded
to the wishes limit: at most the three most recent adjustments are kept, older
ones are dropped first, and the result can never exceed 600 characters, so the
brief that reaches the model on the next `/api/personalise` call is subject to
exactly the same screen, fence and validation as a fresh one. The refine route
itself never calls a model, and `test/api.test.ts` asserts it.

## 4. The page (`src/lib/headers.ts`, `public/_headers`, `public/app.js`)

Every response, API or asset, carries the same policy. `test/api.test.ts`
asserts that the Worker's headers and the static `_headers` file are identical,
so neither can be hardened without the other.

- **CSP**: `default-src 'self'`; scripts and styles only from this origin (there
  is no inline script or style anywhere, so no `unsafe-inline`);
  `img-src 'self' data:` for the favicon; everything else `'none'`;
  `frame-ancestors 'none'`; `base-uri 'none'`; `form-action 'none'`.
- **Trusted Types**: `require-trusted-types-for 'script'; trusted-types 'none'`
  makes the browser refuse every assignment to `innerHTML`, `outerHTML`,
  `insertAdjacentHTML` and `document.write`. The front end writes model output
  exclusively through `textContent`; this directive turns that convention into
  something a future commit cannot quietly break.
- **COOP / COEP / CORP** all set; the page loads no cross-origin resource, so
  cross-origin isolation costs nothing and closes a class of side channel.
- **HSTS** with preload, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, a
  `Permissions-Policy` that denies every feature by name,
  `Origin-Agent-Cluster: ?1`.
- API responses: `Cache-Control: no-store, no-cache, must-revalidate, private`.

The only persisted client state is the theme preference and the vendor checklist
ticks, in `localStorage`, keyed by occasion, date and headcount. No budget,
wishes or model output is stored.

## 5. Caching

Personalisations are cached in the Workers Cache API for seven days under a
SHA-256 of the inputs that determine them (occasion, guests, budget, city,
occasion name, wishes, lead-time bucket, prompt version, model). The cache is
per-colocation and never leaves Cloudflare. A fallback answer is never cached,
so a model outage is retried on the next request rather than remembered.

## 6. Supply chain and CI

- One runtime dependency (`hono`). The lockfile is committed; `npm ci` is used
  everywhere.
- Transitive development dependencies with a published advisory are pinned to a
  patched release through `overrides` in `package.json`: `undici` 7.30.1,
  `sharp` 0.35.5, and `zod` 4.6.7 (GHSA-mrhx-c7xc-m3w5, reached through
  `@cloudflare/vitest-pool-workers`). `npm audit` reports no vulnerabilities.
- `allowScripts` in `package.json` lists the install scripts npm may run, pinned
  by version: `esbuild` 0.28.1 and 0.28.2 and `workerd` 1.20260815.1 and
  1.20261019.1, each of which installs its platform binary. `fsevents` is
  denied; it ships a prebuilt binary. npm releases that read the field (11.x)
  warn about any install script not listed and never run a denied one.
- `.github/workflows/ci.yml`: typecheck, lint, format check, tests with
  coverage, `npm audit --audit-level=high`.
- `.github/workflows/codeql.yml`: CodeQL on every push and weekly.
- `.github/workflows/dependency-review.yml`: blocks pull requests that add a
  dependency with a known vulnerability or a disallowed licence.
- `.github/dependabot.yml`: weekly updates for npm and Actions.
- Every `uses:` in every workflow is pinned to a commit SHA, with the release it
  corresponds to in a trailing comment. Workflow permissions default to
  `contents: read`.

## 7. Reporting

`/.well-known/security.txt` is served from the deployment (RFC 9116). Please
report issues to the contact listed there; acknowledgement within 72 hours, and
a fix or a public note within 14 days of a confirmed report.

## What this service deliberately does not do

- It does not store plans server-side, so there is no account to protect, no
  data to breach, and no plan that can be enumerated.
- It does not let the model see or set any number, so there is no path from
  prompt injection to a wrong budget.
- It does not load anything from a third party, so there is no supply chain at
  runtime at all.
