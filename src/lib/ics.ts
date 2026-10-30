import { addDays } from './dates';
import type { Timeline } from './types';

/**
 * Calendar export. The output is deterministic for a given timeline, name
 * and stamp — same input, byte-identical file — which is what makes it
 * testable.
 */

/** RFC 5545 text escaping. Every line break — CRLF, CR or LF — becomes the escape `\n`. */
function icsText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Fold a content line at 75 octets, as RFC 5545 §3.1 requires. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = '';
  let size = 0;
  // Walk whole characters, so a fold never lands inside a multi-byte sequence.
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74;
    if (size + bytes > limit) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += bytes;
  }
  out.push(current);
  return out.join('\r\n ');
}

/**
 * Serialise a timeline as an iCalendar file with one all-day event per
 * milestone. `stamp` (an ISO instant) is injected rather than read from the
 * clock so the output is reproducible.
 */
export function toIcs(timeline: Timeline, occasion: string, stamp: string): string {
  const dtstamp = stamp.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Utsav Planner//EN',
    'CALSCALE:GREGORIAN',
  ];
  for (const m of timeline.milestones) {
    const start = m.dueDate.replace(/-/g, '');
    const end = addDays(m.dueDate, 1).replace(/-/g, '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${m.id}-${start}@utsav-planner`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${icsText(`${occasion}: ${m.title}`)}`,
      `CATEGORIES:${icsText(m.phase)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
