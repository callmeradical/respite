import { useState, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import type { TimeOffEntry, Holiday } from '../lib/types';
import './ExportModal.css';

interface Props {
  entries: TimeOffEntry[];
  holidays: Holiday[];
  exporting: boolean;
  onExport: (selectedEntries: TimeOffEntry[], selectedHolidays: Holiday[]) => void;
  onClose: () => void;
}

export default function ExportModal({ entries, holidays, exporting, onExport, onClose }: Props) {
  const scheduled = useMemo(
    () => entries
      .filter(e => e.entry_type === 'pto' && e.status === 'scheduled')
      .sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [entries],
  );

  const taken = useMemo(
    () => entries
      .filter(e => e.entry_type === 'pto' && e.status === 'taken')
      .sort((a, b) => b.start_date.localeCompare(a.start_date)),
    [entries],
  );

  const sortedHolidays = useMemo(
    () => [...holidays].sort((a, b) => a.date.localeCompare(b.date)),
    [holidays],
  );

  // Selected PTO entry IDs — scheduled checked by default, taken unchecked
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(
    () => new Set(scheduled.map(e => e.id)),
  );

  // Selected holiday IDs — all checked by default
  const [selectedHolidays, setSelectedHolidays] = useState<Set<string>>(
    () => new Set(sortedHolidays.map(h => h.id)),
  );

  function toggleEntry(id: string) {
    setSelectedEntries(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectEntryGroup(group: TimeOffEntry[], on: boolean) {
    setSelectedEntries(prev => {
      const next = new Set(prev);
      group.forEach(e => on ? next.add(e.id) : next.delete(e.id));
      return next;
    });
  }

  function toggleHoliday(id: string) {
    setSelectedHolidays(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAllHolidays(on: boolean) {
    setSelectedHolidays(on ? new Set(sortedHolidays.map(h => h.id)) : new Set());
  }

  const selectedEntryList  = entries.filter(e => selectedEntries.has(e.id));
  const selectedHolidayList = sortedHolidays.filter(h => selectedHolidays.has(h.id));
  const totalCount = selectedEntryList.length + selectedHolidayList.length;

  const hasPTO      = scheduled.length + taken.length > 0;
  const hasHolidays = sortedHolidays.length > 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="export-modal" onClick={e => e.stopPropagation()}>

        <div className="modal-header">
          <h2>Export calendar</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">&#10005;</button>
        </div>

        <div className="em-body">
          {!hasPTO && !hasHolidays ? (
            <p className="em-empty">No events to export.</p>
          ) : (
            <>
              {/* Scheduled PTO */}
              {scheduled.length > 0 && (
                <section className="em-section">
                  <div className="em-section-head">
                    <span className="em-label">Scheduled PTO</span>
                    <div className="em-select-links">
                      <button className="link-btn" onClick={() => selectEntryGroup(scheduled, true)}>All</button>
                      <span className="em-sep">·</span>
                      <button className="link-btn" onClick={() => selectEntryGroup(scheduled, false)}>None</button>
                    </div>
                  </div>
                  {scheduled.map(entry => (
                    <EntryRow key={entry.id} entry={entry} checked={selectedEntries.has(entry.id)} onChange={() => toggleEntry(entry.id)} />
                  ))}
                </section>
              )}

              {/* Taken PTO */}
              {taken.length > 0 && (
                <section className="em-section">
                  <div className="em-section-head">
                    <span className="em-label">Taken PTO</span>
                    <div className="em-select-links">
                      <button className="link-btn" onClick={() => selectEntryGroup(taken, true)}>All</button>
                      <span className="em-sep">·</span>
                      <button className="link-btn" onClick={() => selectEntryGroup(taken, false)}>None</button>
                    </div>
                  </div>
                  {taken.map(entry => (
                    <EntryRow key={entry.id} entry={entry} checked={selectedEntries.has(entry.id)} onChange={() => toggleEntry(entry.id)} />
                  ))}
                </section>
              )}

              {/* Holidays */}
              {hasHolidays && (
                <section className="em-section">
                  <div className="em-section-head">
                    <span className="em-label">Holidays</span>
                    <div className="em-select-links">
                      <button className="link-btn" onClick={() => selectAllHolidays(true)}>All</button>
                      <span className="em-sep">·</span>
                      <button className="link-btn" onClick={() => selectAllHolidays(false)}>None</button>
                    </div>
                  </div>
                  {sortedHolidays.map(h => (
                    <HolidayRow key={h.id} holiday={h} checked={selectedHolidays.has(h.id)} onChange={() => toggleHoliday(h.id)} />
                  ))}
                </section>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            disabled={totalCount === 0 || exporting}
            onClick={() => onExport(selectedEntryList, selectedHolidayList)}
          >
            {exporting
              ? 'Exporting…'
              : totalCount === 0
              ? 'No events selected'
              : `Export ${totalCount} event${totalCount !== 1 ? 's' : ''}`}
          </button>
        </div>

      </div>
    </div>
  );
}

// ── Entry row ─────────────────────────────────────────────────────────────────

function EntryRow({ entry, checked, onChange }: { entry: TimeOffEntry; checked: boolean; onChange: () => void }) {
  const start   = parseISO(entry.start_date);
  const end     = parseISO(entry.end_date);
  const sameDay  = entry.start_date === entry.end_date;
  const sameYear = entry.start_date.slice(0, 4) === entry.end_date.slice(0, 4);

  const dateLabel = sameDay
    ? format(start, 'MMM d, yyyy')
    : sameYear
    ? `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
    : `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`;

  return (
    <label className="em-entry-row">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <div className="em-entry-info">
        <span className="em-entry-date">{dateLabel}</span>
        {entry.notes && <span className="em-entry-notes">{entry.notes}</span>}
      </div>
      <span className="em-entry-days">{entry.days} {entry.days === 1 ? 'day' : 'days'}</span>
    </label>
  );
}

// ── Holiday row ───────────────────────────────────────────────────────────────

function HolidayRow({ holiday, checked, onChange }: { holiday: Holiday; checked: boolean; onChange: () => void }) {
  return (
    <label className="em-entry-row">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <div className="em-entry-info">
        <span className="em-entry-date">{holiday.name}</span>
        <span className="em-entry-notes">{format(parseISO(holiday.date), 'MMM d, yyyy')}</span>
      </div>
      <span className="em-entry-days em-holiday-tag">holiday</span>
    </label>
  );
}
