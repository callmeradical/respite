/**
 * Time-off optimizer.
 *
 * Provides three analyses:
 *  1. Bridge recommendations — windows where a few PTO days yield a
 *     disproportionately long break (ranked by efficiency ratio).
 *  2. Balance projection    — monthly projected balance for the next 18 months.
 *  3. Year-end warning      — whether balance will be forfeited or over-cap.
 */

import { addDays, addMonths, startOfMonth, parseISO, differenceInDays } from 'date-fns';
import type { TimeOffEntry, Holiday, Settings, AccrualSummary } from './types';
import { countPayPeriods, toIso } from './accrual';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecommendationCategory =
  | 'long-weekend'   // 3–5 total days
  | 'full-week'      // 5–9 total days
  | 'extended'       // 8–12 total days
  | 'two-weeks';     // 10–16 total days

export interface RecommendedDay {
  iso: string;
  dow: number;          // 0 = Sun … 6 = Sat
  isWeekend: boolean;
  isHoliday: boolean;
  isExistingPTO: boolean;
  isNewPTO: boolean;    // workday inside window = user should request this day
  holidayName?: string;
}

export interface Recommendation {
  id: string;
  start: string;
  end: string;
  totalDays: number;
  ptoDays: number;      // net new PTO days needed (budget cost)
  freeDays: number;     // days already free
  efficiency: number;   // totalDays / ptoDays — primary optimisation metric
  score: number;        // composite ranking score
  category: RecommendationCategory;
  anchors: string[];    // holiday names that make this window attractive
  /** Days not yet accrued but that will be earned before this window starts */
  yetToAccrue: number;
  days: RecommendedDay[];
}

export interface ProjectionPoint {
  date: string;         // ISO YYYY-MM-DD (first of each month)
  label: string;        // e.g. "Aug '25"
  accrued: number;      // cumulative accrual (no PTO taken)
  balance: number;      // actual projected balance (accrual – taken – scheduled)
}

export interface YearEndWarning {
  projectedBalance: number;
  unusedDays: number;         // days that may be forfeited (if no rollover)
  overCapDays: number;        // days over the cap (if a cap is set)
  payPeriodsRemaining: number;
  additionalAccrual: number;
  suggestion: string;
}

/**
 * Grade for a single PTO entry — how well did the dates leverage
 * surrounding free days (weekends + holidays)?
 */
export interface EfficiencyResult {
  /** Total consecutive calendar days off, including adjacent free days */
  totalDays: number;
  /** totalDays / ptoDays — the efficiency multiplier */
  efficiency: number;
  /** Colour tier for display */
  tier: 'great' | 'good' | 'ok' | 'fair';
}

export interface SpreadAdvice {
  daysRemaining: number;        // current balance
  totalAvailable: number;       // balance + remaining accrual this year
  monthsRemaining: number;
  idealPerMonth: number;        // totalAvailable / monthsRemaining
  idealPerWeek: number;         // totalAvailable / weeks remaining
}

/**
 * One row in the PTO usage report.
 * Represents the best consecutive-day window achievable by spending
 * exactly `ptoDays` new PTO days (Pareto-optimal: only included when
 * `totalDays` is strictly greater than all rows with fewer PTO days).
 */
export interface PtoUsageRow {
  /** New PTO days required to unlock this window */
  ptoDays: number;
  /** Total consecutive calendar days off */
  totalDays: number;
  /** Days already free (weekends + holidays + existing booked PTO) */
  freeDays: number;
  start: string;   // ISO YYYY-MM-DD
  end: string;     // ISO YYYY-MM-DD
  /** Holiday names that anchor this window */
  anchors: string[];
  /** PTO days yet to be accrued before the window starts */
  yetToAccrue: number;
  /** Day-by-day breakdown for the mini timeline */
  days: RecommendedDay[];
}

// ─── Day-map helpers ──────────────────────────────────────────────────────────

interface DayInfo {
  iso: string;
  date: Date;
  dow: number;
  isWeekend: boolean;
  isHoliday: boolean;
  isExistingPTO: boolean;
  isFree: boolean;
  holidayName?: string;
}

