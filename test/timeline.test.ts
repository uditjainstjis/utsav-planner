import { describe, expect, it } from 'vitest';
import {
  bookByFor,
  buildTimeline,
  dateToMs,
  daysBetween,
  msToDate,
  toIcs,
} from '../src/lib/timeline';
import { EVENT_TYPES } from '../src/lib/types';

const TODAY = '2026-10-23';

describe('date arithmetic', () => {
  it('round-trips a calendar date through UTC milliseconds', () => {
    for (const d of ['2026-01-01', '2026-02-28', '2028-02-29', '2026-12-31']) {
      expect(msToDate(dateToMs(d))).toBe(d);
    }
  });

  it('counts whole days, including across a month end and a leap day', () => {
    expect(daysBetween('2026-10-23', '2026-10-24')).toBe(1);
    expect(daysBetween('2026-10-23', '2026-11-01')).toBe(9);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-23')).toBe(-1);
  });
});

describe('buildTimeline', () => {
  it.each(EVENT_TYPES)('%s: uses the ideal template when there is time', (type) => {
    const t = buildTimeline(type, '2027-10-23', TODAY);
    expect(t.rushed).toBe(false);
    expect(t.leadDays).toBe(365);
    expect(t.milestones.at(-1)!.daysBefore).toBe(0);
    expect(t.milestones.at(-1)!.dueDate).toBe('2027-10-23');
    expect(t.milestones.every((m) => !m.overdue)).toBe(true);
  });

  it('lands every milestone on the right calendar day', () => {
    const t = buildTimeline('birthday', '2026-12-07', TODAY);
    for (const m of t.milestones) {
      expect(daysBetween(m.dueDate, '2026-12-07')).toBe(m.daysBefore);
    }
  });

  it('compresses proportionally when the runway is short, keeping the order', () => {
    const t = buildTimeline('wedding', '2026-12-22', TODAY); // 60 days vs ideal 180
    expect(t.leadDays).toBe(60);
    expect(t.rushed).toBe(true);
    const days = t.milestones.map((m) => m.daysBefore);
    expect(days[0]).toBe(60);
    for (let i = 1; i < days.length; i++) expect(days[i]!).toBeLessThanOrEqual(days[i - 1]!);
    expect(t.milestones.every((m) => !m.overdue)).toBe(true);
  });

  it('does not stretch a template to fill a long runway', () => {
    const t = buildTimeline('birthday', '2027-10-23', TODAY);
    expect(t.milestones[0]!.daysBefore).toBe(45);
  });

  it('marks nothing overdue when the event is today', () => {
    const t = buildTimeline('community', TODAY, TODAY);
    expect(t.leadDays).toBe(0);
    expect(t.milestones.every((m) => m.daysBefore === 0)).toBe(true);
    expect(t.milestones.every((m) => !m.overdue)).toBe(true);
  });

  it('is rushed below half the ideal lead and not at or above it', () => {
    expect(buildTimeline('birthday', '2026-11-14', TODAY).rushed).toBe(true); // 22 days
    expect(buildTimeline('birthday', '2026-11-15', TODAY).rushed).toBe(false); // 23 days
  });

  it('exposes the milestone that books a vendor', () => {
    const t = buildTimeline('wedding', '2027-04-01', TODAY);
    expect(bookByFor(t, 'caterer')?.id).toBe('caterer');
    expect(bookByFor(t, 'no-such-vendor')).toBeNull();
  });

  it('gives every milestone a unique id and a phase', () => {
    for (const type of EVENT_TYPES) {
      const t = buildTimeline(type, '2027-04-01', TODAY);
      const ids = t.milestones.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const m of t.milestones)
        expect(m.phase).toMatch(/^(foundation|booking|details|final|event)$/);
    }
  });
});

describe('toIcs', () => {
  const STAMP = '2026-10-23T10:00:00.000Z';
  const t = buildTimeline('birthday', '2026-12-07', TODAY);
  const ics = toIcs(t, "Aarav's 5th", STAMP);

  it('is a well-formed calendar with one all-day event per milestone', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(t.milestones.length);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261207');
    expect(ics).toContain('DTEND;VALUE=DATE:20261208');
    expect(ics).toContain('DTSTAMP:20261023T100000Z');
  });

  it('uses CRLF line endings throughout', () => {
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it('escapes commas, semicolons and backslashes in text', () => {
    const odd = toIcs(t, 'A, B; C\\D', STAMP);
    expect(odd).toContain('SUMMARY:A\\, B\\; C\\\\D: ');
  });

  it('folds lines at 75 octets', () => {
    const long = toIcs(t, 'x'.repeat(200), STAMP);
    for (const line of long.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it('never splits a multi-byte character when folding', () => {
    const long = toIcs(t, 'दीपावली मेला '.repeat(12), STAMP);
    // Unfold and decode: a split code point would surface as U+FFFD.
    const unfolded = long.replace(/\r\n /g, '');
    expect(unfolded).not.toContain('�');
    expect(unfolded).toContain('दीपावली मेला');
  });

  it('is deterministic for the same inputs', () => {
    expect(toIcs(t, 'Same', STAMP)).toBe(toIcs(t, 'Same', STAMP));
  });
});
