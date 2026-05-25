import { describe, it, expect } from 'vitest';
import { countPayPeriods, countWorkingDays, computeAccrual, toIso } from '../src/lib/accrual';
import type { Settings, TimeOffEntry, Holiday } from '../src/lib/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function d(iso: string) {
  const dt = new Date(iso + 'T00:00:00');
  return dt;
}

const BASE_SETTINGS: Settings = {
  id: 1,
  pay_period_cadence: 'biweekly',
  days_per_year: 15,
  accrual_start_date: '2025-01-01',
  opening_balance: 0,
  max_balance_days: null,
  hours_per_day: 8,
  carryover_limit_hours: null,
};

// ─── countPayPeriods — biweekly ───────────────────────────────────────────────

describe('countPayPeriods (biweekly)', () => {
  it('returns 0 on the start date itself', () => {
    expect(countPayPeriods(d('2025-01-01'), d('2025-01-01'), 'biweekly')).toBe(0);
  });

  it('returns 0 for fewer than 14 days elapsed', () => {
    expect(countPayPeriods(d('2025-01-01'), d('2025-01-13'), 'biweekly')).toBe(0);
  });

  it('returns 1 after exactly 14 days', () => {
    expect(countPayPeriods(d('2025-01-01'), d('2025-01-15'), 'biweekly')).toBe(1);
  });

  it('returns 26 after a full year (52 weeks / 2)', () => {
    expect(countPayPeriods(d('2025-01-01'), d('2025-12-31'), 'biweekly')).toBe(26);
  });

  it('returns 0 if today is before start', () => {
    expect(countPayPeriods(d('2025-06-01'), d('2025-01-01'), 'biweekly')).toBe(0);
  });
});

// ─── countPayPeriods — semi-monthly ──────────────────────────────────────────

describe('countPayPeriods (semi_monthly)', () => {
  it('returns 0 on the start date itself', () => {
    expect(countPayPeriods(d('2025-01-01'), d('2025-01-01'), 'semi_monthly')).toBe(0);
  });

  it('counts the 15th as the first boundary after Jan 1', () => {
    expect(countPayPeriods(d('2025-01-01'), d('2025-01-15'), 'semi_monthly')).toBe(1);
  });

  it('counts Feb 1 as the second boundary after Jan 1', () => {
    expect(countPayPeriods(d('2025-01-01'), d('2025-02-01'), 'semi_monthly')).toBe(2);
  });

  it('returns 23 by Dec 31 (24th boundary is Jan 1 next year)', () => {
    // Semi-monthly boundaries after Jan 1: Jan 15, Feb 1 … Dec 15 = 23 total by Dec 31.
    // The 24th payday (Jan 1 next year) has not yet occurred.
    expect(countPayPeriods(d('2025-01-01'), d('2025-12-31'), 'semi_monthly')).toBe(23);
  });

  it('returns 24 after a complete calendar year (through Jan 1 next year)', () => {
    expect(countPayPeriods(d('2025-01-01'), d('2026-01-01'), 'semi_monthly')).toBe(24);
  });
});

// ─── countWorkingDays ─────────────────────────────────────────────────────────

describe('countWorkingDays', () => {
  const noHolidays: Holiday[] = [];

  it('counts a single weekday as 1', () => {
    // 2025-01-06 is a Monday
    expect(countWorkingDays(d('2025-01-06'), d('2025-01-06'), noHolidays)).toBe(1);
  });

  it('counts Mon-Fri as 5 working days', () => {
    expect(countWorkingDays(d('2025-01-06'), d('2025-01-10'), noHolidays)).toBe(5);
  });

  it('excludes the weekend in a Mon-Sun range', () => {
    // Mon 6 Jan – Sun 12 Jan = 5 working days
    expect(countWorkingDays(d('2025-01-06'), d('2025-01-12'), noHolidays)).toBe(5);
  });

  it('counts 0 for a Saturday-only range', () => {
    // 2025-01-04 is a Saturday
    expect(countWorkingDays(d('2025-01-04'), d('2025-01-04'), noHolidays)).toBe(0);
  });

  it('excludes holidays', () => {
    const holidays: Holiday[] = [{
      id: '1', name: "New Year's Day", date: '2025-01-01', is_company_holiday: true,
    }];
    // 2025-01-01 is a Wednesday — normally a working day, but it's a holiday
    expect(countWorkingDays(d('2025-01-01'), d('2025-01-01'), holidays)).toBe(0);
  });

  it('handles a two-week span with a holiday', () => {
    // Jan 6–17 (Mon–Fri × 2 = 10 days), minus MLK Jan 20 — but MLK is outside this range
    // Jan 13 (Mon) – Jan 17 (Fri) = 5 days in second week. Total = 10.
    const holidays: Holiday[] = [];
    expect(countWorkingDays(d('2025-01-06'), d('2025-01-17'), holidays)).toBe(10);
  });
});