function buildDayMap(
  from: Date,
  days: number,
  entries: TimeOffEntry[],
  holidays: Holiday[],
): DayInfo[] {
  const holidayMap = new Map(holidays.map((h) => [h.date, h.name]));

  // Expand PTO entries to individual dates
  const ptoSet = new Set<string>();
  for (const e of entries) {
    if (e.entry_type !== 'pto') continue;
    let cur = parseISO(e.start_date);
    const end = parseISO(e.end_date);
    while (cur <= end) {
      ptoSet.add(toIso(cur));
      cur = addDays(cur, 1);
    }
  }

  const map: DayInfo[] = [];
  let cur = new Date(from);
  cur.setHours(0, 0, 0, 0);

  for (let i = 0; i < days; i++) {
    const iso = toIso(cur);
    const dow = cur.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isHoliday = holidayMap.has(iso);
    const isExistingPTO = ptoSet.has(iso);
    map.push({
      iso,
      date: new Date(cur),
      dow,
      isWeekend,
      isHoliday,
      isExistingPTO,
      isFree: isWeekend || isHoliday || isExistingPTO,
      holidayName: holidayMap.get(iso),
    });
    cur = addDays(cur, 1);
  }
  return map;
}

function categoryOf(totalDays: number): RecommendationCategory {
  if (totalDays <= 5) return 'long-weekend';
  if (totalDays <= 9) return 'full-week';
  if (totalDays <= 12) return 'extended';
  return 'two-weeks';
}

function compositeScore(
  efficiency: number,
  totalDays: number,
  anchorCount: number,
): number {
  // Primary goal: most continuous days off for the least PTO spend.
  // Score = totalDays × efficiency so that both axes matter equally:
  //   — a 10-day break at 2.5× beats a 4-day break at 3.0×
  //   — a 4-day break at 3.0× beats a 4-day break at 2.0×
  // Holiday anchors add a bonus because they're fixed free days.
  return totalDays * efficiency * (1 + 0.25 * anchorCount);
}

function overlapFraction(
  aStart: number, aEnd: number,
  bStart: number, bEnd: number,
): number {
  const lo = Math.max(aStart, bStart);
  const hi = Math.min(aEnd, bEnd);
  if (lo > hi) return 0;
  const overlap = hi - lo + 1;
  const shorter = Math.min(aEnd - aStart + 1, bEnd - bStart + 1);
  return overlap / shorter;
}

// ─── 1. Bridge recommendations ────────────────────────────────────────────────

