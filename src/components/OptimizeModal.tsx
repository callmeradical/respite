import { useState, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import type { TimeOffEntry, Holiday, Settings, AccrualSummary } from '../lib/types';
import {
  generateRecommendations,
  buildBalanceProjection,
  buildYearEndWarning,
  buildSpreadAdvice,
} from '../lib/optimizer';
import type {
  Recommendation,
  RecommendationCategory,
  ProjectionPoint,
  YearEndWarning,
  SpreadAdvice,
} from '../lib/optimizer';
import './OptimizeModal.css';

type Tab = 'recommendations' | 'forecast';

const CATEGORIES: { key: RecommendationCategory; label: string; desc: string }[] = [
  { key: 'long-weekend', label: 'Long weekends', desc: '3–5 days · best ROI' },
  { key: 'full-week',    label: 'Full weeks',    desc: '5–9 days' },
  { key: 'extended',     label: 'Extended',      desc: '8–12 days' },
  { key: 'two-weeks',    label: 'Two weeks',     desc: '10–16 days' },
];

interface Props {
  settings: Settings;
  entries: TimeOffEntry[];
  holidays: Holiday[];
  summary: AccrualSummary;
  onSchedule: (start: string, end: string) => void;
  onClose: () => void;
}

export default function OptimizeModal({
  settings, entries, holidays, summary, onSchedule, onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>('recommendations');
  const [activeCat, setActiveCat] = useState<RecommendationCategory>('long-weekend');

  // ── Compute everything once ──
  const recs = useMemo(
    () => generateRecommendations(summary, settings, entries, holidays),
    [summary, settings, entries, holidays],
  );

  const projection = useMemo(
    () => buildBalanceProjection(settings, entries, summary.remaining),
    [settings, entries, summary.remaining],
  );

  const warning = useMemo(
    () => buildYearEndWarning(settings, entries, summary.remaining),
    [settings, entries, summary.remaining],
  );

  const spread = useMemo(
    () => buildSpreadAdvice(settings, summary.remaining),
    [settings, summary.remaining],
  );

  const activRecs = recs[activeCat] ?? [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="optimize-modal" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="opt-header">
          <div>
            <h2>Time off optimizer</h2>
            <span className="opt-balance-pill">
              {fmt(summary.remaining)} days available
            </span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">&#10005;</button>
        </div>

        {/* ── Tab bar ── */}
        <div className="opt-tabs">
          <button
            className={`opt-tab ${tab === 'recommendations' ? 'active' : ''}`}
            onClick={() => setTab('recommendations')}
          >
            Recommendations
          </button>
          <button
            className={`opt-tab ${tab === 'forecast' ? 'active' : ''}`}
            onClick={() => setTab('forecast')}
          >
            Balance forecast
          </button>
        </div>

        {/* ── Body ── */}
        <div className="opt-body">
          {tab === 'recommendations' ? (
            <RecommendationsTab
              recs={recs}
              activeCat={activeCat}
              onCatChange={setActiveCat}
              activRecs={activRecs}
              onSchedule={onSchedule}
              remaining={summary.remaining}
            />
          ) : (
            <ForecastTab
              projection={projection}
              warning={warning}
              spread={spread}
              settings={settings}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Recommendations tab ──────────────────────────────────────────────────────

function RecommendationsTab({
  recs, activeCat, onCatChange, activRecs, onSchedule, remaining,
}: {
  recs: Record<RecommendationCategory, Recommendation[]>;
  activeCat: RecommendationCategory;
  onCatChange: (c: RecommendationCategory) => void;
  activRecs: Recommendation[];
  onSchedule: (s: string, e: string) => void;
  remaining: number;
}) {
  return (
    <>
      {/* Category pills */}
      <div className="cat-pills">
        {CATEGORIES.map((c) => {
          const count = recs[c.key]?.length ?? 0;
          return (
            <button
              key={c.key}
              className={`cat-pill ${activeCat === c.key ? 'active' : ''}`}
              onClick={() => onCatChange(c.key)}
            >
              {c.label}
              <span className="cat-count">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Cards */}
      {activRecs.length === 0 ? (
        <div className="opt-empty">
          {remaining < 1
            ? 'No balance remaining to optimize.'
            : 'No opportunities found in this category for the next 12 months.'}
        </div>
      ) : (
        <div className="rec-list">
          {activRecs.map((rec) => (
            <RecommendationCard
              key={rec.id}
              rec={rec}
              onSchedule={onSchedule}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ─── Single recommendation card ───────────────────────────────────────────────

const DOW_ABBR = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function RecommendationCard({
  rec,
  onSchedule,
}: {
  rec: Recommendation;
  onSchedule: (s: string, e: string) => void;
}) {
  const startLabel = format(parseISO(rec.start), 'EEE, MMM d');
  const endLabel   = format(parseISO(rec.end),   'EEE, MMM d, yyyy');

  // Efficiency tier colouring
  const effClass =
    rec.efficiency >= 4 ? 'eff-great'
    : rec.efficiency >= 2.5 ? 'eff-good'
    : 'eff-ok';

  return (
    <div className="rec-card">
      {/* Card header */}
      <div className="rec-card-header">
        <div className="rec-dates">
          <span className="rec-range">{startLabel} – {endLabel}</span>
          {rec.anchors.length > 0 && (
            <span className="rec-anchors">{rec.anchors.join(' · ')}</span>
          )}
        </div>
        <div className={`rec-efficiency ${effClass}`}>
          {rec.efficiency.toFixed(1)}×
        </div>
      </div>

      {/* Stats row */}
      <div className="rec-stats">
        <span className="stat-chip chip-total">{rec.totalDays} days off</span>
        <span className="stat-chip chip-pto">{rec.ptoDays} PTO day{rec.ptoDays !== 1 ? 's' : ''}</span>
        <span className="stat-chip chip-free">{rec.freeDays} already free</span>
        {rec.yetToAccrue > 0 && (
          <span className="stat-chip chip-earn" title="Days you'll earn before this window starts">
            +{fmt(rec.yetToAccrue)}d to earn
          </span>
        )}
      </div>

      {/* Mini timeline */}
      <div className="rec-timeline">
        {rec.days.map((d) => {
          const cls = d.isHoliday
            ? 'tl-holiday'
            : d.isExistingPTO
            ? 'tl-existing'
            : d.isWeekend
            ? 'tl-weekend'
            : d.isNewPTO
            ? 'tl-new-pto'
            : 'tl-work';
          return (
            <div
              key={d.iso}
              className={`tl-cell ${cls}`}
              title={
                d.holidayName
                  ? d.holidayName
                  : d.isExistingPTO
                  ? 'Existing PTO'
                  : d.isWeekend
                  ? 'Weekend'
                  : d.isNewPTO
                  ? 'Take PTO'
                  : 'Workday'
              }
            >
              <span className="tl-dow">{DOW_ABBR[d.dow]}</span>
              <span className="tl-day">{parseInt(d.iso.slice(8), 10)}</span>
            </div>
          );
        })}
      </div>

      {/* Legend + action */}
      <div className="rec-footer">
        <div className="tl-legend">
          <span className="leg-dot tl-new-pto" /> PTO
          <span className="leg-dot tl-weekend" /> Weekend
          <span className="leg-dot tl-holiday" /> Holiday
          <span className="leg-dot tl-existing" /> Already booked
        </div>
        <button
          className="btn-primary btn-sm"
          onClick={() => onSchedule(rec.start, rec.end)}
        >
          + Schedule
        </button>
      </div>
    </div>
  );
}

// ─── Forecast tab ─────────────────────────────────────────────────────────────

function ForecastTab({
  projection,
  warning,
  spread,
  settings,
}: {
  projection: ProjectionPoint[];
  warning: YearEndWarning | null;
  spread: SpreadAdvice;
  settings: Settings;
}) {
  return (
    <div className="forecast-content">
      {/* Year-end warning */}
      {warning && (
        <div className={`warning-box ${warning.overCapDays > 0 ? 'warning-urgent' : 'warning-info'}`}>
          <div className="warning-icon">{warning.overCapDays > 0 ? '⚠' : 'ℹ'}</div>
          <div>
            <p className="warning-title">
              {warning.overCapDays > 0
                ? `${fmt(warning.overCapDays)} days at risk of being forfeited`
                : `${fmt(warning.projectedBalance)} days projected at year-end`}
            </p>
            <p className="warning-body">{warning.suggestion}</p>
          </div>
        </div>
      )}

      {/* Spread advice */}
      <div className="spread-card">
        <h3>Spread advice</h3>
        <div className="spread-stats">
          <div className="spread-stat">
            <span className="spread-val">{fmt(spread.totalAvailable)}</span>
            <span className="spread-label">Total available this year</span>
          </div>
          <div className="spread-stat">
            <span className="spread-val">{fmt(spread.idealPerMonth)}</span>
            <span className="spread-label">Ideal days / month</span>
          </div>
          <div className="spread-stat">
            <span className="spread-val">{fmt(spread.idealPerWeek)}</span>
            <span className="spread-label">Ideal days / week</span>
          </div>
          <div className="spread-stat">
            <span className="spread-val">{fmt(spread.monthsRemaining)}</span>
            <span className="spread-label">Months left in year</span>
          </div>
        </div>
      </div>

      {/* Balance chart */}
      <div className="chart-section">
        <h3>Projected balance — next 18 months</h3>
      <BalanceChart
        points={projection}
        cap={settings.max_balance_days ?? null}
        carryoverDays={
          settings.carryover_limit_hours != null && settings.hours_per_day > 0
            ? settings.carryover_limit_hours / settings.hours_per_day
            : null
        }
        carryoverHours={settings.carryover_limit_hours ?? null}
      />
        <div className="chart-legend">
          <span className="cl-swatch cl-balance" /> Projected balance
          <span className="cl-swatch cl-accrual" /> Accrual (no PTO)
          {settings.carryover_limit_hours != null && (
            <><span className="cl-swatch cl-cap" /> Carryover limit</>
          )}
          {settings.max_balance_days != null && (
            <><span className="cl-swatch cl-accrual-cap" /> Accrual cap</>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── SVG balance chart ────────────────────────────────────────────────────────

function BalanceChart({
  points,
  cap,
  carryoverDays,
  carryoverHours,
}: {
  points: ProjectionPoint[];
  cap: number | null;
  carryoverDays: number | null;
  carryoverHours: number | null;
}) {
  const W = 620, H = 200;
  const ML = 42, MR = 12, MT = 10, MB = 32;
  const cW = W - ML - MR;
  const cH = H - MT - MB;

  if (points.length < 2) return null;

  const maxVal = Math.max(
    ...points.map((p) => Math.max(p.accrued, p.balance)),
    cap ?? 0,
    carryoverDays ?? 0,
    1,
  );

  const xScale = (i: number) => ML + (i / (points.length - 1)) * cW;
  const yScale = (v: number) => MT + cH - (v / maxVal) * cH;

  const balancePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(i)},${yScale(p.balance)}`)
    .join(' ');

  const accrualPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(i)},${yScale(p.accrued)}`)
    .join(' ');

  // Area fill under balance line
  const areaPath =
    `M${xScale(0)},${MT + cH} ` +
    points.map((p, i) => `L${xScale(i)},${yScale(p.balance)}`).join(' ') +
    ` L${xScale(points.length - 1)},${MT + cH} Z`;

  // Y-axis grid lines
  const gridCount = 4;
  const gridLines = Array.from({ length: gridCount + 1 }, (_, i) => {
    const val = (maxVal / gridCount) * i;
    const y = yScale(val);
    return { y, label: val.toFixed(val % 1 === 0 ? 0 : 1) };
  });

  // Today marker (index 0)
  const todayX = xScale(0);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="balance-svg"
      aria-label="Balance projection chart"
    >
      <defs>
        <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {gridLines.map(({ y, label }) => (
        <g key={label}>
          <line x1={ML} y1={y} x2={W - MR} y2={y} stroke="#f0f0f0" strokeWidth="1" />
          <text x={ML - 4} y={y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">
            {label}
          </text>
        </g>
      ))}

      {/* X-axis labels — every 3 months */}
      {points
        .filter((_, i) => i % 3 === 0)
        .map((p, i) => (
          <text
            key={p.date}
            x={xScale(i * 3)}
            y={H - 6}
            textAnchor="middle"
            fontSize="10"
            fill="#9ca3af"
          >
            {p.label}
          </text>
        ))}

      {/* Carryover limit line */}
      {carryoverDays != null && (
        <g>
          <line
            x1={ML} y1={yScale(carryoverDays)}
            x2={W - MR} y2={yScale(carryoverDays)}
            stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4,3"
          />
          <text
            x={W - MR - 2} y={yScale(carryoverDays) - 3}
            textAnchor="end" fontSize="9" fill="#b45309"
          >
            {carryoverHours}h limit
          </text>
        </g>
      )}

      {/* Continuous accrual cap line */}
      {cap != null && (
        <line
          x1={ML}
          y1={yScale(cap)}
          x2={W - MR}
          y2={yScale(cap)}
          stroke="#ef4444"
          strokeWidth="1"
          strokeDasharray="3,3"
          opacity="0.6"
        />
      )}

      {/* Area fill */}
      <path d={areaPath} fill="url(#balGrad)" />

      {/* Accrual line (dashed gray) */}
      <path
        d={accrualPath}
        fill="none"
        stroke="#d1d5db"
        strokeWidth="1.5"
        strokeDasharray="4,3"
      />

      {/* Balance line */}
      <path d={balancePath} fill="none" stroke="#3b82f6" strokeWidth="2" />

      {/* Today marker */}
      <line
        x1={todayX}
        y1={MT}
        x2={todayX}
        y2={MT + cH}
        stroke="#2563eb"
        strokeWidth="1"
        strokeDasharray="3,2"
        opacity="0.5"
      />
      <text x={todayX + 3} y={MT + 10} fontSize="9" fill="#2563eb" opacity="0.7">
        Today
      </text>
    </svg>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}
