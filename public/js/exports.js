// @ts-check
/** Taking the plan away: budget as CSV, timeline as .ics, the whole plan as text, or print. */
import { els } from './dom.js';
import { fmtDate, percent } from './format.js';
import { TIER } from './render-ideas.js';
import { OCCASION_LABEL, rupees } from './constants.js';
import { getCurrent } from './state.js';

/** @typedef {import('./state.js').Current} Current */

/**
 * @param {string} name
 * @param {string} type
 * @param {string} text
 */
function download(name, type, text) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

/** @param {string | number} s */
const csvCell = (s) => `"${String(s).replace(/"/g, '""')}"`;

/** @param {Current} state */
function budgetCsv({ plan: { budget }, personalisation }) {
  const notes = personalisation?.budgetNotes ?? {};
  /** @type {(string | number)[][]} */
  const rows = [['Category', 'Share', 'Amount (INR)', 'Per guest (INR)', 'Note']];
  for (const l of budget.lines) {
    rows.push([l.label, percent(l.share), l.amount, l.perGuest ?? '', notes[l.id] ?? '']);
  }
  rows.push(['Total', '100%', budget.total, budget.perGuest, '']);
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/** @param {Current} state */
function planAsText({ plan, personalisation: p }) {
  const r = plan.request;
  const out = [];
  out.push(
    `${r.occasion ?? OCCASION_LABEL[r.eventType]} — ${OCCASION_LABEL[r.eventType]} on ${fmtDate(r.eventDate)}${r.city ? `, ${r.city}` : ''}`,
  );
  out.push(
    `${r.guests} guests · ${rupees(plan.budget.total)} total · ${rupees(plan.budget.perGuest)} per guest`,
  );
  for (const f of plan.budget.flags) out.push(`! ${f.message}`);
  out.push('', 'BUDGET');
  for (const l of plan.budget.lines) {
    out.push(
      `- ${l.label}: ${rupees(l.amount)} (${percent(l.share)})${p?.budgetNotes[l.id] ? ` — ${p.budgetNotes[l.id]}` : ''}`,
    );
  }
  out.push('', 'TIMELINE');
  for (const m of plan.timeline.milestones) out.push(`- ${fmtDate(m.dueDate)}: ${m.title}`);
  out.push('', 'VENDORS');
  for (const v of plan.vendors) {
    out.push(`- ${v.label} (book by ${fmtDate(v.bookBy)})`);
    for (const q of [...v.questions, ...(p?.vendorQuestions[v.id] ?? [])]) out.push(`    ? ${q}`);
  }
  if (p) {
    out.push('', 'IDEAS', p.summary);
    for (const i of p.ideas) out.push(`- ${i.title} [${TIER[i.costTier].word}]: ${i.detail}`);
  }
  out.push('', 'Made with Utsav Planner. Estimates, not quotes.');
  return out.join('\n');
}

export function wireExports() {
  els.csvBtn.addEventListener('click', () => {
    const current = getCurrent();
    if (current) download('utsav-budget.csv', 'text/csv;charset=utf-8', budgetCsv(current));
  });
  els.icsBtn.addEventListener('click', () => {
    const current = getCurrent();
    if (current) download('utsav-timeline.ics', 'text/calendar;charset=utf-8', current.ics);
  });
  els.printBtn.addEventListener('click', () => {
    window.print();
  });
  els.copyBtn.addEventListener('click', () => {
    const current = getCurrent();
    if (!current) return;
    navigator.clipboard.writeText(planAsText(current)).then(
      () => {
        els.copyStatus.textContent = 'Copied the whole plan.';
      },
      () => {
        els.copyStatus.textContent = 'Could not copy — your browser blocked clipboard access.';
      },
    );
  });
}