export function generateRecommendations(
  summary: AccrualSummary,
  settings: Settings,
  entries: TimeOffEntry[],
  holidays: Holiday[],
  horizonDays = 365,
): Record<RecommendationCategory, Recommendation[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = toIso(today);

  // Balance already in hand (accrued so far, minus taken).
  // We intentionally do NOT subtract scheduled PTO here — that will be
  // handled per-window so that future accrual is credited before future PTO.
  // availableNow is openingBalance + totalAccrued − totalTaken, pre-computed
  const balanceNow = summary.availableNow;

  const accrualStart = parseISO(settings.accrual_start_date);
  const periodsPerYear = settings.pay_period_cadence === 'biweekly' ? 26 : 24;
  const ratePerPeriod = settings.days_per_year / periodsPerYear;
  const periodsToday = countPayPeriods(accrualStart, today, settings.pay_period_cadence);

  // Sorted future scheduled PTO — used to compute how much has been
  // "spent" on commitments that land before any given window start.
  const futureScheduled = entries
    .filter(e => e.entry_type === 'pto' && e.status === 'scheduled' && e.end_date >= todayIso)
    .sort((a, b) => a.end_date.localeCompare(b.end_date));

  const map = buildDayMap(today, horizonDays, entries, holidays);
  const n = map.length;

  // Sliding window: try all (start, length) pairs
  interface Candidate extends Recommendation {
    startIdx: number;
    endIdx: number;
  }
  const candidates: Candidate[] = [];

  // Running pointer into futureScheduled — advances as s moves forward
  let schedPtr = 0;
  let schedBefore = 0; // cumulative days of scheduled PTO ending before map[s]

  for (let s = 0; s < n; s++) {
    // Advance pointer past scheduled entries that end before this window starts
    while (
      schedPtr < futureScheduled.length &&
      futureScheduled[schedPtr].end_date < map[s].iso
    ) {
      schedBefore += futureScheduled[schedPtr].days;
      schedPtr++;
    }

    // Budget = what we have today + what we'll earn before this window starts
    //          − PTO already committed that falls before this window
    const periodsToStart = countPayPeriods(accrualStart, map[s].date, settings.pay_period_cadence);
    const yetToAccrue = (periodsToStart - periodsToday) * ratePerPeriod;
    const budget = Math.max(0, balanceNow + yetToAccrue - schedBefore);

    let freeDays = 0;
    let ptoDays = 0;
    const anchors: string[] = [];

    for (let e = s; e < n && e - s < 16; e++) {
      const day = map[e];
      if (day.isFree) {
        freeDays++;
        if (
          day.isHoliday &&
          day.holidayName &&
          !anchors.includes(day.holidayName)
        ) {
          anchors.push(day.holidayName);
        }
      } else {
        ptoDays++;
      }

      const totalDays = e - s + 1;
      if (freeDays === 0) continue;    // no anchor
      if (ptoDays === 0) continue;     // nothing to optimize
      if (ptoDays > budget) break;     // extending further only costs more
      if (totalDays < 3) continue;

      const efficiency = totalDays / ptoDays;
      if (efficiency < 1.5) continue;

      const score = compositeScore(efficiency, totalDays, anchors.length);
      const category = categoryOf(totalDays);

      const days: RecommendedDay[] = map.slice(s, e + 1).map((d) => ({
        iso: d.iso,
        dow: d.dow,
        isWeekend: d.isWeekend,
        isHoliday: d.isHoliday,
        isExistingPTO: d.isExistingPTO,
        isNewPTO: !d.isFree,
        holidayName: d.holidayName,
      }));

      candidates.push({
        id: `${s}-${e}`,
        startIdx: s,
        endIdx: e,
        start: map[s].iso,
        end: map[e].iso,
        totalDays,
        ptoDays,
        freeDays,
        efficiency: Math.round(efficiency * 100) / 100,
        score,
        category,
        anchors: [...anchors],
        yetToAccrue: Math.round(Math.max(0, yetToAccrue) * 100) / 100,
        days,
      });
    }
  }

  // Deduplicate per category: greedy select, skip if >60% overlap with selected
  const CATEGORIES: RecommendationCategory[] = [
    'long-weekend', 'full-week', 'extended', 'two-weeks',
  ];

  const result = {} as Record<RecommendationCategory, Recommendation[]>;

  for (const cat of CATEGORIES) {
    const pool = candidates
      .filter((c) => c.category === cat)
      .sort((a, b) => b.score - a.score);

    const selected: Candidate[] = [];
    for (const c of pool) {
      const dominated = selected.some(
        (s) => overlapFraction(c.startIdx, c.endIdx, s.startIdx, s.endIdx) > 0.6,
      );
      if (!dominated) selected.push(c);
      if (selected.length >= 8) break;
    }

    result[cat] = selected.map(({ startIdx: _, endIdx: __, ...rec }) => rec);
  }

  return result;
}

// ─── 2. PTO usage report ──────────────────────────────────────────────────────
//
// For each possible PTO spend (1 … floor(availableNow)), find the window in
// the next `horizonDays` that yields the most consecutive calendar days off.
// Only Pareto-optimal rows are returned: a row for N PTO days is included only
// when it produces strictly more consecutive days than any row with fewer days.

