// @ts-check
/** The budget table, and the notes the personalisation adds to it. */
import { els, part } from './dom.js';
import { percent } from './format.js';
import { rupees } from './constants.js';

/** @typedef {import('../../src/lib/types').Personalisation} Personalisation */
/** @typedef {import('../../src/lib/types').Plan} Plan */

/**
 * @param {'th' | 'td'} tag
 * @param {string} text
 * @param {string} [className]
 */
function cell(tag, text, className) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = text;
  return el;
}

/** @param {Plan} plan */
export function renderBudget(plan) {
  const { budget, request } = plan;
  els.budgetLede.textContent = `${rupees(budget.total)} for ${request.guests} guests — ${rupees(budget.perGuest)} a head. The split is a starting point; move money towards what matters to you.`;
  els.budgetBody.replaceChildren();
  for (const line of budget.lines) {
    const tr = document.createElement('tr');
    tr.dataset.line = line.id;
    const th = cell('th', line.label);
    th.scope = 'row';
    tr.append(
      th,
      cell('td', percent(line.share), 'num tabular'),
      cell('td', rupees(line.amount), 'num tabular'),
      cell('td', line.perGuest === null ? '—' : rupees(line.perGuest), 'num tabular'),
      cell('td', '…', 'budget__note'),
    );
    els.budgetBody.append(tr);
  }
  els.budgetTotal.textContent = rupees(budget.total);
  els.budgetTotalPerGuest.textContent = rupees(budget.perGuest);
}

/**
 * Put each line's note in its row, marked as the AI's only when a model wrote this section.
 * @param {Personalisation} p
 */
export function renderBudgetNotes(p) {
  for (const tr of els.budgetBody.querySelectorAll('tr')) {
    const note = p.budgetNotes[tr.dataset.line ?? ''];
    const cell = part(tr, '.budget__note', HTMLElement);
    cell.textContent = note ?? '';
    if (note && p.sources.budgetNotes === 'model') cell.dataset.ai = 'true';
  }
}
