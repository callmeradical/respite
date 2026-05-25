import Database from '@tauri-apps/plugin-sql';
import type { Settings, TimeOffEntry, Holiday } from './types';

const DB_URL = 'sqlite:respite.db';

let _db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!_db) {
    _db = await Database.load(DB_URL);
  }
  return _db;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<Settings> {
  const db = await getDb();
  const rows = await db.select<Settings[]>('SELECT * FROM settings WHERE id = 1');
  return rows[0];
}

export async function saveSettings(s: Omit<Settings, 'id'>): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE settings SET
       pay_period_cadence    = $1,
       days_per_year         = $2,
       accrual_start_date    = $3,
       opening_balance       = $4,
       max_balance_days      = $5,
       hours_per_day         = $6,
       carryover_limit_hours = $7
     WHERE id = 1`,
    [
      s.pay_period_cadence,
      s.days_per_year,
      s.accrual_start_date,
      s.opening_balance,
      s.max_balance_days ?? null,
      s.hours_per_day,
      s.carryover_limit_hours ?? null,
    ],
  );
}

// ─── Time-off entries ─────────────────────────────────────────────────────────

export async function getEntries(): Promise<TimeOffEntry[]> {
  const db = await getDb();
  return db.select<TimeOffEntry[]>(
    'SELECT * FROM time_off_entries ORDER BY start_date ASC',
  );
}

export async function addEntry(e: Omit<TimeOffEntry, 'created_at'>): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO time_off_entries (id, entry_type, start_date, end_date, days, status, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [e.id, e.entry_type, e.start_date, e.end_date, e.days, e.status, e.notes ?? null],
  );
}

export async function updateEntry(e: Omit<TimeOffEntry, 'created_at'>): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE time_off_entries
     SET entry_type = $1, start_date = $2, end_date = $3,
         days = $4, status = $5, notes = $6
     WHERE id = $7`,
    [e.entry_type, e.start_date, e.end_date, e.days, e.status, e.notes ?? null, e.id],
  );
}

export async function deleteEntry(id: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM time_off_entries WHERE id = $1', [id]);
}

// ─── Holidays ─────────────────────────────────────────────────────────────────

type HolidayRow = Omit<Holiday, 'is_company_holiday'> & { is_company_holiday: number };

export async function getHolidays(): Promise<Holiday[]> {
  const db = await getDb();
  const rows = await db.select<HolidayRow[]>('SELECT * FROM holidays ORDER BY date ASC');
  // SQLite stores booleans as integers; coerce to boolean
  return rows.map((r) => ({ ...r, is_company_holiday: Boolean(r.is_company_holiday) }));
}

export async function addHoliday(h: Holiday): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT OR REPLACE INTO holidays (id, name, date, is_company_holiday)
     VALUES ($1, $2, $3, $4)`,
    [h.id, h.name, h.date, h.is_company_holiday ? 1 : 0],
  );
}

export async function addHolidayBatch(holidays: Holiday[]): Promise<void> {
  const db = await getDb();
  for (const h of holidays) {
    await db.execute(
      `INSERT OR REPLACE INTO holidays (id, name, date, is_company_holiday)
       VALUES ($1, $2, $3, $4)`,
      [h.id, h.name, h.date, h.is_company_holiday ? 1 : 0],
    );
  }
}

export async function deleteHoliday(id: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM holidays WHERE id = $1', [id]);
}