export function buildPtoUsageReport(
  summary: AccrualSummary,
  settings: Settings,
  entries: TimeOffEntry[],
  holidays: Holiday[],
  horizonDays = 365,
  maxWindowDays = 30,
): PtoUsageRow[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = toIso(today);

  const balanceNow = summary.availableNow;
  const maxBudget = Math.floor(balanceNow);
  if (maxBudget < 1) return [];

  const accrualStart = parseISO(settings.accrual_start_date);
  const periodsPerYear = settings.pay_period_cadence === 'biweekly' ? 26 : 24;
  const ratePerPeriod = settings.days_per_year / periodsPerYear;
  const periodsToday = countPayPeriods(accrualStart, today, settings.pay_period_cadence);

  const futureScheduled = entries
    .filter(e => e.entry_type === 'pto' && e.status === 'scheduled' && e.end_date >= todayIso)
    .sort((a, b) => a.end_date.localeCompare(b.end_date));

  const map = buildDayMap(today, horizonDays, entries, holidays);
  const n = map.length;

  interface BestWindow {
    totalDays: number;
    startIdx: number;
    endIdx: number;
    freeDays: number;
    anchors: string[];
    yetToAccrue: number;
  }

  // For each exact PTO day count, keep the window with the most consecutive days
  const bestByPto = new Map<number, BestWindow>();

  let schedPtr = 0;
  let schedBefore = 0;

  for (let s = 0; s < n; s++) {
    // Advance past scheduled entries that end before this window starts
    while (
      schedPtr < futureScheduled.length &&
      futureScheduled[schedPtr].end_date < map[s].iso
    ) {
      schedBefore += futureScheduled[schedPtr].days;
      schedPtr++;
    }

    const periodsToStart = countPayPeriods(accrualStart, map[s].date, settings.pay_period_cadence);
    const yetToAccrue = (periodsToStart - periodsToday) * ratePerPeriod;
    const budget = Math.min(maxBudget, Math.floor(balanceNow + yetToAccrue - schedBefore));
    if (budget < 1) continue;

    let freeDays = 0;
    let ptoDays = 0;
    const anchors: string[] = [];

    for (let e = s; e < n && e - s < maxWindowDays; e++) {
      const day = map[e];
      if (day.isFree) {
        freeDays++;
        if (day.isHoliday && day.holidayName && !anchors.includes(day.holidayName)) {
          anchors.push(day.holidayName);
        }
      } else {
        ptoDays++;
      }

      if (ptoDays > budget) break;
      if (ptoDays === 0) continue;

      const totalDays = e - s + 1;
      const existing = bestByPto.get(ptoDays);
      if (!existing || totalDays > existing.totalDays) {
        bestByPto.set(ptoDays, {
          totalDays,
          startIdx: s,
          endIdx: e,
          freeDays,
          anchors: [...anchors],
          yetToAccrue: Math.max(0, yetToAccrue),
        });
      }
    }
  }

  // Build Pareto frontier: only emit rows where totalDays strictly improves
  const result: PtoUsageRow[] = [];
  let maxConsecutive = 0;

  for (let b = 1; b <= maxBudget; b++) {
    const best = bestByPto.get(b);
    if (!best || best.totalDays <= maxConsecutive) continue;
    maxConsecutive = best.totalDays;

    const { startIdx, endIdx, freeDays, anchors, yetToAccrue } = best;
    const days: RecommendedDay[] = map.slice(startIdx, endIdx + 1).map((d) => ({
      iso: d.iso,
      dow: d.dow,
      isWeekend: d.isWeekend,
      isHoliday: d.isHoliday,
      isExistingPTO: d.isExistingPTO,
      isNewPTO: !d.isFree,
      holidayName: d.holidayName,
    }));

    result.push({
      ptoDays: b,
      totalDays: best.totalDays,
      freeDays,
      start: map[startIdx].iso,
      end: map[endIdx].iso,
      anchors,
      yetToAccrue: r2(yetToAccrue),
      days,
    });
  }

  return result;
}

// ─── 3. Balance projection ────────────────────────────────────────────────────
//
// Iterative approach: walk month-by-month from today, adding accrual and
// subtracting scheduled PTO.  At each Jan 1 crossing, apply the carryover cap
// so the chart correctly reflects what balance will carry into the new year.

export function buildBalanceProjection(
  settings: Settings,
  entries: TimeOffEntry[],
  /** Actual current balance (ground truth from accrual summary). */
  currentBalance: number,
  months = 18,
): ProjectionPoint[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startDate   = parseISO(settings.accrual_start_date);
  const periodsPerYear = settings.pay_period_cadence === 'biweekly' ? 26 : 24;
  const rate        = settings.days_per_year / periodsPerYear;
  const carryoverDays =
    settings.carryover_limit_hours != null && settings.hours_per_day > 0
      ? settings.carryover_limit_hours / settings.hours_per_day
      : null;

  // Pre-sort future scheduled PTO by end_date for O(n) walking
  const futureScheduled = entries
    .filter((e) => e.entry_type === 'pto' && e.status === 'scheduled' && e.end_date >= toIso(today))
    .sort((a, b) => a.end_date.localeCompare(b.end_date));

  let scheduledIdx = 0; // pointer into futureScheduled

  let balance  = currentBalance;  // running real balance (with PTO deducted)
  let noDeduct = currentBalance;  // upper bound: accrual only, no future PTO

  let prevPeriods = countPayPeriods(startDate, today, settings.pay_period_cadence);
  let prevDate = today;

  const points: ProjectionPoint[] = [];

  for (let m = 0; m <= months; m++) {
    const d   = startOfMonth(addMonths(today, m));
    const iso = toIso(d);

    if (m > 0) {
      // ── Apply carryover cap at year boundary ──────────────────────────────
      // The cap is applied at Dec 31 → Jan 1 transition.
      // We detect it by year changing between prevDate and d.
      if (d.getFullYear() > prevDate.getFullYear() && carryoverDays != null) {
        balance  = Math.min(balance,  carryoverDays);
        noDeduct = Math.min(noDeduct, carryoverDays);
      }

      // ── Add new accrual ───────────────────────────────────────────────────
      const curPeriods = countPayPeriods(startDate, d, settings.pay_period_cadence);
      const newAccrual = (curPeriods - prevPeriods) * rate;
      balance  += newAccrual;
      noDeduct += newAccrual;

      // Apply continuous accrual cap if set
      if (settings.max_balance_days != null) {
        balance  = Math.min(balance,  settings.max_balance_days);
        noDeduct = Math.min(noDeduct, settings.max_balance_days);
      }

      // ── Subtract scheduled PTO ending in this interval ───────────────────
      const prevIso = toIso(prevDate);
      while (
        scheduledIdx < futureScheduled.length &&
        futureScheduled[scheduledIdx].end_date > prevIso &&
        futureScheduled[scheduledIdx].end_date <= iso
      ) {
        balance -= futureScheduled[scheduledIdx].days;
        scheduledIdx++;
      }

      balance  = Math.max(0, r2(balance));
      noDeduct = Math.max(0, r2(noDeduct));

      prevPeriods = countPayPeriods(startDate, d, settings.pay_period_cadence);
      prevDate = d;
    }

    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    points.push({ date: iso, label, accrued: r2(noDeduct), balance: r2(balance) });
  }

  return points;
}

