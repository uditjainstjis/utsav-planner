// @ts-check
/** The generative step: ask for ideas, questions and notes, and fill them in under the plan. */
import { postJson } from './api.js';
import { renderBudgetNotes } from './render-budget.js';
import { renderIdeas, setIdeasStatus } from './render-ideas.js';
import { renderVendorQuestions } from './render-vendors.js';

/** @typedef {import('../../src/lib/types').Personalisation} Personalisation */
/** @typedef {import('../../src/lib/types').PlanRequest} PlanRequest */
/** @typedef {import('./form.js').Brief} Brief */
/** @typedef {import('./state.js').Current} Current */

/**
 * Ask the model for ideas about `request` and fill them in under the plan in
 * `state`. The plan is already on screen, so a failure here degrades only the
 * ideas card, with `failed` as its status.
 * @param {Current} state
 * @param {Brief | PlanRequest} request
 * @param {string} failed
 * @returns {Promise<Personalisation | null>}
 */
export async function loadIdeas(state, request, failed) {
  try {
    const t0 = performance.now();
    const p = await postJson('/api/personalise', request);
    state.personalisation = p;
    renderBudgetNotes(p);
    renderVendorQuestions(p);
    renderIdeas(state.plan, p);
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    if (p.source === 'model') {
      setIdeasStatus(
        `${p.ideas.length} ideas from ${p.model}${p.cached ? ', cached' : `, ${secs}s`}`,
        'ok',
      );
    } else {
      setIdeasStatus('The AI was unavailable — showing general ideas instead.', 'degraded');
    }
    return p;
  } catch {
    setIdeasStatus(failed, 'degraded');
    return null;
  }
}
