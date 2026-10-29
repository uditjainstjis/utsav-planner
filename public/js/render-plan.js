// @ts-check
/** The deterministic plan: the injection notice, the summary figures and the three sections. */
import { els } from './dom.js';
import { renderBudget } from './render-budget.js';
import { renderTimeline } from './render-timeline.js';
import { renderVendors } from './render-vendors.js';
import { rupees } from './shared.js';
import { setCurrent } from './state.js';

/** @typedef {import('../../src/lib/types').InjectionFinding} InjectionFinding */
/** @typedef {import('../../src/lib/types').Plan} Plan */
/** @typedef {import('../../src/lib/types').ScreenedField} ScreenedField */
/** @typedef {import('./api.js').PlanReply} PlanReply */
/** @typedef {import('./state.js').Current} Current */

/** @type {Record<ScreenedField, string>} */
const FIELD_NAME = { occasion: 'Occasion name', city: 'City', preferences: 'Wishes' };

/** @param {InjectionFinding[]} findings */
function renderGuard(findings) {
  if (!findings.length) {
    els.guardAlert.hidden = true;
    els.guardAlert.replaceChildren();
    return;
  }
  const head = document.createElement('p');
  const lead = document.createElement('strong');
  lead.textContent = 'Your brief contained text aimed at the AI, not at a planner.';
  head.append(
    lead,
    ` Each sentence holding it was removed before the AI saw your brief; the AI was given only the rest. ${findings.length} finding${findings.length === 1 ? '' : 's'}:`,
  );
  const list = document.createElement('ul');
  for (const f of findings) {
    const li = document.createElement('li');
    const kind = document.createElement('strong');
    kind.textContent = `${FIELD_NAME[f.field]}, ${f.kind}: `;
    const q = document.createElement('q');
    q.textContent = f.excerpt;
    li.append(kind, f.detail, ' ', q);
    list.append(li);
  }
  els.guardAlert.replaceChildren(head, list);
  els.guardAlert.hidden = false;
}

/** @param {Plan} plan */
function renderSummary(plan) {
  const { budget, timeline, vendors } = plan;
  els.statPerGuest.textContent = rupees(budget.perGuest);
  els.statLead.textContent = String(timeline.leadDays);
  els.statMilestones.textContent = String(timeline.milestones.length);
  els.statVendors.textContent = String(vendors.length);
  els.flags.replaceChildren();
  for (const f of budget.flags) {
    const li = document.createElement('li');
    li.className = `flag flag--${f.code}`;
    li.textContent = f.message;
    els.flags.append(li);
  }
}

/**
 * Put a plan on screen and make it the one exports and refinements act on.
 * @param {PlanReply} reply
 * @returns {Current}
 */
export function showPlan({ plan, ics }) {
  const state = { plan, ics, personalisation: null };
  setCurrent(state);
  renderGuard(plan.guard.injectionFindings);
  renderSummary(plan);
  renderBudget(plan);
  renderTimeline(plan);
  renderVendors(plan);
  els.results.hidden = false;
  return state;
}
