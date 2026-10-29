// @ts-check
/**
 * The brief form: reading it, checking the common mistakes before a round trip,
 * and putting an error next to the field that failed. The server validates
 * every field again; these checks are a convenience, not a control.
 */
import { els } from './dom.js';
import { addDays, INR } from './format.js';
import { SAMPLES } from './samples.js';
import { LIMITS, todayIso } from './shared.js';

/** @typedef {import('./samples.js').Sample} Sample */

/**
 * The brief as the form holds it: every value a string.
 * @typedef {object} Brief
 * @property {string} eventType
 * @property {string} eventDate
 * @property {string} guests
 * @property {string} budget
 * @property {string} city
 * @property {string} occasion
 * @property {string} preferences
 */

/** @typedef {{ min: number, max: number }} Range */

export function updateCount() {
  const n = els.preferences.value.length;
  els.prefCount.textContent = `${n} of ${LIMITS.preferences} characters`;
}

/** The occasion picker: three radios sharing one name. */
function eventTypeRadios() {
  const radios = els.form.elements.namedItem('eventType');
  if (!(radios instanceof RadioNodeList)) throw new Error('the eventType radios are missing');
  return radios;
}

/** @type {Record<string, HTMLInputElement | HTMLTextAreaElement | null>} */
const FIELD_FOR = {
  eventType: null,
  eventDate: els.date,
  guests: els.guests,
  budget: els.budget,
  city: els.city,
  occasion: els.occasion,
  preferences: els.preferences,
};
/** @type {HTMLInputElement | HTMLTextAreaElement | null} */
let invalidField = null;

/**
 * @param {string} message
 * @param {string} [field]  the request field the server or the client named
 */
export function showError(message, field) {
  els.formError.textContent = message;
  els.formError.hidden = false;
  clearInvalid();
  const el = field ? FIELD_FOR[field] : null;
  if (el) {
    // role="alert" announces once; these two attributes are what a user hears
    // when they navigate back to the control that failed (WCAG 3.3.1).
    el.setAttribute('aria-invalid', 'true');
    el.setAttribute('aria-describedby', `${el.dataset.describedby ?? ''} form-error`.trim());
    invalidField = el;
    el.focus();
  }
}

function clearInvalid() {
  if (!invalidField) return;
  invalidField.removeAttribute('aria-invalid');
  invalidField.setAttribute('aria-describedby', invalidField.dataset.describedby ?? '');
  invalidField = null;
}

export function hideError() {
  els.formError.hidden = true;
  els.formError.textContent = '';
  clearInvalid();
}

/** @returns {Brief} */
export function readForm() {
  return {
    eventType: eventTypeRadios().value,
    eventDate: els.date.value,
    guests: els.guests.value,
    budget: els.budget.value,
    city: els.city.value,
    occasion: els.occasion.value,
    preferences: els.preferences.value,
  };
}

/**
 * The same field-level messages the server would give, for the mistakes that
 * can be caught without a round trip.
 * @param {Brief} body
 * @returns {[message: string, field: string] | null}
 */
export function clientValidate(body) {
  if (!body.eventDate) return ['Choose the event date.', 'eventDate'];
  if (body.eventDate < todayIso()) return ['The event date is in the past.', 'eventDate'];
  if (body.eventDate > addDays(todayIso(), LIMITS.maxLeadDays)) {
    return ['Plans can be made up to two years ahead.', 'eventDate'];
  }
  if (outOfRange(body.guests, LIMITS.guests)) {
    return [rangeMessage('Guests', LIMITS.guests), 'guests'];
  }
  if (outOfRange(body.budget, LIMITS.budget)) {
    return [rangeMessage('Budget', LIMITS.budget), 'budget'];
  }
  return null;
}

/**
 * @param {string} raw
 * @param {Range} range
 */
function outOfRange(raw, { min, max }) {
  const n = Number(raw);
  return !raw || !Number.isFinite(n) || n < min || n > max;
}

/**
 * Worded as the server words it, so the message does not change with who caught it.
 * @param {string} label
 * @param {Range} range
 */
const rangeMessage = (label, { min, max }) =>
  `${label} must be between ${INR.format(min)} and ${INR.format(max)}.`;

/** @param {Sample} s */
function fillSample(s) {
  eventTypeRadios().value = s.eventType;
  els.occasion.value = s.occasion;
  els.city.value = s.city;
  els.date.value = addDays(todayIso(), s.days);
  els.guests.value = String(s.guests);
  els.budget.value = String(s.budget);
  els.preferences.value = s.preferences;
  updateCount();
  hideError();
  els.planBtn.focus();
}

/** Date bounds, the wishes counter, the sample chips, and each field's own description. */
export function wireForm() {
  els.date.min = todayIso();
  els.date.max = addDays(todayIso(), LIMITS.maxLeadDays);
  els.preferences.addEventListener('input', updateCount);
  for (const chip of document.querySelectorAll('[data-sample]')) {
    if (!(chip instanceof HTMLElement)) continue;
    chip.addEventListener('click', () => {
      const s = SAMPLES[chip.dataset.sample ?? ''];
      if (s) fillSample(s);
    });
  }
  // Remembered so an error's description can be added and then taken away again.
  for (const el of Object.values(FIELD_FOR)) {
    if (el) el.dataset.describedby = el.getAttribute('aria-describedby') ?? '';
  }
  updateCount();
}
