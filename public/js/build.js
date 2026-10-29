// @ts-check
/** "Build my plan": numbers first, then words. */
import { ApiError, messageOf, postJson } from './api.js';
import { els } from './dom.js';
import { clientValidate, hideError, readForm, showError } from './form.js';
import { loadIdeas } from './personalise.js';
import { resetIdeas } from './render-ideas.js';
import { showPlan } from './render-plan.js';
import { announce, isBusy, whileBusy } from './state.js';

/** @typedef {import('./form.js').Brief} Brief */

/**
 * Build and show the plan, then fill in ideas. A rejected brief is shown next
 * to the field the server named, even when an earlier plan is still on screen.
 * @param {Brief} body
 */
async function submitPlan(body) {
  announce('Building your plan.');
  const started = performance.now();
  let reply;
  try {
    reply = await postJson('/api/plan', body);
  } catch (err) {
    showError(
      messageOf(err, 'Something went wrong. Please try again.'),
      err instanceof ApiError ? err.field : undefined,
    );
    announce('The plan could not be built.');
    return;
  }
  const state = showPlan(reply);
  const { plan } = reply;
  resetIdeas('Writing ideas for your wishes…');
  announce(
    `Plan ready: ${plan.budget.lines.length} budget lines, ${plan.timeline.milestones.length} milestones, ${plan.vendors.length} vendors. Personalised ideas are being written.`,
  );
  els.resultsTitle.focus();

  const p = await loadIdeas(
    state,
    body,
    'Ideas could not be written just now. The rest of the plan stands.',
  );
  if (p) {
    announce(
      `${p.ideas.length} ideas added. Whole plan ready in ${((performance.now() - started) / 1000).toFixed(1)} seconds.`,
    );
  }
}

export function wireBuild() {
  els.form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (isBusy('plan')) return;
    hideError();
    const body = readForm();
    const bad = clientValidate(body);
    if (bad) {
      showError(...bad);
      return;
    }
    void whileBusy('plan', () => submitPlan(body));
  });
}
