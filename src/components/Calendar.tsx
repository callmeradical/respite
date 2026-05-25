import { useState } from 'react';
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isSameDay,
  parseISO,
  format,
  getDay,
} from 'date-fns';
import type { TimeOffEntry, Holiday } from '../lib/types';
import { toIso } from '../lib/accrual';
import './Calendar.css';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface DayMeta {
  date: Date;
  iso: string;
  inMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  ptoEntries: TimeOffEntry[];
  holiday: Holiday | undefined;
}

interface Props {
  entries: TimeOffEntry[];
  holidays: Holiday[];
  onDayClick: (iso: string) => void;
  onEntryClick: (entry: TimeOffEntry) => void;
  onHolidayClick: (holiday: Holiday) => void;
}

export default function CalendarView({
  entries,
  holidays,
  onDayClick,
  onEntryClick,
  onHolidayClick,
}: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [viewDate, setViewDate] = useState(startOfMonth(today));

  // ── Build lookup maps ──

  const holidayByDate = new Map<string, Holiday>(holidays.map((h) => [h.date, h]));

  // Expand each PTO entry across all dates in its range
  const entryByDate = new Map<string, TimeOffEntry[]>();
  for (const entry of entries) {
    if (entry.entry_type !== 'pto') continue;
    let cur = parseISO(entry.start_date);
    const end = parseISO(entry.end_date);
    while (cur <= end) {
      const iso = toIso(cur);
      if (!entryByDate.has(iso)) entryByDate.set(iso, []);
      entryByDate.get(iso)!.push(entry);
      cur = addDays(cur, 1);
    }
  }

  // ── Build calendar grid ──

  const calStart = startOfWeek(startOfMonth(viewDate), { weekStartsOn: 0 });
  const calEnd = endOfWeek(endOfMonth(viewDate), { weekStartsOn: 0 });

  const days: DayMeta[] = [];
  let cur = calStart;
  while (cur <= calEnd) {
    const iso = toIso(cur);
    days.push({
      date: new Date(cur),
      iso,
      inMonth: isSameMonth(cur, viewDate),
      isToday: isSameDay(cur, today),
      isWeekend: getDay(cur) === 0 || getDay(cur) === 6,
      ptoEntries: entryByDate.get(iso) ?? [],
      holiday: holidayByDate.get(iso),
    });
    cur = addDays(cur, 1);
  }

  return (
    <div className="calendar">
      {/* ── Navigation ── */}
      <div className="cal-nav">
        <button
          className="cal-nav-btn"
          onClick={() => setViewDate((d) => subMonths(d, 1))}
          aria-label="Previous month"
        >
          &#8249;
        </button>
        <span className="cal-month-label">{format(viewDate, 'MMMM yyyy')}</span>
        <button
          className="cal-nav-btn"
          onClick={() => setViewDate((d) => addMonths(d, 1))}
          aria-label="Next month"
        >
          &#8250;
        </button>
        <button
          className="cal-today-btn"
          onClick={() => setViewDate(startOfMonth(today))}
        >
          Today
        </button>
      </div>

      {/* ── Grid outer — flex column so headers are fixed and weeks stretch ── */}
      <div className="cal-grid-outer">

        {/* Fixed-height day-name header row */}
        <div className="cal-headers">
          {DAY_NAMES.map((d) => (
            <div key={d} className="cal-day-header">{d}</div>
          ))}
        </div>

        {/* Week rows — grid-auto-rows: 1fr makes every row equal height,
            filling exactly the remaining vertical space */}
        <div className="cal-weeks">
          {days.map((day) => (
            <DayCell
              key={day.iso}
              day={day}
              onDayClick={onDayClick}
              onEntryClick={onEntryClick}
              onHolidayClick={onHolidayClick}
            />
          ))}
        </div>

      </div>
    </div>
  );
}

// ─── Day cell ─────────────────────────────────────────────────────────────────

function DayCell({
  day,
  onDayClick,
  onEntryClick,
  onHolidayClick,
}: {
  day: DayMeta;
  onDayClick: (iso: string) => void;
  onEntryClick: (e: TimeOffEntry) => void;
  onHolidayClick: (h: Holiday) => void;
}) {
  const classes = [
    'cal-day',
    !day.inMonth && 'out-of-month',
    day.isToday && 'today',
    day.isWeekend && 'weekend',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} onClick={() => onDayClick(day.iso)}>
      <span className={`day-num${day.isToday ? ' today-badge' : ''}`}>
        {day.date.getDate()}
      </span>

      {/* Holiday */}
      {day.holiday && (
        <div
          className="day-pill holiday-pill"
          title={day.holiday.name}
          onClick={(e) => {
            e.stopPropagation();
            onHolidayClick(day.holiday!);
          }}
        >
          {day.holiday.name.length > 13
            ? `${day.holiday.name.slice(0, 12)}…`
            : day.holiday.name}
        </div>
      )}

      {/* PTO entries (max 2 visible) */}
      {day.ptoEntries.slice(0, 2).map((entry) => (
        <div
          key={entry.id}
          className={`day-pill pto-pill pto-${entry.status}`}
          title={`${entry.days}d ${entry.status}${entry.notes ? ` · ${entry.notes}` : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onEntryClick(entry);
          }}
        >
          {entry.status === 'taken' ? 'Taken' : 'Sched.'} {entry.days}d
        </div>
      ))}

      {day.ptoEntries.length > 2 && (
        <div className="day-pill more-pill">+{day.ptoEntries.length - 2} more</div>
      )}
    </div>
  );
}
