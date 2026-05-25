import type { AccrualSummary, Settings } from '../lib/types';
import './BalanceSummary.css';

interface Props {
  summary: AccrualSummary;
  settings: Settings;
}

export default function BalanceSummary({ summary, settings }: Props) {
  const { totalAccrued, openingBalance, totalTaken, totalScheduled, remaining, periodsElapsed, ratePerPeriod } = summary;
  const { days_per_year, pay_period_cadence, hours_per_day, carryover_limit_hours } = settings;

  const hpd = hours_per_day ?? 8;
  const total = openingBalance + totalAccrued;
  const usedOrScheduled = totalTaken + totalScheduled;

  const takenFraction     = total > 0 ? Math.min(totalTaken     / total, 1) : 0;
  const scheduledFraction = total > 0 ? Math.min(totalScheduled / total, 1 - takenFraction) : 0;

  const cadenceLabel = pay_period_cadence === 'biweekly' ? 'bi-weekly' : 'semi-monthly';

  // Carryover state — green = good (≤ limit, no PTO wasted), red = over limit
  const carryoverDays  = carryover_limit_hours != null ? carryover_limit_hours / hpd : null;
  const remainingHours = remaining * hpd;
  const carryoverHours = carryover_limit_hours;

  // null when no limit configured; 'safe' when within limit; 'over' when exceeding it
  const carryoverStatus: 'safe' | 'over' | null =
    carryoverDays == null ? null : remaining <= carryoverDays ? 'safe' : 'over';

  return (
    <div className="balance-bar">
      <div className="balance-tiles">

        <StatTile
          label="Accrued"
          value={fmt(totalAccrued)}
          sub={`+${fmt(ratePerPeriod)} / period`}
          color="#2563eb"
        />

        {openingBalance > 0 && (
          <StatTile
            label="Opening"
            value={fmt(openingBalance)}
            sub="carried in"
            color="#7c3aed"
          />
        )}

        <StatTile
          label="Taken"
          value={fmt(totalTaken)}
          sub="confirmed days off"
          color="#16a34a"
        />

        <StatTile
          label="Scheduled"
          value={fmt(totalScheduled)}
          sub="upcoming PTO"
          color="#0891b2"
        />

        {/* Remaining — green = within carryover limit (good), red = over limit (will forfeit) */}
        <div
          className={`stat-tile highlight ${
            remaining < 0         ? 'tile-danger'
            : carryoverStatus === 'over' ? 'tile-over'
            : ''                  /* default highlight is already green */
          }`}
        >
          <span
            className="stat-value"
            style={{ color: remaining < 0 ? '#dc2626' : carryoverStatus === 'over' ? '#b91c1c' : '#15803d' }}
          >
            {fmt(remaining)}
            <span className="stat-value-unit">d</span>
          </span>
          <span className="stat-label">Remaining</span>
          <span className="stat-sub">
            {fmt(remainingHours)} hrs
            {carryoverDays != null && (
              <span
                className={`carryover-badge carryover-${carryoverStatus}`}
                title={`Carryover limit: ${carryoverHours} hrs (${fmt(carryoverDays)} days)`}
              >
                {carryoverStatus === 'over'
                  ? `▲ ${fmt((remaining - carryoverDays) * hpd)} hrs over`
                  : `✓ ≤ ${carryoverHours} hr limit`}
              </span>
            )}
          </span>
        </div>

      </div>

      {/* Progress bar */}
      <div className="balance-progress-wrap">
        <div className="balance-progress-track">
          <div
            className="progress-segment taken"
            style={{ width: `${takenFraction * 100}%` }}
            title={`Taken: ${fmt(totalTaken)}d`}
          />
          <div
            className="progress-segment scheduled"
            style={{ width: `${scheduledFraction * 100}%` }}
            title={`Scheduled: ${fmt(totalScheduled)}d`}
          />
        </div>
        <span className="progress-legend">
          {fmt(usedOrScheduled)} of {fmt(total)} days used / scheduled
          &nbsp;&middot;&nbsp;{periodsElapsed} {cadenceLabel} periods elapsed
          &nbsp;&middot;&nbsp;{days_per_year}d / yr
          {carryoverDays != null && (
            <>&nbsp;&middot;&nbsp;carryover limit: {fmt(carryoverHours!)} hrs ({fmt(carryoverDays)} days)</>
          )}
        </span>
      </div>
    </div>
  );
}

function StatTile({
  label, value, sub, color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="stat-tile">
      <span className="stat-value" style={{ color }}>{value}</span>
      <span className="stat-label">{label}</span>
      <span className="stat-sub">{sub}</span>
    </div>
  );
}

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}
