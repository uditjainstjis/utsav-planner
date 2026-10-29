// @ts-check
/** The budget table, and the notes the personalisation adds to it. */
import { els, part } from './dom.js';
import { percent } from './format.js';
import { rupees } from './shared.js';

/** @typedef {import('../../src/lib/types').Personalisation} Personalisation */
/** @typedef {import('../../src/lib/types').Plan} Plan */

/** @param {Plan} plan */
export function renderBudget(plan) {
  const { budget, request } = plan;
  els.budgetLede.textContent = `${rupees(budget.total)} for ${request.guests} guests — ${rupees(budget.perGuest)} a head. The split is a starting point; move money towards what matters to you.`;
  els.budgetBody.replaceChildren();
  for (const line of budget.lines) {
    const tr = document.createElement('tr');
    tr.dataset.line = line.id;
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = line.label;
    const share = document.createElement('td');
    share.className = 'num tabular';
    share.textContent = percent(line.share);
    const amount = document.createElement('td');
    amount.className = 'num tabular';
    amount.textContent = rupees(line.amount);
    const per = document.createElement('td');
    per.className = 'num tabular';
    per.textContent = line.perGuest === null ? '—' : rupees(line.perGuest);
    const note = document.createElement('td');
    note.className = 'budget__note';
    note.textContent = '…';
    tr.append(th, share, amount, per, note);
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
