/**
 * ICS (iCalendar, RFC 5545) export for scheduled PTO entries.
 *
 * Key spec rules applied:
 *  - CRLF line endings throughout
 *  - Lines folded at 75 octets (continuation lines begin with a single space)
 *  - All-day events use DTSTART/DTEND with VALUE=DATE (YYYYMMDD)
 *  - DTEND is exclusive: one calendar day after the last day of the event
 *  - Text values escape backslash, semicolon, comma, and newlines
 *  - DTSTAMP is the UTC timestamp of file generation
 */

import { addDays, parseISO } from 'date-fns';
import type { TimeOffEntry, Holiday } from './types';

const PRODID = '-//Respite//Time Off Tracker//EN';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a complete VCALENDAR string for the given PTO entries and holidays.
 * The caller is responsible for filtering to the desired subset.
 * Returns null if both lists are empty.
 */
export function generateICS(
  entries: TimeOffEntry[],
  holidays: Holiday[] = [],
): string | null {
  const ptoEntries = entries.filter(e => e.entry_type === 'pto');

  if (ptoEntries.length === 0 && holidays.length === 0) return null;

  const dtstamp = utcStamp(new Date());

  const events = [
    ...ptoEntries.map((e) => buildVEvent(e, dtstamp)),
    ...holidays.map((h) => buildHolidayVEvent(h, dtstamp)),
  ];

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    fold(`PRODID:${PRODID}`),
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
  ];

  return lines.join('\r\n') + '\r\n';
}

// ─── Holiday VEVENT ───────────────────────────────────────────────────────────

function buildHolidayVEvent(holiday: Holiday, dtstamp: string): string {
  const dtStart = holiday.date.replace(/-/g, '');
  // DTEND is exclusive — next day
  const nextDay = toIcsDate(toLocalIso(addDays(parseISO(holiday.date), 1)));

  const props = [
    'BEGIN:VEVENT',
    fold(`UID:${holiday.id}@respite-holiday`),
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${dtStart}`,
    `DTEND;VALUE=DATE:${nextDay}`,
    fold(`SUMMARY:${escapeText(holiday.name)}`),
    'STATUS:CONFIRMED',
    'TRANSP:TRANSPARENT', // shows as free (informational, not blocking)
    'END:VEVENT',
  ];

  return props.join('\r\n');
}

// ─── VEVENT builder ───────────────────────────────────────────────────────────

function buildVEvent(entry: TimeOffEntry, dtstamp: string): string {
  const dtStart = toIcsDate(entry.start_date);
  // DTEND is exclusive — the day *after* the last day
  const dtEnd = toIcsDate(
    toLocalIso(addDays(parseISO(entry.end_date), 1)),
  );

  const summary = entry.notes
    ? `PTO \u2013 ${entry.notes}`
    : 'Scheduled PTO';

  const dayWord = entry.days === 1 ? 'day' : 'days';
  const description = `${entry.days} ${dayWord} of ${entry.status} time off`;

  // TENTATIVE for scheduled, CONFIRMED for taken
  const status = entry.status === 'taken' ? 'CONFIRMED' : 'TENTATIVE';

  const props: string[] = [
    'BEGIN:VEVENT',
    fold(`UID:${entry.id}@respite`),
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${dtStart}`,
    `DTEND;VALUE=DATE:${dtEnd}`,
    fold(`SUMMARY:${escapeText(summary)}`),
    fold(`DESCRIPTION:${escapeText(description)}`),
    `STATUS:${status}`,
    'TRANSP:OPAQUE',
    'END:VEVENT',
  ];

  return props.join('\r\n');
}

// ─── RFC 5545 helpers ─────────────────────────────────────────────────────────

/**
 * Fold a content line to at most 75 octets per RFC 5545 §3.1.
 * Continuation lines are prefixed with a single SPACE.
 */
function fold(line: string): string {
  // We work in characters; for ASCII this is equivalent to octets.
  // Multi-byte characters are rare in our generated content (only in
  // free-text summary/description) — fold conservatively at 70 chars
  // to leave room for multi-byte sequences.
  const MAX = 74;
  if (line.length <= 75) return line;

  const segments: string[] = [line.slice(0, 75)];
  let i = 75;
  while (i < line.length) {
    segments.push(' ' + line.slice(i, i + MAX));
    i += MAX;
  }
  return segments.join('\r\n');
}

/**
 * Escape special characters in TEXT values (RFC 5545 §3.3.11).
 */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Format a Date as a UTC DATE-TIME stamp: YYYYMMDDTHHMMSSZ
 */
function utcStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return [
    d.getUTCFullYear(),
    pad(d.getUTCMonth() + 1),
    pad(d.getUTCDate()),
    'T',
    pad(d.getUTCHours()),
    pad(d.getUTCMinutes()),
    pad(d.getUTCSeconds()),
    'Z',
  ].join('');
}

/**
 * Convert an ISO date string (YYYY-MM-DD) to ICS date format (YYYYMMDD).
 */
function toIcsDate(iso: string): string {
  return iso.replace(/-/g, '');
}

/**
 * Convert a Date object to a local ISO date string (YYYY-MM-DD).
 * Uses local time, not UTC, so the calendar date is preserved.
 */
function toLocalIso(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}