// ─── 3. Year-end warning ──────────────────────────────────────────────────────

export function buildYearEndWarning(
  settings: Settings,
  entries: TimeOffEntry[],
  currentBalance: number,
): YearEndWarning | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yearEnd = new Date(today.getFullYear(), 11, 31);
  if (yearEnd <= today) return null;

  const startDate = parseISO(settings.accrual_start_date);
  const periodsPerYear = settings.pay_period_cadence === 'biweekly' ? 26 : 24;
  const rate = settings.days_per_year / periodsPerYear;

  const periodsNow     = countPayPeriods(startDate, today,    settings.pay_period_cadence);
  const periodsYearEnd = countPayPeriods(startDate, yearEnd,  settings.pay_period_cadence);
  const payPeriodsRemaining = periodsYearEnd - periodsNow;
  const additionalAccrual   = r2(payPeriodsRemaining * rate);

  const todayIso   = toIso(today);
  const yearEndIso = toIso(yearEnd);

  let scheduledRemaining = 0;
  for (const e of entries) {
    if (
      e.entry_type === 'pto' &&
      e.status === 'scheduled' &&
      e.start_date > todayIso &&
      e.end_date <= yearEndIso
    ) {
      scheduledRemaining += e.days;
    }
  }

  const projectedBalance = r2(currentBalance + additionalAccrual - scheduledRemaining);

  // Carryover limit takes precedence over the continuous cap for year-end analysis
  const carryoverDays =
    settings.carryover_limit_hours != null && settings.hours_per_day > 0
      ? settings.carryover_limit_hours / settings.hours_per_day
      : null;

  const forfeited = carryoverDays != null
    ? Math.max(0, r2(projectedBalance - carryoverDays))
    : 0;

  // Also check continuous cap (less common but supported)
  const continuousCapExcess =
    settings.max_balance_days != null
      ? Math.max(0, r2(projectedBalance - settings.max_balance_days))
      : 0;

  const overCapDays = Math.max(forfeited, continuousCapExcess);
  const unusedDays  = Math.max(0, projectedBalance);

  if (projectedBalance < 1 && overCapDays === 0) return null;

  const hpd = settings.hours_per_day ?? 8;

  let suggestion = '';
  if (forfeited > 0) {
    const forfeitedHrs = r2(forfeited * hpd);
    const carryoverHrs = settings.carryover_limit_hours!;
    suggestion =
      `You'll have ${fmtD(projectedBalance)} days (${fmtD(projectedBalance * hpd)} hrs) at year-end ` +
      `but only ${fmtD(carryoverHrs)} hrs (${fmtD(carryoverDays!)} days) can carry over. ` +
      `Schedule at least ${fmtD(forfeited)} more days (${fmtD(forfeitedHrs)} hrs) before Dec 31 to avoid forfeiting them.`;
  } else if (continuousCapExcess > 0) {
    suggestion =
      `You'll exceed your ${settings.max_balance_days}-day accrual cap by ` +
      `${fmtD(continuousCapExcess)} days. You'll stop accruing at that point—use days sooner to keep earning.`;
  } else if (unusedDays >= 3) {
    suggestion =
      `You're on track to finish the year with ${fmtD(unusedDays)} days ` +
      `(${fmtD(r2(unusedDays * hpd))} hrs) unused. Consider scheduling more time off now.`;
  } else if (unusedDays >= 1) {
    suggestion =
      `You'll have ~${fmtD(unusedDays)} days left at year-end. A long weekend in Q4 would clear the balance.`;
  }

  return {
    projectedBalance,
    unusedDays,
    overCapDays,
    payPeriodsRemaining,
    additionalAccrual,
    suggestion,
  };
}

