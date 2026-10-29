# Evaluation

How the model and the shape of the model call were chosen. Every figure here was
measured on this project's own prompts, through the same Workers AI binding the
deployment uses, on 23 Oct 2026. Nothing is carried over from a benchmark.

## 1. The shape of the call matters more than the model

The first build asked for the whole personalisation — summary, six ideas,
questions for every vendor, a note for every budget line — in one
schema-constrained reply of roughly 1,500 tokens. Measured end to end in the
browser: **65.8 s** on `llama-4-scout`. Schema-constrained decoding on Workers
AI is paid for per output token, so a long reply is slow regardless of how good
the model is.

Small concurrent asks, each with its own schema, finish in the time of the
longest one rather than the sum. The split was measured as three parts — ideas,
vendor questions, budget notes; the ideas part was later halved, which gives the
four asks the code sends today (ADR 0003). Same prompts, same models, measured
from a machine outside the deployment:

| Model                                                                   | One call, full schema | Three parallel parts (wall-clock) | Schema-valid                                                                     |
| ----------------------------------------------------------------------- | --------------------- | --------------------------------- | -------------------------------------------------------------------------------- |
| `@cf/meta/llama-4-scout-17b-16e-instruct`                               | 52–78 s               | 39–41 s (one timeout)             | 6/6 ideas, all ids valid                                                         |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast`                              | 21–23 s               | **9–11 s**                        | 6/6 ideas, 100% vendor and budget coverage, every run                            |
| `@cf/mistralai/mistral-small-3.1-24b-instruct`                          | 16 s                  | 7–10 s                            | 6/6 ideas; 2 of 9 parts used an id not in the plan                               |
| `@cf/qwen/qwen3-30b-a3b-fp8`                                            | 8–9 s                 | 3–7 s                             | reply arrives as `reasoning` with `content: null` under the token cap — unusable |
| `@cf/openai/gpt-oss-20b`                                                | —                     | 6–11 s                            | no schema fields returned                                                        |
| `@cf/zai-org/glm-5.3-flash`, `@cf/deepseek-ai/deepseek-v4.1-flash-1017` | —                     | —                                 | HTTP 5035: not available on this account tier                                    |

Three parts in parallel are **5–7× faster** than one call for the same model.
That is the change that made the feature usable, and it is structural: it does
not depend on which model is behind the binding.

## 2. Without a schema the reply is faster and wrong

The same prompts were also sent without `response_format`, asking for JSON in
prose. `llama-3.3-70b` answered in 11–14 s instead of 21–23 s — and omitted the
`title` and `category` fields from every idea. `mistral-small` capitalised the
enumerations (`"Low"`, `"Medium"`) and wrapped the object in a code fence. Both
are recoverable in code, but a reply that drifts from the contract is one that
will drift further on the next model update. The schema stays; the latency is
recovered by splitting instead.

## 3. Model selection

With the split in place the choice was between the two models that returned
schema-valid, plan-consistent output on every run:

- **Primary: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`.** 100% of ideas valid
  and 100% vendor/budget-line coverage on all nine part-runs; ideas part 9–11 s,
  the other two 2.3–4.5 s.
- **Fallback: `@cf/mistralai/mistral-small-3.1-24b-instruct`.** Slightly faster
  (ideas 6.6–7.3 s) but used an out-of-plan id in 2 of 9 runs. Those are nulled
  by `coercePersonalisation`, so it is safe as a fallback; it is not first
  choice.

Each of the four parts tries the primary and then the fallback independently, so
a transient failure on one part costs one extra model call, not a blank section.
If both fail, the part is filled from `src/lib/fallback.ts`, and the response's
`sources` labels that section `fallback` so the UI can say so.

## 4. What the user sees

The deterministic plan (`POST /api/plan`) renders in under a second — it is pure
arithmetic with no model call. The personalisation fills in afterwards. A
visitor therefore sees their budget, dates and checklist immediately and the
ideas a few seconds later, instead of a spinner for the whole of it.

