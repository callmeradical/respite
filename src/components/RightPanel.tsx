import { format, parseISO } from 'date-fns';
import type { TimeOffEntry } from '../lib/types';
import './RightPanel.css';

interface Props {
  entries: TimeOffEntry[];
  onEntryClick: (entry: TimeOffEntry) => void;
}

export default function RightPanel({ entries, onEntryClick }: Props) {
  const todayIso = new Date().toISOString().slice(0, 10);

  const upcoming = entries
    .filter((e) => e.entry_type === 'pto' && e.status === 'scheduled' && e.end_date >= todayIso)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  const past = entries
    .filter((e) => e.entry_type === 'pto' && (e.status === 'taken' || e.end_date < todayIso))
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
    .slice(0, 10);

  // Days summary
  const upcomingDays = upcoming.reduce((s, e) => s + e.days, 0);

  return (
    <div className="right-panel">

      {/* ── Upcoming / scheduled ── */}
      <div className="rp-section">
        <div className="rp-section-head">
          <span className="rp-label">Scheduled PTO</span>
          {upcoming.length > 0 && (
            <span className="rp-badge">{upcoming.length}</span>
          )}
        </div>

        {upcoming.length === 0 ? (
          <div className="rp-empty">
            <p>No upcoming PTO</p>
            <p className="rp-empty-sub">Add time off from the sidebar</p>
          </div>
        ) : (
          <>
            <p className="rp-summary">{fmtDays(upcomingDays)} total</p>
            <div className="rp-list">
              {upcoming.map((entry) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  onClick={() => onEntryClick(entry)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Past / taken ── */}
      {past.length > 0 && (
        <>
          <div className="rp-divider" />
          <div className="rp-section">
            <div className="rp-section-head">
              <span className="rp-label">Past PTO</span>
            </div>
            <div className="rp-list">
              {past.map((entry) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  onClick={() => onEntryClick(entry)}
                />
              ))}
            </div>
          </div>
        </>
      )}

    </div>
  );
}

// ── Entry card ────────────────────────────────────────────────────────────────

function EntryCard({
  entry,
  onClick,
}: {
  entry: TimeOffEntry;
  onClick: () => void;
}) {
  const start = parseISO(entry.start_date);
  const end   = parseISO(entry.end_date);

  const sameDay  = entry.start_date === entry.end_date;
  const sameYear = entry.start_date.slice(0, 4) === entry.end_date.slice(0, 4);

  const dateLabel = sameDay
    ? format(start, 'MMM d, yyyy')
    : sameYear
    ? `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`
    : `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`;

  // How far away is the start?
  const todayIso  = new Date().toISOString().slice(0, 10);
  const daysAway  = daysBetween(todayIso, entry.start_date);
  const proximity = getProximityLabel(daysAway, entry.status);

  return (
    <button className="entry-card" onClick={onClick}>
      <div className="ec-date">{dateLabel}</div>

      <div className="ec-meta">
        <span className="ec-days">{fmtDays(entry.days)}</span>
        <span className={`ec-status ec-${entry.status}`}>
          {entry.status}
        </span>
        {proximity && (
          <span className="ec-proximity">{proximity}</span>
        )}
      </div>

      {entry.notes && (
        <div className="ec-notes">{entry.notes}</div>
      )}
    </button>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDays(n: number): string {
  const d = n % 1 === 0 ? String(n) : n.toFixed(1);
  return `${d} day${n !== 1 ? 's' : ''}`;
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24),
  );
}

function getProximityLabel(daysAway: number, status: string): string | null {
  if (status === 'taken') return null;
  if (daysAway < 0)   return 'past due';
  if (daysAway === 0) return 'today';
  if (daysAway === 1) return 'tomorrow';
  if (daysAway <= 7)  return `in ${daysAway}d`;
  if (daysAway <= 30) return `in ${Math.round(daysAway / 7)}w`;
  return null;
}
