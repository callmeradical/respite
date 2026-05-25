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
  const totalTaken     = round2(ptoEntries.filter((e) => e.status === 'taken')    .reduce((s, e) => s + e.days, 0));
  const totalScheduled = round2(ptoEntries.filter((e) => e.status === 'scheduled').reduce((s, e) => s + e.days, 0));

  // What you actually hold in your account right now
  const availableNow = round2(settings.opening_balance + totalAccrued - totalTaken);

  // Conservative figure (legacy): treats all scheduled PTO as if it happens today
  const remaining = round2(availableNow - totalScheduled);

  // Projected balance after the *last* scheduled PTO fires, crediting all
  // accrual that will happen between now and that date.
  let projectedAfterScheduled = availableNow; // no scheduled PTO → nothing changes
  const scheduledEntries = ptoEntries
    .filter((e) => e.status === 'scheduled' && e.end_date > toIso(today))
    .sort((a, b) => b.end_date.localeCompare(a.end_date));

  if (scheduledEntries.length > 0) {
    const lastEntry   = scheduledEntries[0];
    const lastDate    = parseISO(lastEntry.end_date);
    const periodsLast = countPayPeriods(startDate, lastDate, settings.pay_period_cadence);
    const futureAccrual = round2((periodsLast - periodsElapsed) * ratePerPeriod);
    projectedAfterScheduled = round2(availableNow + futureAccrual - totalScheduled);
  }

  return {
    totalAccrued,
    openingBalance: settings.opening_balance,
    totalTaken,
    totalScheduled,
    availableNow,
    projectedAfterScheduled,
    remaining,
    periodsElapsed,
    ratePerPeriod: round2(ratePerPeriod),
  };
}

// ─── Forward-looking balance helper ──────────────────────────────────────────

/**
 * Return the projected PTO balance on a given future date.
 *
 * Accounts for:
 *  - What the user holds today (opening + accrued − taken)
 *  - Pay periods that will complete between today and `atDate`
 *  - Already-scheduled PTO entries whose end_date falls before `atDate`
 *
 * Pass `excludeId` when validating an *edit* so the existing entry isn't
 * double-counted against the available balance.
 */
export function projectedBalanceAt(
  atDate: Date,
  settings: Settings,
  entries: TimeOffEntry[],
  excludeId?: string,
): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(atDate);
  target.setHours(0, 0, 0, 0);

  const startDate      = parseISO(settings.accrual_start_date);
  const periodsPerYear = settings.pay_period_cadence === 'biweekly' ? 26 : 24;
  const rate           = settings.days_per_year / periodsPerYear;

  const periodsToday  = countPayPeriods(startDate, today,  settings.pay_period_cadence);
  const periodsTarget = countPayPeriods(startDate, target, settings.pay_period_cadence);

  const ptoEntries = entries.filter(e => e.entry_type === 'pto' && e.id !== excludeId);

  const taken = ptoEntries
    .filter(e => e.status === 'taken')
    .reduce((s, e) => s + e.days, 0);

  // What we have right now
  const availableNow = round2(settings.opening_balance + periodsToday * rate - taken);

  // Pay periods earned between today and the target date
  const futureAccrual = round2(Math.max(0, periodsTarget - periodsToday) * rate);

  // Scheduled PTO that will already be used before this event starts
  const targetIso = toIso(target);
  const committedBefore = round2(
    ptoEntries
      .filter(e => e.status === 'scheduled' && e.end_date < targetIso)
      .reduce((s, e) => s + e.days, 0),
  );

  return round2(availableNow + futureAccrual - committedBefore);
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
