// @ts-check
/** The plan on screen, the progress announcer, and the two buttons that start a request. */
import { els } from './dom.js';

/** @typedef {import('../../src/lib/types').Personalisation} Personalisation */
/** @typedef {import('../../src/lib/types').Plan} Plan */

/**
 * The plan on screen: what exports and refinements act on.
 * @typedef {object} Current
 * @property {Plan} plan
 * @property {string} ics
 * @property {Personalisation | null} personalisation
 */

/** @type {Current | null} */
let current = null;

/** The plan on screen, or null before the first one is built. */
export const getCurrent = () => current;

/** @param {Current} state */
export function setCurrent(state) {
  current = state;
}

/** @param {string} text */
export function announce(text) {
  els.progress.textContent = '';
  // A repeated identical string is not re-announced; clearing first forces it.
  requestAnimationFrame(() => {
    els.progress.textContent = text;
  });
}

/** The two buttons that start a request, and what each says while it runs. */
const BUSY = {
  plan: { btn: els.planBtn, idle: 'Build my plan', working: 'Building…' },
  refine: { btn: els.refineBtn, idle: 'Update the plan', working: 'Updating…' },
};

/**
 * Busy controls use `aria-disabled`, not `disabled`, so focus is never dropped.
 * @param {keyof typeof BUSY} which
 * @param {boolean} busy
 */
export function setBusy(which, busy) {
  const { btn, idle, working } = BUSY[which];
  btn.setAttribute('aria-disabled', String(busy));
  btn.textContent = busy ? working : idle;
}

/** @param {keyof typeof BUSY} which */
export const isBusy = (which) => BUSY[which].btn.getAttribute('aria-disabled') === 'true';
