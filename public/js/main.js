// @ts-check
/**
 * Utsav Planner front end — the entry point index.html loads.
 *
 * Three rules hold throughout the modules it wires together:
 *
 *  1. **Model output is untrusted.** Every string from the server is written
 *     as text, through `textContent` or `append()` of a string, never parsed
 *     as markup. There is no `innerHTML` in the front end, and the CSP's
 *     Trusted Types directive makes the browser refuse one if it appears.
 *  2. **Numbers first, words second.** `/api/plan` is pure computation and
 *     answers in milliseconds; it is rendered immediately. `/api/personalise`
 *     is the model and may take seconds; it fills in afterwards, and if it
 *     fails the plan is still complete.
 *  3. **Announcements are rationed.** The stages of a request are announced
 *     through one hidden polite status region, #progress. Three small visible
 *     ones report a single result each: the ideas status, the vendor count and
 *     the copy result. Busy controls use `aria-disabled` so focus is never
 *     dropped.
 */
import { wireBuild } from './build.js';
import { wireExports } from './exports.js';
import { wireForm } from './form.js';
import { wireRefine } from './refine.js';
import { wireTheme } from './theme.js';

wireTheme();
wireForm();
wireBuild();
wireRefine();
wireExports();
