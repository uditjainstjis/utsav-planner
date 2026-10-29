# Accessibility

Utsav Planner is a form and a long, structured result. Both are built so that
someone using a screen reader, a keyboard, a zoomed page or a high-contrast
theme gets the same plan as everyone else. What is mechanically checkable is
checked by the test suite on every push; what needs judgement was checked by
hand and is recorded here.

## What is enforced in CI

| Claim                                                                                                                                                   | Where it is enforced                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| axe-core finds no WCAG 2.1 A/AA or best-practice violation in the shipped markup, with the shipped stylesheet, in the default, light and dark themes    | `test/axe.dom.test.ts` — runs the real axe engine in jsdom; includes a negative control that must fail                                               |
| Every text colour reaches **4.5:1** on every surface, in both themes; body text reaches 7:1; the focus ring reaches 3:1                                 | `test/contrast.dom.test.ts` — converts the OKLCH tokens to sRGB and asserts the WCAG ratio, so a palette change that breaks contrast fails the build |
| One `<main>`, one `<h1>`, banner and contentinfo landmarks, no skipped heading level, skip link targets `#main`                                         | `test/a11y.test.ts` — parses the served HTML with HTMLRewriter, the runtime's own parser                                                             |
| Every input, select and textarea can be named; every `<label for>` and every `aria-describedby`/`aria-labelledby` resolves; every fieldset has a legend | `test/a11y.test.ts`                                                                                                                                  |
| Every button has a name and an explicit `type`; every link has an href and text; no positive `tabindex`; no inline handlers                             | `test/a11y.test.ts`                                                                                                                                  |
| Exactly four polite `role="status"` regions, named below; errors through `role="alert"`; the result lists themselves are not live                       | `test/a11y.test.ts`                                                                                                                                  |

## Measured contrast (WCAG 2.x ratio, worst case over the three surfaces)

| Token                                      | Light theme | Dark theme | Needs | Used for                     |
| ------------------------------------------ | ----------- | ---------- | ----- | ---------------------------- |
| `ink`                                      | 15.09       | 14.62      | 4.5   | body text, headings, values  |
| `ink-soft`                                 | 5.58        | 9.68       | 4.5   | supporting copy, table notes |
| `ink-faint`                                | 4.70        | 8.44       | 4.5   | labels, metadata, counters   |
| `accent`                                   | 6.65        | 8.79       | 4.5   | links, the AI badge border   |
| `risk-high`                                | 5.56        | 7.76       | 4.5   | budget warnings              |
| `risk-low`                                 | 5.70        | 8.59       | 4.5   | "generous budget" note       |
| page colour on `accent` (the **AI** badge) | 7.16        | 10.15      | 4.5   | AI-authored markers          |
| `accent-bright`                            | 3.03        | 6.52       | 3     | the focus ring (non-text)    |

These figures were corrected when a defect in the test's converter was found: it
applied the sRGB transfer curve to colours that were already linear, which
overstated every light-theme ratio (it reported `ink-soft` at 11.80) and
understated the dark ones. White, black and identical pairs come out the same
either way, so the old self-check could not see it; the test now also checks two
published mid-tone ratios (#ff0000 on white is 4.00:1). The tightest pairs are
light `ink-faint` on `surface-2` at 4.70 and the light focus ring at 3.03.

## Design decisions, and why

**Colour never carries meaning alone.** Budget warnings have a glyph (▲ ● ○) and
words; cost tiers are "● Low cost" / "●● Mid cost" / "●●● Higher cost";
AI-written text carries a visible "AI" badge, not just a tint; a booked vendor
is struck through as well as faded (WCAG 1.4.1).

**Native controls over ARIA widgets.** The occasion picker is three radio
buttons in a fieldset, so arrow-key movement, group semantics and "2 of 3" are
free. The date is `<input type="date">` with `min`/`max`, the numbers are
`type="number"` with `inputmode="numeric"`. Nothing is rebuilt that the platform
already does accessibly.

**Errors are attached to the control that failed.** The server returns the
failing `field`; the client sets `aria-invalid="true"` on that control, adds the
error to its `aria-describedby`, moves focus to it, and announces the message
once through `role="alert"`. Navigating back to the field later re-reads the
error (WCAG 3.3.1, 3.3.3).

**Busy state never steals focus.** The build button uses `aria-disabled` rather
than `disabled`, because disabling the element the user just activated drops
focus to `<body>` and loses their place.

**Announcements are rationed.** The stages of a request — "building", "plan
ready (with counts)", "ideas added (with timing)" — go through one hidden polite
`role="status"` region, `#progress`. Fourteen milestones and eight vendors are
ordinary content the user navigates at their own pace, not fourteen
interruptions. Three small visible regions are also polite `role="status"`, each
reporting one result where it appears: the ideas status (`#ideas-status`:
writing, done, or unavailable), the vendor "n of m booked" counter
(`#vendor-progress`, which changes when a box is ticked), and the copy result
(`#copy-status`). Four in all, asserted by `test/a11y.test.ts`.

**Focus moves to the result.** After a successful build, focus is placed on the
"Your plan" heading (`tabindex="-1"`), so a screen-reader user lands at the top
of what just appeared rather than remaining on the button three screens up.

**Structure is real.** The budget is a `<table>` with a caption, column and row
headers and a `<tfoot>` total, so a screen reader can read a cell as "Catering,
Amount, ₹4,95,000". The timeline and checklists are ordered and unordered lists.
Section headings go h1 → h2 → h3 → h4 without skipping; template content uses h4
because it is cloned under an h3.

**The vendor checkboxes persist.** Ticks are stored per plan in `localStorage`
so a user who returns to confirm a booking does not have to remember which ones
they had ticked.

**Motion is optional.** The only animation is the small "writing ideas" spinner,
and it is disabled under `prefers-reduced-motion: reduce`.

**Print is a first-class output.** A print stylesheet hides the form and the
chrome and keeps every section on its own page where possible, so "save as PDF"
produces a plan that can be handed to a parent or a committee.

**Type and zoom.** Body text is 17–18px; the page reflows to a single column
below 760px with no horizontal scroll; the budget table scrolls within its own
container at narrow widths rather than breaking the page.

## Checked by hand

With VoiceOver on Safari and Chrome (macOS), the full flow — fill the form,
build, read the budget table, tick a vendor, download the calendar — reads in a
sensible order with no unlabelled control, no silent state change and no double
announcement. Keyboard-only use reaches every control with a visible focus ring
(a 2px `:focus-visible` outline in `accent-bright`, offset 3px).

## Known limits

- The date picker's pop-up calendar is the browser's own; its accessibility
  varies by browser. Typing the date works everywhere.
- The ICS and CSV downloads are produced by the browser's download mechanism; a
  screen reader announces them as the browser announces any download.
