// @ts-check
/** The vendor checklist: book-by dates, ticks kept on this device, and questions to ask. */
import { cloneTemplate, els, part } from './dom.js';
import { fmtDate, lineLabel } from './format.js';

/** @typedef {import('../../src/lib/types').Personalisation} Personalisation */
/** @typedef {import('../../src/lib/types').Plan} Plan */

/** @param {Plan} plan */
function doneKey(plan) {
  return `utsav:done:${plan.request.eventType}:${plan.request.eventDate}:${plan.request.guests}`;
}

/**
 * @param {Plan} plan
 * @returns {Set<string>}
 */
function loadDone(plan) {
  try {
    /** @type {unknown} */
    const ids = JSON.parse(localStorage.getItem(doneKey(plan)) || '[]');
    return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * @param {Plan} plan
 * @param {Set<string>} set
 */
function saveDone(plan, set) {
  try {
    localStorage.setItem(doneKey(plan), JSON.stringify([...set]));
  } catch {
    /* fine without persistence */
  }
}

/**
 * Add questions to a vendor's list, each marked as the AI's when a model wrote them.
 * @param {HTMLElement} li the vendor's item
 * @param {readonly string[]} questions
 * @param {boolean} byModel
 */
function addQuestions(li, questions, byModel) {
  const ul = part(li, '.vendor__questions', HTMLElement);
  for (const q of questions) {
    const qi = document.createElement('li');
    if (byModel) {
      const mark = document.createElement('span');
      mark.className = 'ai-mark';
      mark.textContent = 'AI';
      qi.className = 'vendor__question--ai';
      qi.append(mark, ' ');
    }
    qi.append(q);
    ul.append(qi);
  }
}

/**
 * @param {Plan} plan
 * @param {Set<string>} done
 */
function updateVendorProgress(plan, done) {
  const n = plan.vendors.filter((v) => done.has(v.id)).length;
  els.vendorProgress.textContent = `${n} of ${plan.vendors.length} booked`;
}

/** @param {Plan} plan */
export function renderVendors(plan) {
  const { vendors } = plan;
  const done = loadDone(plan);
  els.vendorList.replaceChildren();
  for (const v of vendors) {
    const li = cloneTemplate(els.vendorTpl);
    li.dataset.vendor = v.id;
    const check = part(li, '.vendor__check', HTMLInputElement);
    const title = part(li, '.vendor__title', HTMLElement);
    check.id = `vendor-${v.id}`;
    title.id = `vendor-${v.id}-title`;
    check.setAttribute('aria-labelledby', title.id);
    // The template carries a generic aria-label so the markup is valid before
    // cloning; the real name is the vendor title, so the placeholder goes.
    check.removeAttribute('aria-label');
    check.checked = done.has(v.id);
    li.dataset.done = String(check.checked);
    title.textContent = v.label;
    part(li, '.vendor__meta', HTMLElement).textContent =
      `Book by ${fmtDate(v.bookBy)} · paid from ${lineLabel(plan, v.budgetLineId)}`;
    addQuestions(li, v.questions, false);
    check.addEventListener('change', () => {
      if (check.checked) done.add(v.id);
      else done.delete(v.id);
      li.dataset.done = String(check.checked);
      saveDone(plan, done);
      updateVendorProgress(plan, done);
    });
    els.vendorList.append(li);
  }
  updateVendorProgress(plan, done);
}

/**
 * Add the personalisation's questions under each vendor, marked as the AI's
 * only when a model wrote this section.
 * @param {Personalisation} p
 */
export function renderVendorQuestions(p) {
  for (const li of els.vendorList.querySelectorAll('.vendor')) {
    if (!(li instanceof HTMLElement)) continue;
    const extra = p.vendorQuestions[li.dataset.vendor ?? ''] ?? [];
    addQuestions(li, extra, p.sources.vendorQuestions === 'model');
  }
}
