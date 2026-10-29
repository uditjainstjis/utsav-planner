// @ts-check
/** The ideas card: its status line, the summary and the idea cards. */
import { cloneTemplate, els, part } from './dom.js';
import { lineLabel, TIER } from './format.js';

/** @typedef {import('../../src/lib/types').IdeaCategory} IdeaCategory */
/** @typedef {import('../../src/lib/types').Personalisation} Personalisation */
/** @typedef {import('../../src/lib/types').Plan} Plan */

/** @type {Record<IdeaCategory, string>} */
const CATEGORY = {
  theme: 'Theme',
  decor: 'Decor',
  food: 'Food',
  activity: 'Activity',
  favour: 'Favours',
  invite: 'Invitations',
  other: 'On the day',
};

/**
 * @param {string} text
 * @param {'busy' | 'ok' | 'degraded'} state
 */
export function setIdeasStatus(text, state) {
  els.ideasStatus.textContent = text;
  els.ideasStatus.dataset.state = state;
}

/**
 * Empty the ideas card and say new ideas are on their way.
 * @param {string} status
 */
export function resetIdeas(status) {
  setIdeasStatus(status, 'busy');
  els.aiSummary.textContent = '';
  els.ideasList.replaceChildren();
}

/**
 * @param {Plan} plan
 * @param {Personalisation} p
 */
export function renderIdeas(plan, p) {
  els.aiSummary.textContent = p.summary;
  els.ideasList.replaceChildren();
  for (const idea of p.ideas) {
    const li = cloneTemplate(els.ideaTpl);
    li.dataset.tier = idea.costTier;
    part(li, '.idea__category', HTMLElement).textContent = CATEGORY[idea.category];
    part(li, '.idea__title', HTMLElement).textContent = idea.title;
    part(li, '.idea__detail', HTMLElement).textContent = idea.detail;
    const tier = TIER[idea.costTier];
    const foot = [`${tier.glyph} ${tier.word}`];
    if (idea.budgetLineId) foot.push(`from ${lineLabel(plan, idea.budgetLineId)}`);
    part(li, '.idea__foot', HTMLElement).textContent = foot.join(' · ');
    els.ideasList.append(li);
  }
}
