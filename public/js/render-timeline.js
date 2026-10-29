// @ts-check
/** The dated milestones, counted back from the event. */
import { cloneTemplate, els, part } from './dom.js';
import { fmtDate } from './format.js';

/** @typedef {import('../../src/lib/types').Phase} Phase */
/** @typedef {import('../../src/lib/types').Plan} Plan */

/** @type {Record<Phase, string>} */
const PHASE = {
  foundation: 'Decide',
  booking: 'Book',
  details: 'Arrange',
  final: 'Confirm',
  event: 'The day',
};

/** @param {Plan} plan */
export function renderTimeline(plan) {
  const { timeline, vendors } = plan;
  const vendorName = new Map(vendors.map((v) => [v.id, v.label]));
  els.rushed.hidden = !timeline.rushed;
  els.timelineList.replaceChildren();
  for (const m of timeline.milestones) {
    const li = cloneTemplate(els.milestoneTpl);
    li.dataset.phase = m.phase;
    if (m.overdue) li.dataset.overdue = 'true';
    part(li, '.milestone__date', HTMLElement).textContent = fmtDate(m.dueDate);
    part(li, '.milestone__title', HTMLElement).textContent = m.title;
    const bits = [PHASE[m.phase]];
    if (m.daysBefore > 0) bits.push(`${m.daysBefore} day${m.daysBefore === 1 ? '' : 's'} before`);
    if (m.vendorId && vendorName.has(m.vendorId)) bits.push(`books: ${vendorName.get(m.vendorId)}`);
    if (m.overdue) bits.push('already past — do it first');
    part(li, '.milestone__meta', HTMLElement).textContent = bits.join(' · ');
    els.timelineList.append(li);
  }
}
