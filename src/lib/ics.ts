import { DAY_MS, dateToMs, msToDate } from './dates';
import type { Timeline } from './types';

/**
 * Calendar export. The output is deterministic for a given timeline, name
 * and stamp — same input, byte-identical file — which is what makes it
 * testable.
 */

/** RFC 5545 text escaping. */
function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** Fold a content line at 75 octets, as RFC 5545 §3.1 requires. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  let first = true;
  while (i < bytes.length) {
    const take = first ? 75 : 74;
    // Never split inside a multi-byte sequence.
    let end = Math.min(i + take, bytes.length);
    while (end < bytes.length && ((bytes[end] ?? 0) & 0xc0) === 0x80) end--;
    out.push((first ? '' : ' ') + new TextDecoder().decode(bytes.subarray(i, end)));
    i = end;
    first = false;
  }
  return out.join('\r\n');
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
    const end = msToDate(dateToMs(m.dueDate) + DAY_MS).replace(/-/g, '');
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
