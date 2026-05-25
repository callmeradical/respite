// ─── Domain types ─────────────────────────────────────────────────────────────

export type PayPeriodCadence = 'biweekly' | 'semi_monthly';
export type Theme = 'light' | 'dark' | 'auto';
export type EntryType = 'pto' | 'holiday';
export type EntryStatus = 'taken' | 'scheduled';

export interface Settings {
  id: number;
  /** 'biweekly' (26/yr) or 'semi_monthly' (24/yr) */
  pay_period_cadence: PayPeriodCadence;
  /** Total PTO days accrued per calendar year */
  days_per_year: number;
  /** ISO date — when tracking started / employee start date */
  accrual_start_date: string;
  /** Balance already held on accrual_start_date */
  opening_balance: number;
  /** Continuous accrual cap — you stop earning once balance hits this (days) */
  max_balance_days: number | null;
  /** Working hours per day (default 8).  Used to convert hours ↔ days. */
  hours_per_day: number;
  /**
   * Maximum hours that carry over at year-end.
   * At Jan 1, any balance above this limit is forfeited.
   * null = unlimited carryover.
   */
  carryover_limit_hours: number | null;
  /** UI theme preference — 'light' | 'dark' | 'auto' (follows system) */
  theme: Theme;
}

export interface TimeOffEntry {
  id: string;
  entry_type: EntryType;
  /** ISO date YYYY-MM-DD */
  start_date: string;
  /** ISO date YYYY-MM-DD */
  end_date: string;
  /** Working days consumed */
  days: number;
  status: EntryStatus;
  notes: string | null;
  created_at: string;
}

export interface Holiday {
  id: string;
  name: string;
  /** ISO date YYYY-MM-DD */
  date: string;
  is_company_holiday: boolean;
}

// ─── Accrual summary ──────────────────────────────────────────────────────────

export interface AccrualSummary {
  /** Days accrued from start_date through today */
  totalAccrued: number;
  /** Opening balance on start_date */
  openingBalance: number;
  /** PTO entries with status = 'taken' */
  totalTaken: number;
  /** PTO entries with status = 'scheduled' (future) */
  totalScheduled: number;
  /**
   * What you actually have in your account right now.
   * = openingBalance + totalAccrued − totalTaken
   * Does NOT deduct scheduled PTO.
   */
  availableNow: number;
  /**
   * Projected balance after every scheduled PTO event has been taken,
   * crediting the accrual you will earn between now and each event.
   * = availableNow + accrual(today → lastScheduledDate) − totalScheduled
   *
   * This is the "true" remaining balance once all planned time off is done.
   */
  projectedAfterScheduled: number;
  /**
   * @deprecated Use availableNow for the current balance.
   * Kept for backward-compat with optimizer / forecast code that reads it.
   * = availableNow − totalScheduled  (conservative: treats all PTO as spent today)
   */
  remaining: number;
  /** Number of complete pay periods elapsed */
  periodsElapsed: number;
  /** Days accrued per pay period */
  ratePerPeriod: number;
}
