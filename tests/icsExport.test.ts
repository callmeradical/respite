import { describe, it, expect } from 'vitest';
import { generateICS } from '../src/lib/icsExport';
import type { TimeOffEntry } from '../src/lib/types';

function makeEntry(overrides: Partial<TimeOffEntry> = {}): TimeOffEntry {
  return {
    id: 'test-uuid-1',
    entry_type: 'pto',
    start_date: '2025-08-04',
    end_date: '2025-08-08',
    days: 5,
    status: 'scheduled',
    notes: null,
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('generateICS', () => {
  it('returns null for an empty list', () => {
    expect(generateICS([])).toBeNull();
  });

  it('returns null when the list has no pto entries', () => {
    const holiday: TimeOffEntry = makeEntry({ entry_type: 'holiday' });
    expect(generateICS([holiday])).toBeNull();
  });

  it('produces a valid VCALENDAR wrapper', () => {
    const ics = generateICS([makeEntry()])!;
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
  });

  it('includes one VEVENT per entry', () => {
    const entries = [
      makeEntry({ id: 'a', start_date: '2025-08-04', end_date: '2025-08-04' }),
      makeEntry({ id: 'b', start_date: '2025-09-01', end_date: '2025-09-05' }),
    ];
    const ics = generateICS(entries)!;
    const beginCount = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
    const endCount   = (ics.match(/END:VEVENT/g)   ?? []).length;
    expect(beginCount).toBe(2);
    expect(endCount).toBe(2);
  });

  it('uses all-day date format (VALUE=DATE:YYYYMMDD)', () => {
    const ics = generateICS([makeEntry()])!;
    expect(ics).toContain('DTSTART;VALUE=DATE:20250804');
  });

  it('DTEND is one day after the last day (exclusive per RFC 5545)', () => {
    // Single-day entry on Aug 8 → DTEND = Aug 9
    const entry = makeEntry({ start_date: '2025-08-08', end_date: '2025-08-08' });
    const ics = generateICS([entry])!;
    expect(ics).toContain('DTEND;VALUE=DATE:20250809');
  });

  it('DTEND for a multi-day range is last_day + 1', () => {
    // Aug 4–8 → DTEND = Aug 9
    const ics = generateICS([makeEntry()])!;
    expect(ics).toContain('DTEND;VALUE=DATE:20250809');
  });

  it('uses CRLF line endings throughout', () => {
    const ics = generateICS([makeEntry()])!;
    // Every line should end with \r\n
    const lines = ics.split('\r\n');
    expect(lines.length).toBeGreaterThan(5);
    // No bare \n without \r
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it('scheduled entries get STATUS:TENTATIVE', () => {
    const ics = generateICS([makeEntry({ status: 'scheduled' })])!;
    expect(ics).toContain('STATUS:TENTATIVE');
  });

  it('taken entries get STATUS:CONFIRMED', () => {
    const ics = generateICS([makeEntry({ status: 'taken' })])!;
    expect(ics).toContain('STATUS:CONFIRMED');
  });

  it('includes the UID derived from entry id', () => {
    const ics = generateICS([makeEntry({ id: 'abc-123' })])!;
    expect(ics).toContain('UID:abc-123@respite');
  });

  it('folds lines longer than 75 characters', () => {
    const longNote = 'This is a very long note that will definitely push the summary line well past seventy-five characters total length.';
    const ics = generateICS([makeEntry({ notes: longNote })])!;
    const lines = ics.split('\r\n');
    // No individual line should exceed 75 characters
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
  });

  it('escapes commas in text values', () => {
    const entry = makeEntry({ notes: 'Dentist, then lunch' });
    const ics = generateICS([entry])!;
    expect(ics).toContain('\\,');
  });

  it('escapes semicolons in text values', () => {
    const entry = makeEntry({ notes: 'Mon; Tue; Wed' });
    const ics = generateICS([entry])!;
    expect(ics).toContain('\\;');
  });
});