// ─── 4. Spread advice ─────────────────────────────────────────────────────────

export function buildSpreadAdvice(
  settings: Settings,
  currentBalance: number,
): SpreadAdvice {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yearEnd = new Date(today.getFullYear(), 11, 31);
  const startDate = parseISO(settings.accrual_start_date);
  const periodsPerYear = settings.pay_period_cadence === 'biweekly' ? 26 : 24;
  const rate = settings.days_per_year / periodsPerYear;

  const periodsNow     = countPayPeriods(startDate, today,   settings.pay_period_cadence);
  const periodsYearEnd = countPayPeriods(startDate, yearEnd, settings.pay_period_cadence);
  const additionalAccrual = (periodsYearEnd - periodsNow) * rate;

  // Effective usable total respects carryover (no point "planning" days you'd forfeit)
  const rawTotal = currentBalance + additionalAccrual;
  const carryoverDays =
    settings.carryover_limit_hours != null && settings.hours_per_day > 0
      ? settings.carryover_limit_hours / settings.hours_per_day
      : null;
  const totalAvailable = r2(carryoverDays != null ? Math.min(rawTotal, carryoverDays) : rawTotal);

  const daysUntilYearEnd = differenceInDays(yearEnd, today);
  const monthsRemaining  = Math.max(1, daysUntilYearEnd / 30.44);
  const weeksRemaining   = Math.max(1, daysUntilYearEnd / 7);

  return {
    daysRemaining:  currentBalance,
    totalAvailable,
    monthsRemaining: Math.round(monthsRemaining * 10) / 10,
    idealPerMonth:  r2(totalAvailable / monthsRemaining),
    idealPerWeek:   r2(totalAvailable / weeksRemaining),
  };
}

// ─── 6. Window efficiency ─────────────────────────────────────────────────────
//
// Computes how efficiently a PTO entry uses its days by expanding outward from
// the entry's own date range to include adjacent weekends and holidays.
// Example: Mon–Fri (5 PTO days) → Sat + Mon–Fri + Sat–Sun = 9 consecutive days → 1.8×
// Example: Mon–Wed before Thanksgiving → Sat + Mon–Wed + Thu (holiday) + Fri + Sat–Sun = 9 days → 3.0×

export function computeWindowEfficiency(
  startDate: string,
  endDate: string,
  ptoDays: number,
  holidays: Holiday[],
): EfficiencyResult {
  const noGrade: EfficiencyResult = { totalDays: 0, efficiency: 0, tier: 'fair' };
  if (ptoDays <= 0 || !startDate || !endDate) return noGrade;

  const holidaySet = new Set(holidays.map((h) => h.date));

  function isFree(d: Date): boolean {
    const dow = d.getDay();
    return dow === 0 || dow === 6 || holidaySet.has(toIso(d));
  }

  let winStart = parseISO(startDate);
  let winEnd   = parseISO(endDate);

  // Expand backward into adjacent free days
  let prev = addDays(winStart, -1);
  while (isFree(prev)) {
    winStart = prev;
    prev = addDays(prev, -1);
  }

  // Expand forward into adjacent free days
  let next = addDays(winEnd, 1);
  while (isFree(next)) {
    winEnd = next;
    next = addDays(next, 1);
  }

  const totalDays = differenceInDays(winEnd, winStart) + 1;
  const efficiency = Math.round((totalDays / ptoDays) * 100) / 100;
  const tier: EfficiencyResult['tier'] =
    efficiency >= 4   ? 'great'
    : efficiency >= 2.5 ? 'good'
    : efficiency >= 1.5 ? 'ok'
    : 'fair';

  return { totalDays, efficiency, tier };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtD(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}
