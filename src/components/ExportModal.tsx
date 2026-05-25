import { useState, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import type { TimeOffEntry } from '../lib/types';
import './ExportModal.css';

interface Props {
  entries: TimeOffEntry[];
  exporting: boolean;
  onExport: (selected: TimeOffEntry[]) => void;
  onClose: () => void;
}

export default function ExportModal({ entries, exporting, onExport, onClose }: Props) {
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

  // Selected entry IDs — scheduled checked by default, taken unchecked
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(scheduled.map(e => e.id)),
  );

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectGroup(group: TimeOffEntry[], on: boolean) {
    setSelected(prev => {
      const next = new Set(prev);
      group.forEach(e => on ? next.add(e.id) : next.delete(e.id));
      return next;
    });
  }

  const selectedEntries = entries.filter(e => selected.has(e.id));
  const count = selectedEntries.length;

  const hasPTO = scheduled.length + taken.length > 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="export-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <h2>Export PTO calendar</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">&#10005;</button>
        </div>

        {/* Body */}
        <div className="em-body">
          {!hasPTO ? (
            <p className="em-empty">No PTO entries to export.</p>
          ) : (
            <>
              {/* Scheduled section */}
              {scheduled.length > 0 && (
                <section className="em-section">
                  <div className="em-section-head">
                    <span className="em-label">Scheduled</span>
                    <div className="em-select-links">
                      <button className="link-btn" onClick={() => selectGroup(scheduled, true)}>
                        All
                      </button>
                      <span className="em-sep">·</span>
                      <button className="link-btn" onClick={() => selectGroup(scheduled, false)}>
                        None
                      </button>
                    </div>
                  </div>
                  {scheduled.map(entry => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      checked={selected.has(entry.id)}
                      onChange={() => toggle(entry.id)}
                    />
                  ))}
                </section>
              )}

              {/* Taken section */}
              {taken.length > 0 && (
                <section className="em-section">
                  <div className="em-section-head">
                    <span className="em-label">Taken</span>
                    <div className="em-select-links">
                      <button className="link-btn" onClick={() => selectGroup(taken, true)}>
                        All
                      </button>
                      <span className="em-sep">·</span>
                      <button className="link-btn" onClick={() => selectGroup(taken, false)}>
                        None
                      </button>
                    </div>
                  </div>
                  {taken.map(entry => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      checked={selected.has(entry.id)}
                      onChange={() => toggle(entry.id)}
                    />
                  ))}
                </section>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            disabled={count === 0 || exporting}
            onClick={() => onExport(selectedEntries)}
          >
            {exporting
              ? 'Exporting…'
              : count === 0
              ? 'No events selected'
              : `Export ${count} event${count !== 1 ? 's' : ''}`}
          </button>
        </div>

      </div>
    </div>
  );
}

// ── Entry row ─────────────────────────────────────────────────────────────────

function EntryRow({
  entry,
  checked,
  onChange,
}: {
  entry: TimeOffEntry;
  checked: boolean;
  onChange: () => void;
}) {
  const start = parseISO(entry.start_date);
  const end   = parseISO(entry.end_date);
  const sameDay  = entry.start_date === entry.end_date;
  const sameYear = entry.start_date.slice(0, 4) === entry.end_date.slice(0, 4);

  const dateLabel = sameDay
    ? format(start, 'MMM d, yyyy')
    : sameYear
    ? `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
    : `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`;

  const dayWord = entry.days === 1 ? 'day' : 'days';

  return (
    <label className="em-entry-row">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
      />
      <div className="em-entry-info">
        <span className="em-entry-date">{dateLabel}</span>
        {entry.notes && (
          <span className="em-entry-notes">{entry.notes}</span>
        )}
      </div>
      <span className="em-entry-days">{entry.days} {dayWord}</span>
    </label>
  );
}