Repeat requests with the same brief are served from the Workers Cache API
(seven-day TTL, keyed on a hash of the inputs and the prompt version) and report
`cached: true`.

## 5. Validation against the plan

Every reply is checked against the plan it was asked about, not just against the
schema: a `budgetLineId` the plan does not have becomes `null`, a vendor id the
plan does not have is dropped, enumerations are re-checked case-insensitively,
strings are bounded. `test/ai.test.ts` covers each of those paths with a
deliberately malformed reply.

## 6. What personalisation looks like

The same model, three sample briefs, the prompts as they stood that day. Every
line below came back from `/api/personalise` on the live deployment on 23 Oct
2026 — pasted, not paraphrased. The words that could only have come from the
brief are the point: marigold, dhol and sangeet for Jaipur; nut-free and
dinosaurs for a five-year-old; clay diyas and seed-bomb favours for an
eco-friendly mela.

**Jaipur wedding, 250 guests, ₹15,00,000 — "vegetarian only, pastel and
marigold, live dhol, sangeet"** — summary: _Riya & Arjun's wedding will host 250
guests in Jaipur, with ₹6,000 per guest to prioritize a memorable sangeet night.
The occasion demands a balance of traditio…_

- [theme · medium] **Royal Wedding Theme** — Use pastel colors
- [decor · low] **Marigold Mandap** — Adorn with marigold flowers
- [food · high] **Rajasthani Cuisine** — Serve dal bati churma
- [activity · medium] **Dhol Baraat** — Hire live dhol players
- [favour · low] **Marigold Favour** — Give marigold garlands
- [invite · high] **Custom Invite** — Design with pastel colours
- vendor question → venue: _Is outdoor space available for baraat?_
- vendor question → caterer: _Do you offer vegetarian only options?_
- budget note → catering: _Opt for local vegetarian cuisine_

**5th birthday, 20 kids, ₹25,000 — "dinosaur theme, two nut allergies"** —
summary: _Aarav turns 5 birthday party will host 20 guests in Pune, prioritise
safety with nut allergies. With ₹1,250 per guest, the party will be an intimate
celebration…_

- [theme · low] **Dino theme** — Use dinosaur props and balloons
- [food · medium] **Nut-free cake** — Order from a nut-free bakery
- [decor · high] **Dino decor** — Create a dinosaur den area
- [activity · medium] **Dino Egg Hunt** — Hide plastic eggs with treats
- [favour · low] **Dino Toy** — Give small plastic dinosaurs
- [invite · high] **Custom Invite** — Design with Aarav and dinosaurs
- vendor question → venue: _Is outdoor play area safe?_
- vendor question → caterer: _Nut-free cake options?_
- budget note → catering: _Nut free food options essential_

**Society Diwali mela, 400 people, ₹1,80,000 — "food stalls, kids zone, small
stage, eco-friendly, no plastic"** — summary: _The Society Diwali mela is a
large community event with 400 guests, and at ₹450 per guest, prioritise
eco-friendly decor to create a memorable experience. The e…_

- [theme · medium] **Eco-friendly Diwali** — Use biodegradable materials
- [decor · low] **Diya Decor** — Use clay diyas instead
- [food · medium] **Local Street Food** — Hire local food vendors
- [activity · low] **Lantern Making** — Use recycled paper and glue
- [favour · low] **Seed Bomb Favors** — Give clay balls with plant seeds
- [invite · low] **Customized E-invite** — Design with Diwali theme online
- vendor question → venue: _Noida parking options?_
- vendor question → caterer: _Biodegradable utensils used?_
- budget note → catering: _Opt for local food vendors_

When no model's ideas are usable, the ideas are filled from
`src/lib/fallback.ts` and the status line says "general ideas"; a section of
questions or notes filled from it carries no AI mark. The guidance is
deliberately generic, so a reader can tell the two apart.

## Reproducing

The prompts are built by `src/prompts/plan.ts` from any plan;
`test/plan.test.ts` shows how to build one. The measurements above were taken by
deploying a scratch Worker that forwards a stored prompt to a named model and
reports the elapsed time — the same binding, the same schema, no API key.
