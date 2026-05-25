import { parseISO, isAfter, isBefore, isSameDay, addDays, getDate, getMonth, getYear } from 'date-fns';
import type { Settings, TimeOffEntry, Holiday, AccrualSummary, PayPeriodCadence } from './types';

// ─── Pay-period counting ───────────────────────────────────────────────────────

/**
 * Count complete pay periods that have elapsed from `startDate` up to (and
 * including) `today`.  Accrual is credited at the END of each period.
 */
export function countPayPeriods(
  startDate: Date,
  today: Date,
  cadence: PayPeriodCadence,
): number {
  if (isBefore(today, startDate)) return 0;

  if (cadence === 'biweekly') {
    // Each period is exactly 14 calendar days
    const msPerPeriod = 14 * 24 * 60 * 60 * 1000;
    return Math.floor((today.getTime() - startDate.getTime()) / msPerPeriod);
  }

  // semi_monthly: paydays are the 1st and the 15th of each month.
  // Walk forward from the boundary *after* startDate, counting each
  // boundary that is on or before today.
  let count = 0;
  let boundary = nextSemiMonthlyBoundary(startDate, true /* exclusive */);

  while (!isAfter(boundary, today)) {
    count++;
    boundary = nextSemiMonthlyBoundary(boundary, false /* inclusive → advance */);
  }
  return count;
}

/**
 * Given a date, return the next semi-monthly pay boundary.
 * Boundaries are the 1st and 15th of each month.
 * @param from        Reference date.
 * @param exclusive   If true, the boundary must be strictly after `from`.
 */
function nextSemiMonthlyBoundary(from: Date, exclusive: boolean): Date {
  const d = from.getDate();
  const m = from.getMonth();
  const y = from.getFullYear();

  if (!exclusive && (d === 1 || d === 15)) {
    // Already on a boundary — advance to the next one
    return d === 1
      ? new Date(y, m, 15)
      : new Date(y, m + 1, 1);
  }

  if (d < 15) {
    const candidate = new Date(y, m, 15);
    if (!exclusive || isAfter(candidate, from) || isSameDay(candidate, from)) {
      return candidate;
    }
  }
  return new Date(y, m + 1, 1);
}

// ─── Working-day helpers ───────────────────────────────────────────────────────

/** Count Mon–Fri days between start and end (inclusive), excluding holidays. */
export function countWorkingDays(start: Date, end: Date, holidays: Holiday[]): number {
  const holidaySet = new Set(holidays.map((h) => h.date));
  let count = 0;
  let cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const endNorm = new Date(end);
  endNorm.setHours(0, 0, 0, 0);

  while (!isAfter(cur, endNorm)) {
    const dow = cur.getDay(); // 0=Sun, 6=Sat
    const iso = toIso(cur);
    if (dow !== 0 && dow !== 6 && !holidaySet.has(iso)) {
      count++;
    }
    cur = addDays(cur, 1);
  }
  return count;
}

// ─── Accrual summary ──────────────────────────────────────────────────────────

export function computeAccrual(
  settings: Settings,
  entries: TimeOffEntry[],
): AccrualSummary {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startDate = parseISO(settings.accrual_start_date);
  const periodsPerYear = settings.pay_period_cadence === 'biweekly' ? 26 : 24;
  const ratePerPeriod = settings.days_per_year / periodsPerYear;

  const periodsElapsed = countPayPeriods(startDate, today, settings.pay_period_cadence);
  const totalAccrued = Math.round(periodsElapsed * ratePerPeriod * 100) / 100;

  const ptoEntries = entries.filter((e) => e.entry_type === 'pto');
  const totalTaken = round2(ptoEntries.filter((e) => e.status === 'taken').reduce((s, e) => s + e.days, 0));
  const totalScheduled = round2(ptoEntries.filter((e) => e.status === 'scheduled').reduce((s, e) => s + e.days, 0));

  const remaining = round2(
    settings.opening_balance + totalAccrued - totalTaken - totalScheduled,
  );

  return {
    totalAccrued,
    openingBalance: settings.opening_balance,
    totalTaken,
    totalScheduled,
    remaining,
    periodsElapsed,
    ratePerPeriod: round2(ratePerPeriod),
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function toIso(date: Date): string {
  const y = getYear(date);
  const m = String(getMonth(date) + 1).padStart(2, '0');
  const d = String(getDate(date)).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
