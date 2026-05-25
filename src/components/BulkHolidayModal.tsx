import { useState, useMemo, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import type { Holiday } from '../lib/types';
import { addHolidayBatch } from '../lib/db';
import { usFederalHolidays, parseHolidayText } from '../lib/federalHolidays';
import './BulkHolidayModal.css';

type Tab = 'federal' | 'paste';

interface Props {
  existingHolidays: Holiday[];
  onSaved: () => void;
  onClose: () => void;
}

export default function BulkHolidayModal({ existingHolidays, onSaved, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('federal');

  // ── Federal tab state ──────────────────────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const federalList = useMemo(() => usFederalHolidays(year), [year]);
  const existingDates = useMemo(
    () => new Set(existingHolidays.map((h) => h.date)),
    [existingHolidays],
  );

  // checked = keys that are selected for import (excludes already-added)
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());

  // When year changes, pre-select all holidays NOT already in DB
  useEffect(() => {
    setCheckedKeys(
      new Set(federalList.filter((h) => !existingDates.has(h.date)).map((h) => h.key)),
    );
  }, [federalList, existingDates]);

  function toggleKey(key: string) {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function selectAll() {
    setCheckedKeys(
      new Set(federalList.filter((h) => !existingDates.has(h.date)).map((h) => h.key)),
    );
  }

  function deselectAll() {
    setCheckedKeys(new Set());
  }

  // ── Paste tab state ────────────────────────────────────────────────────────
  const [pasteText, setPasteText] = useState('');

  const parseResult = useMemo(() => parseHolidayText(pasteText), [pasteText]);

  // Track which paste entries are checked (by index in valid[])
  const [pasteChecked, setPasteChecked] = useState<Set<number>>(new Set());

  // Auto-select all newly parsed valid entries
  useEffect(() => {
    setPasteChecked(
      new Set(
        parseResult.valid
          .map((_, i) => i)
          .filter((i) => !existingDates.has(parseResult.valid[i].date)),
      ),
    );
  }, [parseResult.valid, existingDates]);

  function togglePasteIdx(i: number) {
    setPasteChecked((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  // ── Import ─────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function buildBatch(): Holiday[] {
    if (tab === 'federal') {
      return federalList
        .filter((h) => checkedKeys.has(h.key))
        .map((h) => ({
          id: crypto.randomUUID(),
          name: h.name,
          date: h.date,
          is_company_holiday: true,
        }));
    } else {
      return [...pasteChecked].map((i) => ({
        id: crypto.randomUUID(),
        name: parseResult.valid[i].name,
        date: parseResult.valid[i].date,
        is_company_holiday: true,
      }));
    }
  }

  const batchCount = tab === 'federal' ? checkedKeys.size : pasteChecked.size;

  async function handleImport() {
    const batch = buildBatch();
    if (!batch.length) return;
    setSaving(true);
    setError(null);
    try {
      await addHolidayBatch(batch);
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="bulk-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <h2>Import holidays</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">&#10005;</button>
        </div>

        {/* Tabs */}
        <div className="bulk-tabs">
          <button
            className={`bulk-tab ${tab === 'federal' ? 'active' : ''}`}
            onClick={() => setTab('federal')}
          >
            US Federal holidays
          </button>
          <button
            className={`bulk-tab ${tab === 'paste' ? 'active' : ''}`}
            onClick={() => setTab('paste')}
          >
            Paste / CSV
          </button>
        </div>

        {/* Body */}
        <div className="bulk-body">
          {tab === 'federal' ? (
            <FederalTab
              year={year}
              setYear={setYear}
              federalList={federalList}
              existingDates={existingDates}
              checkedKeys={checkedKeys}
              onToggle={toggleKey}
              onSelectAll={selectAll}
              onDeselectAll={deselectAll}
            />
          ) : (
            <PasteTab
              text={pasteText}
              onTextChange={setPasteText}
              parseResult={parseResult}
              existingDates={existingDates}
              checkedIndices={pasteChecked}
              onToggle={togglePasteIdx}
            />
          )}
        </div>

        {error && <p className="error-msg">{error}</p>}

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={handleImport}
            disabled={saving || batchCount === 0}
          >
            {saving
              ? 'Importing…'
              : batchCount === 0
              ? 'No holidays selected'
              : `Import ${batchCount} holiday${batchCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Federal tab ──────────────────────────────────────────────────────────────

import type { FederalHoliday } from '../lib/federalHolidays';

interface FederalTabProps {
  year: number;
  setYear: (y: number) => void;
  federalList: FederalHoliday[];
  existingDates: Set<string>;
  checkedKeys: Set<string>;
  onToggle: (key: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

function FederalTab({
  year, setYear, federalList, existingDates, checkedKeys, onToggle, onSelectAll, onDeselectAll,
}: FederalTabProps) {
  const newCount = federalList.filter((h) => !existingDates.has(h.date)).length;

  return (
    <>
      {/* Year picker */}
      <div className="year-row">
        <label htmlFor="yr">Year</label>
        <div className="year-controls">
          <button className="year-step" onClick={() => setYear(year - 1)}>&#8249;</button>
          <input
            id="yr"
            type="number"
            value={year}
            min={2000}
            max={2099}
            onChange={(e) => setYear(parseInt(e.target.value, 10) || year)}
          />
          <button className="year-step" onClick={() => setYear(year + 1)}>&#8250;</button>
        </div>
        <div className="select-links">
          <button className="link-btn" onClick={onSelectAll} disabled={newCount === 0}>
            Select all new
          </button>
          <span className="divider">·</span>
          <button className="link-btn" onClick={onDeselectAll}>Deselect all</button>
        </div>
      </div>

      {/* Holiday checklist */}
      <ul className="holiday-list">
        {federalList.map((h) => {
          const alreadyAdded = existingDates.has(h.date);
          const checked = checkedKeys.has(h.key);
          return (
            <li key={h.key} className={`holiday-row ${alreadyAdded ? 'already-added' : ''}`}>
              <label className="holiday-check-label">
                <input
                  type="checkbox"
                  checked={alreadyAdded ? true : checked}
                  disabled={alreadyAdded}
                  onChange={() => onToggle(h.key)}
                />
                <span className="holiday-name">{h.name}</span>
              </label>
              <div className="holiday-dates">
                <span className="holiday-observed">
                  {formatDisplayDate(h.date)}
                </span>
                {h.actualDate && (
                  <span className="holiday-actual">
                    (actual: {formatDisplayDate(h.actualDate)})
                  </span>
                )}
                {alreadyAdded && <span className="badge-added">Already added</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ─── Paste tab ────────────────────────────────────────────────────────────────

import type { ParseResult } from '../lib/federalHolidays';

interface PasteTabProps {
  text: string;
  onTextChange: (t: string) => void;
  parseResult: ParseResult;
  existingDates: Set<string>;
  checkedIndices: Set<number>;
  onToggle: (i: number) => void;
}

function PasteTab({ text, onTextChange, parseResult, existingDates, checkedIndices, onToggle }: PasteTabProps) {
  return (
    <>
      <p className="paste-hint">
        One holiday per line. Date must be in <code>YYYY-MM-DD</code> format.
        Name can come before or after the date, separated by a comma, pipe, or space.
      </p>
      <div className="paste-examples">
        <code>2025-07-04 Independence Day</code>
        <code>Thanksgiving Day, 2025-11-27</code>
        <code>Christmas Day | 2025-12-25</code>
      </div>

      <textarea
        className="paste-area"
        rows={7}
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder={'2025-01-01 New Year\'s Day\n2025-07-04 Independence Day\n2025-12-25 Christmas Day'}
        spellCheck={false}
      />

      {/* Preview */}
      {(parseResult.valid.length > 0 || parseResult.invalid.length > 0) && (
        <div className="parse-preview">
          {parseResult.valid.length > 0 && (
            <>
              <p className="preview-heading">
                {parseResult.valid.length} holiday{parseResult.valid.length !== 1 ? 's' : ''} parsed
              </p>
              <ul className="holiday-list">
                {parseResult.valid.map((h, i) => {
                  const alreadyAdded = existingDates.has(h.date);
                  return (
                    <li key={i} className={`holiday-row ${alreadyAdded ? 'already-added' : ''}`}>
                      <label className="holiday-check-label">
                        <input
                          type="checkbox"
                          checked={alreadyAdded ? true : checkedIndices.has(i)}
                          disabled={alreadyAdded}
                          onChange={() => onToggle(i)}
                        />
                        <span className="holiday-name">{h.name}</span>
                      </label>
                      <div className="holiday-dates">
                        <span className="holiday-observed">{formatDisplayDate(h.date)}</span>
                        {alreadyAdded && <span className="badge-added">Already added</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {parseResult.invalid.length > 0 && (
            <>
              <p className="preview-heading error-heading">
                {parseResult.invalid.length} line{parseResult.invalid.length !== 1 ? 's' : ''} could not be parsed
              </p>
              <ul className="invalid-list">
                {parseResult.invalid.map((item, i) => (
                  <li key={i} className="invalid-row">
                    <code>{item.line || '(empty)'}</code>
                    <span className="invalid-reason">{item.reason}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDisplayDate(iso: string): string {
  try {
    return format(parseISO(iso), 'EEE, MMM d');
  } catch {
    return iso;
  }
}