// ─── computeAccrual ───────────────────────────────────────────────────────────

describe('computeAccrual', () => {
  it('returns zero accrual with no periods elapsed (same-day start)', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const settings: Settings = {
      ...BASE_SETTINGS,
      accrual_start_date: toIso(today),
      opening_balance: 0,
    };
    const result = computeAccrual(settings, []);
    expect(result.totalAccrued).toBe(0);
    expect(result.availableNow).toBe(0);
    expect(result.remaining).toBe(0);
    expect(result.periodsElapsed).toBe(0);
  });

  it('credits the opening balance into availableNow', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const settings: Settings = {
      ...BASE_SETTINGS,
      accrual_start_date: toIso(today),
      opening_balance: 5,
    };
    const result = computeAccrual(settings, []);
    expect(result.availableNow).toBe(5);
    expect(result.openingBalance).toBe(5);
  });

  it('subtracts taken PTO from availableNow but not from projectedAfterScheduled when no scheduled', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const settings: Settings = {
      ...BASE_SETTINGS,
      accrual_start_date: toIso(today),
      opening_balance: 10,
    };
    const entries: TimeOffEntry[] = [{
      id: '1', entry_type: 'pto',
      start_date: toIso(today), end_date: toIso(today),
      days: 3, status: 'taken', notes: null, created_at: '',
    }];
    const result = computeAccrual(settings, entries);
    expect(result.totalTaken).toBe(3);
    expect(result.availableNow).toBe(7);
    expect(result.remaining).toBe(7);
    // No scheduled PTO → projected equals availableNow
    expect(result.projectedAfterScheduled).toBe(7);
  });

  it('remaining is the conservative today-only figure; projectedAfterScheduled credits future accrual', () => {
    // Start date 1 year ago so there's a meaningful accrual period to project into
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    oneYearAgo.setHours(0, 0, 0, 0);

    const sixMonthsFromNow = new Date();
    sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
    sixMonthsFromNow.setHours(0, 0, 0, 0);

    const settings: Settings = {
      ...BASE_SETTINGS,
      accrual_start_date: toIso(oneYearAgo),
      opening_balance: 0,
    };
    const entries: TimeOffEntry[] = [{
      id: '2', entry_type: 'pto',
      start_date: toIso(sixMonthsFromNow), end_date: toIso(sixMonthsFromNow),
      days: 5, status: 'scheduled', notes: null, created_at: '',
    }];
    const result = computeAccrual(settings, entries);

    // remaining is conservative (no future accrual)
    expect(result.remaining).toBe(result.availableNow - 5);

    // projected should be HIGHER than remaining because 6 months of accrual
    // will happen before the scheduled PTO fires
    expect(result.projectedAfterScheduled).toBeGreaterThan(result.remaining);
  });

  it('computes correct rate per period (15 days / 26 periods, rounded to 2dp)', () => {
    // 15 / 26 = 0.576923… → stored as 0.58 after round2()
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result = computeAccrual({ ...BASE_SETTINGS, accrual_start_date: toIso(today) }, []);
    expect(result.ratePerPeriod).toBe(0.58);
  });

  it('ignores holiday entry types in accrual', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const settings: Settings = {
      ...BASE_SETTINGS,
      accrual_start_date: toIso(today),
      opening_balance: 5,
    };
    const entries: TimeOffEntry[] = [{
      id: '3',
      entry_type: 'holiday',
      start_date: toIso(today),
      end_date: toIso(today),
      days: 1,
      status: 'taken',
      notes: null,
      created_at: '',
    }];
    const result = computeAccrual(settings, entries);
    // Holiday entries should not affect remaining balance
    expect(result.remaining).toBe(5);
  });
});
