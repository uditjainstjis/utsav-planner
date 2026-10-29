// @ts-check
/**
 * "Change something": the conversational step. The server re-runs the numbers
 * it can read from the sentence and returns the exact changes; the wording goes
 * to the model on the personalise call that follows, exactly as for a fresh brief.
 */
import { messageOf, postJson } from './api.js';
import { MESSAGE } from './constants.js';
import { els } from './dom.js';
import { updateCount } from './form.js';
import { fmtDate } from './format.js';
import { loadIdeas } from './personalise.js';
import { resetIdeas } from './render-ideas.js';
import { showPlan } from './render-plan.js';
import { announce, getCurrent, isBusy, whileBusy } from './state.js';

/** @typedef {import('../../src/lib/refine/apply').Change} Change */
/** @typedef {import('../../src/lib/types').PlanRequest} PlanRequest */
/** @typedef {import('./state.js').Current} Current */

/** @type {Record<Change['field'], string>} */
const CHANGE_LABEL = {
  budget: 'Budget',
  guests: 'Guests',
  date: 'Date',
  wishes: 'Ideas rewritten for',
};

/** @param {Change[]} changes */
function renderChanges(changes) {
  els.changes.replaceChildren();
  for (const c of changes) {
    const li = document.createElement('li');
    li.className = `change change--${c.field}`;
    if (c.field === 'wishes') li.textContent = `${CHANGE_LABEL.wishes}: “${c.to}”`;
    else if (c.field === 'date')
      li.textContent = `${CHANGE_LABEL.date}: ${fmtDate(c.from)} → ${fmtDate(c.to)}`;
    else li.textContent = `${CHANGE_LABEL[c.field]}: ${c.from} → ${c.to}`;
    els.changes.append(li);
  }
}

/**
 * The numeric changes in words, for the announcement: "Budget ₹12,00,000, Guests 300".
 * @param {Change[]} changes
 */
function describeChanges(changes) {
  return changes
    .filter((c) => c.field !== 'wishes')
    .map((c) => `${CHANGE_LABEL[c.field]} ${c.field === 'date' ? fmtDate(c.to) : c.to}`)
    .join(', ');
}

/**
 * Keep the form truthful about the brief now in force, so rebuilding from the
 * form carries every refinement rather than silently dropping them.
 * @param {PlanRequest} request
 */
function writeBack(request) {
  els.guests.value = String(request.guests);
  els.budget.value = String(request.budget);
  els.date.value = request.eventDate;
  els.preferences.value = request.preferences ?? '';
  updateCount();
}

/** @param {string} message */
function showRefineError(message) {
  els.refineError.textContent = message;
  els.refineError.hidden = false;
  els.refine.setAttribute('aria-invalid', 'true');
  els.refine.setAttribute('aria-describedby', 'refine-help refine-error');
  els.refine.focus();
}

function hideRefineError() {
  els.refineError.hidden = true;
  els.refineError.textContent = '';
  els.refine.removeAttribute('aria-invalid');
  els.refine.setAttribute('aria-describedby', 'refine-help');
}

/**
 * @param {Current} state  the plan being refined
 * @param {string} text
 */
async function submitRefine(state, text) {
  announce('Updating your plan.');
  let reply;
  try {
    reply = await postJson('/api/refine', { ...state.plan.request, refine: text });
  } catch (err) {
    // Any rejection of the change itself belongs next to the change field.
    showRefineError(messageOf(err, 'That change could not be applied.'));
    announce('The change could not be applied.');
    return;
  }
  const { request, changes } = reply;
  const next = showPlan(reply);
  renderChanges(changes);
  writeBack(request);
  els.refine.value = '';
  resetIdeas('Rewriting ideas for the change…');
  const applied = describeChanges(changes);
  announce(`Plan updated${applied ? `: ${applied}` : ''}. Ideas are being rewritten.`);
  els.resultsTitle.focus();

  const p = await loadIdeas(
    next,
    request,
    'Ideas could not be rewritten just now. The updated plan stands.',
  );
  if (p) announce(`${p.ideas.length} ideas rewritten.`);
}

export function wireRefine() {
  els.refineForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const current = getCurrent();
    if (!current || isBusy('refine')) return;
    hideRefineError();
    const text = els.refine.value.trim();
    if (!text) {
      showRefineError(MESSAGE.noChange);
      return;
    }
    await whileBusy('refine', () => submitRefine(current, text));
  });
}
