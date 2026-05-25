import type { AccrualSummary, Settings } from '../lib/types';
import './LeftPanel.css';

interface Props {
  summary: AccrualSummary;
  settings: Settings;
  onAddEntry: () => void;
  onImportHolidays: () => void;
  onExportICS: () => void;
  exporting: boolean;
  onOpenSettings: () => void;
}

export default function LeftPanel({
  summary,
  settings,
  onAddEntry,
  onImportHolidays,
  onExportICS,
  exporting,
  onOpenSettings,
}: Props) {
  const {
    totalAccrued, openingBalance, totalTaken, totalScheduled,
    remaining, periodsElapsed, ratePerPeriod,
  } = summary;

  const hpd           = settings.hours_per_day ?? 8;
  const carryoverDays = settings.carryover_limit_hours != null
    ? settings.carryover_limit_hours / hpd : null;
  const isOver        = carryoverDays != null && remaining > carryoverDays;

  const total              = openingBalance + totalAccrued;
  const takenFrac          = total > 0 ? Math.min(totalTaken              / total, 1) : 0;
  const scheduledFrac      = total > 0 ? Math.min(totalScheduled          / total, 1 - takenFrac) : 0;

  return (
    <div className="left-panel">

      {/* ── Balance ──────────────────────────────────────────────────── */}
      <div className="lp-section">
        <span className="lp-label">Balance</span>

        {/* Remaining — the headline number */}
        <div className={`remaining-card ${isOver ? 'remaining-over' : 'remaining-ok'}`}>
          <div className="remaining-row">
            <span className="remaining-days">
              {fmt(remaining)}
              <span className="remaining-unit">d</span>
            </span>
            <span className="remaining-hrs">{fmt(remaining * hpd)} hrs</span>
          </div>

          {carryoverDays != null && (
            <span className={`co-badge ${isOver ? 'co-over' : 'co-ok'}`}>
              {isOver
                ? `▲ ${fmt((remaining - carryoverDays) * hpd)} hrs over`
                : `✓ ≤ ${settings.carryover_limit_hours} hr limit`}
            </span>
          )}
        </div>

        {/* Mini stats */}
        <div className="mini-stats">
          <MiniStat label="Accrued"  value={fmt(totalAccrued)}   color="blue"  />
          <MiniStat label="Taken"    value={fmt(totalTaken)}     color="green" />
          <MiniStat label="Sched."   value={fmt(totalScheduled)} color="teal"  />
        </div>

        {/* Progress bar */}
        <div className="lp-progress-track">
          <div className="lp-progress-taken" style={{ width: `${takenFrac * 100}%` }} />
          <div className="lp-progress-sched" style={{ width: `${scheduledFrac * 100}%` }} />
        </div>

        <p className="lp-hint">
          +{fmt(ratePerPeriod)}d / period &middot; {periodsElapsed} periods elapsed
        </p>
      </div>

      <div className="lp-divider" />

      {/* ── Actions ──────────────────────────────────────────────────── */}
      <div className="lp-section">
        <span className="lp-label">Actions</span>

        <button className="lp-action" onClick={onAddEntry}>
          <AddIcon /> Add time off
        </button>
        <button className="lp-action" onClick={onImportHolidays}>
          <ImportIcon /> Import holidays
        </button>
        <button className="lp-action" onClick={onExportICS} disabled={exporting}>
          <ExportIcon /> {exporting ? 'Exporting…' : 'Export .ics'}
        </button>
      </div>

      {/* ── Spacer + legend ──────────────────────────────────────────── */}
      <div className="lp-spacer" />

      <div className="lp-legend">
        <span className="lp-leg-item"><span className="lp-dot dot-taken"    /> Taken</span>
        <span className="lp-leg-item"><span className="lp-dot dot-scheduled" /> Scheduled</span>
        <span className="lp-leg-item"><span className="lp-dot dot-holiday"   /> Holiday</span>
      </div>

      <div className="lp-divider" />

      {/* ── Settings ─────────────────────────────────────────────────── */}
      <div className="lp-footer">
        <button className="lp-settings-btn" onClick={onOpenSettings}>
          <GearIcon /> Settings
        </button>
      </div>

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="mini-stat">
      <span className={`mini-val mini-${color}`}>{value}d</span>
      <span className="mini-label">{label}</span>
    </div>
  );
}

// ── Icon helpers (inline SVG, no dependency) ──────────────────────────────────

function AddIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="6.5" y1="2" x2="6.5" y2="11" />
      <line x1="2"   y1="6.5" x2="11" y2="6.5" />
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,8 6.5,12 11,8" />
      <line x1="6.5" y1="1" x2="6.5" y2="12" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,5 6.5,1 11,5" />
      <line x1="6.5" y1="1" x2="6.5" y2="10" />
      <line x1="1" y1="12" x2="12" y2="12" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}
