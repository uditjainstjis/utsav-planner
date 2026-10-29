// @ts-check
/**
 * Every element the page script touches, looked up once and checked to be the
 * kind the code expects. Every id is in index.html, so a miss is a bug and
 * fails loudly at load.
 */

/**
 * The element with this id, checked to be a `type`.
 * @template {HTMLElement} T
 * @param {string} id
 * @param {new () => T} type
 * @returns {T}
 */
function $(id, type) {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`#${id} is missing or is not a ${type.name}`);
  return el;
}

/**
 * The element matching `selector` inside a rendered template.
 * @template {HTMLElement} T
 * @param {ParentNode} root
 * @param {string} selector
 * @param {new () => T} type
 * @returns {T}
 */
export function part(root, selector, type) {
  const el = root.querySelector(selector);
  if (!(el instanceof type)) throw new Error(`${selector} is missing or is not a ${type.name}`);
  return el;
}

/**
 * A fresh copy of a template's element.
 * @param {HTMLTemplateElement} tpl
 * @returns {HTMLElement}
 */
export function cloneTemplate(tpl) {
  const el = tpl.content.firstElementChild?.cloneNode(true);
  if (!(el instanceof HTMLElement)) throw new Error(`#${tpl.id} is empty`);
  return el;
}

export const els = {
  form: $('plan-form', HTMLFormElement),
  occasion: $('occasion', HTMLInputElement),
  city: $('city', HTMLInputElement),
  date: $('event-date', HTMLInputElement),
  guests: $('guests', HTMLInputElement),
  budget: $('budget', HTMLInputElement),
  preferences: $('preferences', HTMLTextAreaElement),
  prefCount: $('pref-count', HTMLElement),
  planBtn: $('plan-btn', HTMLButtonElement),
  formError: $('form-error', HTMLElement),
  progress: $('progress', HTMLElement),
  guardAlert: $('guard-alert', HTMLElement),
  results: $('results', HTMLElement),
  resultsTitle: $('results-h', HTMLElement),
  statPerGuest: $('stat-per-guest', HTMLElement),
  statLead: $('stat-lead', HTMLElement),
  statMilestones: $('stat-milestones', HTMLElement),
  statVendors: $('stat-vendors', HTMLElement),
  flags: $('flags', HTMLElement),
  refineForm: $('refine-form', HTMLFormElement),
  refine: $('refine', HTMLInputElement),
  refineBtn: $('refine-btn', HTMLButtonElement),
  refineError: $('refine-error', HTMLElement),
  changes: $('changes', HTMLElement),
  copyBtn: $('copy-btn', HTMLButtonElement),
  printBtn: $('print-btn', HTMLButtonElement),
  copyStatus: $('copy-status', HTMLElement),
  csvBtn: $('csv-btn', HTMLButtonElement),
  budgetLede: $('budget-lede', HTMLElement),
  budgetBody: $('budget-body', HTMLElement),
  budgetTotal: $('budget-total', HTMLElement),
  budgetTotalPerGuest: $('budget-total-per-guest', HTMLElement),
  icsBtn: $('ics-btn', HTMLButtonElement),
  rushed: $('rushed', HTMLElement),
  timelineList: $('timeline-list', HTMLElement),
  vendorProgress: $('vendor-progress', HTMLElement),
  vendorList: $('vendor-list', HTMLElement),
  ideasStatus: $('ideas-status', HTMLElement),
  aiSummary: $('ai-summary', HTMLElement),
  ideasList: $('ideas-list', HTMLElement),
  themeToggle: $('theme-toggle', HTMLButtonElement),
  milestoneTpl: $('milestone-tpl', HTMLTemplateElement),
  vendorTpl: $('vendor-tpl', HTMLTemplateElement),
  ideaTpl: $('idea-tpl', HTMLTemplateElement),
};
