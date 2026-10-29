import { EVENT_TYPES, LIMITS, MESSAGE, rangeMessage } from '../shared/constants';
import { dateParts, daysBetween } from './dates';
import type { PlanRequest } from './types';

/**
 * Request validation.
 *
 * Every field arrives from an untrusted client. Each one is checked for type,
 * bounds and shape, and the error returned names the field and the rule so the
 * UI can put the message next to the control that failed. Nothing here throws
 * a generic "bad request".
 */

export class InputError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly field: string,
  ) {
    super(message);
    this.name = 'InputError';
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A plain JSON object: not null, not an array. */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Strip C0/C1 control characters other than tab and line breaks; the wishes keep their lines. */
function clean(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '').trim();
}

function optionalText(v: unknown, field: string, max: number): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') throw new InputError(`${field} must be text.`, 'type', field);
  const s = clean(v);
  if (s.length > max) {
    throw new InputError(`Keep ${field} under ${max} characters.`, 'too_long', field);
  }
  return s || null;
}

function wholeNumber(v: unknown, field: string, min: number, max: number): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new InputError(`Enter ${field} as a number.`, 'type', field);
  }
  const whole = Math.round(n);
  if (whole < min || whole > max) {
    const label = `${field.charAt(0).toUpperCase()}${field.slice(1)}`;
    throw new InputError(rangeMessage(label, { min, max }), 'range', field);
  }
  return whole;
}

/** Headcount: a whole number within `LIMITS.guests`. */
export function validateGuests(v: unknown): number {
  return wholeNumber(v, 'guests', LIMITS.guests.min, LIMITS.guests.max);
}

/** Total budget in rupees: a whole number within `LIMITS.budget`. */
export function validateBudget(v: unknown): number {
  return wholeNumber(v, 'budget', LIMITS.budget.min, LIMITS.budget.max);
}

/**
 * Validate a calendar date string and check it is a real date.
 * `new Date('2026-02-30')` would roll over to March; this rejects it.
 */
export function validateDate(v: unknown, today: string): string {
  if (typeof v !== 'string' || !ISO_DATE.test(v)) {
    throw new InputError('Enter the event date as YYYY-MM-DD.', 'format', 'eventDate');
  }
  const { y, m, d } = dateParts(v);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    throw new InputError('That date does not exist on the calendar.', 'invalid', 'eventDate');
  }
  const lead = daysBetween(today, v);
  if (lead < 0) throw new InputError(MESSAGE.datePast, 'past', 'eventDate');
  if (lead > LIMITS.maxLeadDays) {
    throw new InputError(MESSAGE.dateTooFar, 'too_far', 'eventDate');
  }
  return v;
}

/**
 * Validate and normalise a raw request body.
 *
 * @param body   parsed JSON from the client, of unknown shape
 * @param today  YYYY-MM-DD, the planning date (injected for testability)
 */
export function validatePlanRequest(body: unknown, today: string): PlanRequest {
  if (!isRecord(body)) throw new InputError('Expected a JSON object.', 'type', 'body');

  const eventType = EVENT_TYPES.find((t) => t === body.eventType);
  if (!eventType) {
    throw new InputError(
      'Choose an occasion: wedding, birthday or community event.',
      'invalid',
      'eventType',
    );
  }

  return {
    eventType,
    eventDate: validateDate(body.eventDate, today),
    guests: validateGuests(body.guests),
    budget: validateBudget(body.budget),
    city: optionalText(body.city, 'city', LIMITS.city),
    occasion: optionalText(body.occasion, 'occasion', LIMITS.occasion),
    preferences: optionalText(body.preferences, 'preferences', LIMITS.preferences),
  };
}
