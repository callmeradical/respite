/**
 * Compute US federal public holidays for a given calendar year.
 *
 * Rules applied:
 *  - Fixed-date holidays whose actual date falls on Saturday are observed
 *    on the preceding Friday; those falling on Sunday are observed on the
 *    following Monday.
 *  - Floating holidays (Nth weekday) are already on a weekday so no
 *    observance shift is needed.
 */

export interface FederalHoliday {
  /** Stable key for React lists / dedup */
  key: string;
  name: string;
  /** ISO date of the observed (legal) holiday */
  date: string;
  /** ISO date of the actual calendar date, when it differs from observed */
  actualDate?: string;
}

// ─── Low-level date helpers ────────────────────────────────────────────────────

/** Return the Nth occurrence of `weekday` (0=Sun…6=Sat) in a given month. */
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month, 1).getDay();
  let day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  return new Date(year, month, day);
}

/** Return the last occurrence of `weekday` in a given month. */
function lastWeekday(year: number, month: number, weekday: number): Date {
  const lastDay = new Date(year, month + 1, 0); // last calendar day of month
  const diff = (lastDay.getDay() - weekday + 7) % 7;
  return new Date(year, month, lastDay.getDate() - diff);
}

/** Shift a fixed-date holiday to its observed date (Sat→Fri, Sun→Mon). */
function observed(date: Date): Date {
  const dow = date.getDay();
  if (dow === 6) return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
  if (dow === 0) return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return date;
}

function iso(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function usFederalHolidays(year: number): FederalHoliday[] {
  /** Fixed-date entries: [key, name, month (0-idx), day] */
  const fixed: Array<[string, string, number, number]> = [
    ['new_years',     "New Year's Day",   0,  1],
    ['juneteenth',    'Juneteenth',        5, 19],
    ['independence',  'Independence Day',  6,  4],
    ['veterans',      "Veterans Day",     10, 11],
    ['christmas',     'Christmas Day',    11, 25],
  ];

  /** Floating entries: [key, name, month (0-idx), weekday, n (-1 = last)] */
  const floating: Array<[string, string, number, number, number]> = [
    ['mlk',          'Martin Luther King Jr. Day', 0,  1, 3],
    ['presidents',   "Presidents' Day",             1,  1, 3],
    ['memorial',     'Memorial Day',                4,  1, -1], // last Monday May
    ['labor',        'Labor Day',                   8,  1, 1],
    ['columbus',     'Columbus Day',                9,  1, 2],
    ['thanksgiving', 'Thanksgiving Day',           10,  4, 4],
  ];

  const results: FederalHoliday[] = [];

  for (const [key, name, month, day] of fixed) {
    const actual = new Date(year, month, day);
    const obs = observed(actual);
    const actualIso = iso(actual);
    const obsIso = iso(obs);
    results.push({
      key,
      name,
      date: obsIso,
      actualDate: obsIso !== actualIso ? actualIso : undefined,
    });
  }

  for (const [key, name, month, weekday, n] of floating) {
    const date = n === -1
      ? lastWeekday(year, month, weekday)
      : nthWeekday(year, month, weekday, n);
    results.push({ key, name, date: iso(date) });
  }

  // Sort chronologically
  results.sort((a, b) => a.date.localeCompare(b.date));
  return results;
}

// ─── Paste parser ─────────────────────────────────────────────────────────────

export interface ParsedHoliday {
  name: string;
  /** ISO date YYYY-MM-DD */
  date: string;
}

export interface ParseResult {
  valid: ParsedHoliday[];
  /** Lines that could not be parsed, with their original text */
  invalid: Array<{ line: string; reason: string }>;
}

/**
 * Parse a multi-line string into holidays.
 *
 * Supported formats (delimiter = comma, pipe, tab, or 2+ spaces):
 *   2025-07-04 Independence Day
 *   Independence Day, 2025-07-04
 *   Jul 4 2025 | Independence Day
 *
 * Lines starting with # are treated as comments and skipped.
 */
export function parseHolidayText(text: string): ParseResult {
  const valid: ParsedHoliday[] = [];
  const invalid: Array<{ line: string; reason: string }> = [];

  const lines = text.split('\n');

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    // Extract any ISO date pattern YYYY-MM-DD
    const match = line.match(/(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))/);
    if (!match) {
      invalid.push({ line: raw, reason: 'No date found (expected YYYY-MM-DD)' });
      continue;
    }

    const date = match[1];

    // Validate date is actually a real calendar date
    const parsed = new Date(date + 'T00:00:00');
    if (isNaN(parsed.getTime())) {
      invalid.push({ line: raw, reason: `Invalid date: ${date}` });
      continue;
    }

    // Name = everything except the date string and common delimiters
    const name = line
      .replace(date, '')
      .replace(/^[\s,|]+|[\s,|]+$/g, '')
      .trim();

    if (!name) {
      invalid.push({ line: raw, reason: 'Missing holiday name' });
      continue;
    }

    valid.push({ name, date });
  }

  return { valid, invalid };
}
