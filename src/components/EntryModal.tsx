import { useState, useEffect, useMemo } from 'react';
import { parseISO, format } from 'date-fns';
import type { TimeOffEntry, Holiday, Settings, EntryType, EntryStatus } from '../lib/types';
import { addEntry, updateEntry, deleteEntry, addHoliday, deleteHoliday } from '../lib/db';
import { countWorkingDays, projectedBalanceAt, toIso } from '../lib/accrual';
import { computeWindowEfficiency } from '../lib/optimizer';
import './EntryModal.css';

type Mode = 'entry' | 'holiday';

interface Props {
  /** Pre-fill the start date (from calendar click or optimizer) */
  defaultDate?: string;
  /** Pre-fill the end date (from optimizer recommendation) */
  defaultEndDate?: string;
  /** Entry to edit (null = create new) */
  editEntry?: TimeOffEntry | null;
  /** Holiday to edit (null = create new) */
  editHoliday?: Holiday | null;
  /** Default modal mode */
  defaultMode?: Mode;
  holidays: Holiday[];
  /** Needed for projected-balance validation */
  settings: Settings;
  /** All existing entries — used to compute committed PTO before the new event */
  entries: TimeOffEntry[];
  onSaved: () => void;
  onClose: () => void;
}

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

export default function EntryModal({
  defaultDate,
  defaultEndDate,
  editEntry,
  editHoliday,
  defaultMode = 'entry',
  holidays,
  settings,
  entries,
  onSaved,
  onClose,
}: Props) {
  const isEditEntry = !!editEntry;
  const isEditHoliday = !!editHoliday;

  const [mode, setMode] = useState<Mode>(
    isEditHoliday ? 'holiday' : defaultMode,
  );

  // ── PTO entry form state ──
  const [entryType] = useState<EntryType>(editEntry?.entry_type ?? 'pto');
  const [startDate, setStartDate] = useState(
    editEntry?.start_date ?? defaultDate ?? toIso(new Date()),
  );
  const [endDate, setEndDate] = useState(
    editEntry?.end_date ?? defaultEndDate ?? defaultDate ?? toIso(new Date()),
  );
  const [status, setStatus] = useState<EntryStatus>(editEntry?.status ?? 'scheduled');
  const [notes, setNotes] = useState(editEntry?.notes ?? '');
  const [days, setDays] = useState<number>(editEntry?.days ?? 1);
  const [daysManual, setDaysManual] = useState(false);

  // ── Holiday form state ──
  const [holidayName, setHolidayName] = useState(editHoliday?.name ?? '');
  const [holidayDate, setHolidayDate] = useState(
    editHoliday?.date ?? defaultDate ?? toIso(new Date()),
  );
  const [isCompany, setIsCompany] = useState(editHoliday?.is_company_holiday ?? true);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Balance validation (PTO entries only) ──────────────────────────────────
  const balanceAtStart = useMemo(() => {
    if (mode !== 'entry' || !startDate) return null;
    try {
      return projectedBalanceAt(
        parseISO(startDate),
        settings,
        entries,
        editEntry?.id, // exclude the entry being edited from committed totals
      );
    } catch {
      return null;
    }
  }, [mode, startDate, settings, entries, editEntry?.id]);

  const insufficient = balanceAtStart !== null && days > balanceAtStart;
  const startDateLabel = startDate
    ? format(parseISO(startDate), 'MMM d')
    : '';

  // Live efficiency grade — only for PTO entries with valid dates and days
  const efficiency = useMemo(() => {
    if (mode !== 'entry' || entryType !== 'pto') return null;
    if (!startDate || !endDate || days <= 0) return null;
    return computeWindowEfficiency(startDate, endDate, days, holidays);
  }, [mode, entryType, startDate, endDate, days, holidays]);

  // Auto-calculate working days when dates change (unless user overrode)
  useEffect(() => {
    if (daysManual) return;
    if (!startDate || !endDate) return;
    const s = parseISO(startDate);
    const e = parseISO(endDate);
    if (s > e) return;
    const wd = countWorkingDays(s, e, holidays);
    setDays(wd);
  }, [startDate, endDate, holidays, daysManual]);

  // Ensure endDate >= startDate
  useEffect(() => {
    if (startDate && endDate && endDate < startDate) {
      setEndDate(startDate);
    }
  }, [startDate]);

  // ── Handlers ──

  async function handleSaveEntry() {
    setSaving(true);
    setError(null);
    try {
      const entry: Omit<TimeOffEntry, 'created_at'> = {
        id: editEntry?.id ?? crypto.randomUUID(),
        entry_type: entryType,
        start_date: startDate,
        end_date: endDate,
        days,
        status,
        notes: notes || null,
      };
      if (isEditEntry) {
        await updateEntry(entry);
      } else {
        await addEntry(entry);
      }
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteEntry() {
    if (!editEntry) return;
    setDeleting(true);
    try {
      await deleteEntry(editEntry.id);
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setDeleting(false);
    }
  }

  async function handleSaveHoliday() {
    setSaving(true);
    setError(null);
    try {
      await addHoliday({
        id: editHoliday?.id ?? crypto.randomUUID(),
        name: holidayName,
        date: holidayDate,
        is_company_holiday: isCompany,
      });
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteHoliday() {
    if (!editHoliday) return;
    setDeleting(true);
    try {
      await deleteHoliday(editHoliday.id);
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setDeleting(false);
    }
  }

  // ── Render ──

  const canSwitchMode = !isEditEntry && !isEditHoliday;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="entry-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          {canSwitchMode ? (
            <div className="mode-tabs">
              <button
                className={`mode-tab ${mode === 'entry' ? 'active' : ''}`}
                onClick={() => setMode('entry')}
              >
                Time off
              </button>
              <button
                className={`mode-tab ${mode === 'holiday' ? 'active' : ''}`}
                onClick={() => setMode('holiday')}
              >
                Holiday
              </button>
            </div>
          ) : (
            <h2>{isEditHoliday ? 'Edit holiday' : 'Edit time off'}</h2>
          )}
          <button className="icon-btn" onClick={onClose} aria-label="Close">&#10005;</button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {mode === 'entry' ? (
            <>
              {/* Start / end date */}
              <div className="date-row">
                <div className="field-group">
                  <label htmlFor="sd">Start date</label>
                  <input
                    id="sd"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="field-group">
                  <label htmlFor="ed">End date</label>
                  <input
                    id="ed"
                    type="date"
                    value={endDate}
                    min={startDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Days */}
              <div className="field-group">
                <label htmlFor="dys">
                  Days used
                  {!daysManual && (
                    <span className="hint"> (auto-calculated, Mon–Fri excl. holidays)</span>
                  )}
                </label>
                <div className="input-hint-row">
                  <input
                    id="dys"
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={days}
                    onChange={(e) => {
                      setDays(parseFloat(e.target.value) || 0);
                      setDaysManual(true);
                    }}
                    style={{ width: 100 }}
                  />
                  {daysManual && (
                    <button
                      className="link-btn"
                      onClick={() => setDaysManual(false)}
                    >
                      Reset to auto
                    </button>
                  )}
                </div>
              </div>

              {/* Balance check */}
              {balanceAtStart !== null && (
                <div className={`balance-check ${insufficient ? 'balance-check-over' : 'balance-check-ok'}`}>
                  {insufficient ? (
                    <>
                      <span className="bc-icon">⚠</span>
                      <span className="bc-text">
                        Only <strong>{fmt(balanceAtStart)}d</strong> available on {startDateLabel} —
                        this entry needs <strong>{fmt(days)}d</strong>.
                        You cannot schedule more PTO than you will have accrued.
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="bc-icon">✓</span>
                      <span className="bc-text">
                        <strong>{fmt(balanceAtStart)}d</strong> available on {startDateLabel}
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Efficiency preview */}
              {efficiency && (
                <div className={`efficiency-preview eff-preview-${efficiency.tier}`}>
                  <span className={`eff-multiplier eff-${efficiency.tier}`}>
                    {efficiency.efficiency.toFixed(1)}×
                  </span>
                  <span className="eff-preview-text">
                    {efficiency.totalDays} consecutive days off
                    {efficiency.totalDays > days + Math.ceil(days / 5) * 2
                      ? ' — great use of surrounding free days'
                      : efficiency.tier === 'fair'
                      ? ' — no adjacent weekends or holidays'
                      : ''}
                  </span>
                </div>
              )}

              {/* Status */}
              <div className="field-group">
                <label>Status</label>
                <div className="radio-row">
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="status"
                      value="scheduled"
                      checked={status === 'scheduled'}
                      onChange={() => setStatus('scheduled')}
                    />
                    Scheduled
                  </label>
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="status"
                      value="taken"
                      checked={status === 'taken'}
                      onChange={() => setStatus('taken')}
                    />
                    Taken
                  </label>
                </div>
              </div>

              {/* Notes */}
              <div className="field-group">
                <label htmlFor="nts">Notes (optional)</label>
                <textarea
                  id="nts"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Family vacation, doctor appointment…"
                />
              </div>
            </>
          ) : (
            <>
              {/* Holiday name */}
              <div className="field-group">
                <label htmlFor="hn">Holiday name</label>
                <input
                  id="hn"
                  type="text"
                  value={holidayName}
                  onChange={(e) => setHolidayName(e.target.value)}
                  placeholder="e.g. Thanksgiving"
                />
              </div>

              {/* Holiday date */}
              <div className="field-group">
                <label htmlFor="hd">Date</label>
                <input
                  id="hd"
                  type="date"
                  value={holidayDate}
                  onChange={(e) => setHolidayDate(e.target.value)}
                />
              </div>

              {/* Company holiday toggle */}
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={isCompany}
                  onChange={(e) => setIsCompany(e.target.checked)}
                />
                Company / observed holiday
              </label>
            </>
          )}
        </div>

        {error && <p className="error-msg">{error}</p>}

        {/* Footer */}
        <div className="modal-footer">
          <div>
            {isEditEntry && (
              <button className="btn-danger" onClick={handleDeleteEntry} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            )}
            {isEditHoliday && (
              <button className="btn-danger" onClick={handleDeleteHoliday} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            )}
          </div>
          <div className="footer-actions">
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary"
              onClick={mode === 'entry' ? handleSaveEntry : handleSaveHoliday}
              disabled={saving || (mode === 'holiday' && !holidayName) || insufficient}
              title={insufficient ? 'Insufficient PTO balance on the selected date' : undefined}
            >
              {saving ? 'Saving…' : isEditEntry || isEditHoliday ? 'Save changes' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
