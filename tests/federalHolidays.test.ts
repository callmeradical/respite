import { describe, it, expect } from 'vitest';
import { usFederalHolidays, parseHolidayText } from '../src/lib/federalHolidays';

// ─── usFederalHolidays ────────────────────────────────────────────────────────

describe('usFederalHolidays', () => {
  it('returns 11 holidays for any year', () => {
    expect(usFederalHolidays(2025).length).toBe(11);
    expect(usFederalHolidays(2026).length).toBe(11);
  });

  it('results are sorted chronologically', () => {
    const holidays = usFederalHolidays(2025);
    for (let i = 1; i < holidays.length; i++) {
      expect(holidays[i].date >= holidays[i - 1].date).toBe(true);
    }
  });

  it('MLK Jr. Day is the 3rd Monday in January', () => {
    // 2025: Jan 20
    const mlk2025 = usFederalHolidays(2025).find(h => h.key === 'mlk')!;
    expect(mlk2025.date).toBe('2025-01-20');
    expect(new Date(mlk2025.date + 'T00:00:00').getDay()).toBe(1); // Monday
  });

  it("Presidents' Day is the 3rd Monday in February", () => {
    const pres2025 = usFederalHolidays(2025).find(h => h.key === 'presidents')!;
    expect(pres2025.date).toBe('2025-02-17');
    expect(new Date(pres2025.date + 'T00:00:00').getDay()).toBe(1);
  });

  it('Memorial Day is the last Monday in May', () => {
    const mem2025 = usFederalHolidays(2025).find(h => h.key === 'memorial')!;
    expect(mem2025.date).toBe('2025-05-26');
    expect(new Date(mem2025.date + 'T00:00:00').getDay()).toBe(1);
  });

  it('Labor Day is the 1st Monday in September', () => {
    const labor2025 = usFederalHolidays(2025).find(h => h.key === 'labor')!;
    expect(labor2025.date).toBe('2025-09-01');
    expect(new Date(labor2025.date + 'T00:00:00').getDay()).toBe(1);
  });

  it('Thanksgiving is the 4th Thursday in November', () => {
    const thanks2025 = usFederalHolidays(2025).find(h => h.key === 'thanksgiving')!;
    expect(thanks2025.date).toBe('2025-11-27');
    expect(new Date(thanks2025.date + 'T00:00:00').getDay()).toBe(4); // Thursday
  });

  it('Christmas observed on Friday when Dec 25 falls on Saturday', () => {
    // 2021: Dec 25 is a Saturday → observed Dec 24 (Friday)
    const xmas2021 = usFederalHolidays(2021).find(h => h.key === 'christmas')!;
    expect(xmas2021.date).toBe('2021-12-24');
    expect(xmas2021.actualDate).toBe('2021-12-25');
  });

  it('New Year observed on Monday when Jan 1 falls on Sunday', () => {
    // 2023: Jan 1 is a Sunday → observed Jan 2 (Monday)
    const ny2023 = usFederalHolidays(2023).find(h => h.key === 'new_years')!;
    expect(ny2023.date).toBe('2023-01-02');
    expect(ny2023.actualDate).toBe('2023-01-01');
  });

  it('Juneteenth is June 19', () => {
    const june2025 = usFederalHolidays(2025).find(h => h.key === 'juneteenth')!;
    expect(june2025.date).toBe('2025-06-19');
  });
});

// ─── parseHolidayText ─────────────────────────────────────────────────────────

describe('parseHolidayText', () => {
  it('parses "YYYY-MM-DD Name" format', () => {
    const result = parseHolidayText('2025-07-04 Independence Day');
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]).toEqual({ date: '2025-07-04', name: 'Independence Day' });
    expect(result.invalid).toHaveLength(0);
  });

  it('parses "Name, YYYY-MM-DD" format', () => {
    const result = parseHolidayText('Thanksgiving Day, 2025-11-27');
    expect(result.valid[0]).toEqual({ date: '2025-11-27', name: 'Thanksgiving Day' });
  });

  it('parses pipe-separated format', () => {
    const result = parseHolidayText('Christmas Day | 2025-12-25');
    expect(result.valid[0]).toEqual({ date: '2025-12-25', name: 'Christmas Day' });
  });

  it('skips blank lines and comment lines', () => {
    const text = '# comment\n\n2025-07-04 Independence Day';
    const result = parseHolidayText(text);
    expect(result.valid).toHaveLength(1);
  });

  it('reports invalid lines with no date', () => {
    const result = parseHolidayText('No date here at all');
    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0].reason).toMatch(/date/i);
  });

  it('reports lines with date but no name', () => {
    const result = parseHolidayText('2025-07-04');
    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toHaveLength(1);
  });

  it('parses multiple lines', () => {
    const text = [
      '2025-01-01 New Year\'s Day',
      '2025-07-04 Independence Day',
      '2025-12-25 Christmas Day',
    ].join('\n');
    const result = parseHolidayText(text);
    expect(result.valid).toHaveLength(3);
    expect(result.invalid).toHaveLength(0);
  });

  it('returns mixed valid and invalid from same input', () => {
    const text = '2025-07-04 Independence Day\nbad line without a date';
    const result = parseHolidayText(text);
    expect(result.valid).toHaveLength(1);
    expect(result.invalid).toHaveLength(1);
  });
});
