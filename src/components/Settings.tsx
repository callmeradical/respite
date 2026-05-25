import { useState } from 'react';
import type { Settings } from '../lib/types';
import { saveSettings } from '../lib/db';
import './Settings.css';

interface Props {
  settings: Settings;
  onSaved: (s: Settings) => void;
  onClose: () => void;
}

export default function SettingsPanel({ settings, onSaved, onClose }: Props) {
  const [form, setForm] = useState<Omit<Settings, 'id'>>({
    pay_period_cadence:    settings.pay_period_cadence,
    days_per_year:         settings.days_per_year,
    accrual_start_date:    settings.accrual_start_date,
    opening_balance:       settings.opening_balance,
    max_balance_days:      settings.max_balance_days,
    hours_per_day:         settings.hours_per_day ?? 8,
    carryover_limit_hours: settings.carryover_limit_hours,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const periodsPerYear = form.pay_period_cadence === 'biweekly' ? 26 : 24;
  const ratePerPeriod  = (form.days_per_year / periodsPerYear).toFixed(4);

  const carryoverDays =
    form.carryover_limit_hours != null && form.hours_per_day > 0
      ? (form.carryover_limit_hours / form.hours_per_day).toFixed(2).replace(/\.?0+$/, '')
      : null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await saveSettings(form);
      onSaved({ ...form, id: 1 });
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">&#10005;</button>
        </div>

        <div className="settings-body">

          {/* ── Pay period cadence ── */}
          <fieldset>
            <legend>Pay period cadence</legend>
            <label className="radio-label">
              <input
                type="radio"
                name="cadence"
                value="biweekly"
                checked={form.pay_period_cadence === 'biweekly'}
                onChange={() => setForm((f) => ({ ...f, pay_period_cadence: 'biweekly' }))}
              />
              Bi-weekly <span className="hint">(every 2 weeks, 26 periods/yr)</span>
            </label>
            <label className="radio-label">
              <input
                type="radio"
                name="cadence"
                value="semi_monthly"
                checked={form.pay_period_cadence === 'semi_monthly'}
                onChange={() => setForm((f) => ({ ...f, pay_period_cadence: 'semi_monthly' }))}
              />
              Semi-monthly <span className="hint">(1st &amp; 15th, 24 periods/yr)</span>
            </label>
          </fieldset>

          {/* ── Days per year ── */}
          <div className="field-group">
            <label htmlFor="dpy">PTO days accrued per year</label>
            <div className="input-hint-row">
              <input
                id="dpy"
                type="number"
                min={0}
                max={365}
                step={0.5}
                value={form.days_per_year}
                onChange={(e) =>
                  setForm((f) => ({ ...f, days_per_year: parseFloat(e.target.value) || 0 }))
                }
              />
              <span className="hint">= {ratePerPeriod} days / period</span>
            </div>
          </div>

          {/* ── Accrual start date ── */}
          <div className="field-group">
            <label htmlFor="asd">Accrual start date</label>
            <input
              id="asd"
              type="date"
              value={form.accrual_start_date}
              onChange={(e) =>
                setForm((f) => ({ ...f, accrual_start_date: e.target.value }))
              }
            />
            <p className="hint">When accrual tracking began (e.g. your hire date or Jan 1).</p>
          </div>

          {/* ── Opening balance ── */}
          <div className="field-group">
            <label htmlFor="ob">Opening balance (days)</label>
            <input
              id="ob"
              type="number"
              min={0}
              step={0.5}
              value={form.opening_balance}
              onChange={(e) =>
                setForm((f) => ({ ...f, opening_balance: parseFloat(e.target.value) || 0 }))
              }
            />
            <p className="hint">PTO balance already held on your start date.</p>
          </div>

          {/* ── Hours per day ── */}
          <div className="field-group">
            <label htmlFor="hpd">Working hours per day</label>
            <div className="input-hint-row">
              <input
                id="hpd"
                type="number"
                min={1}
                max={24}
                step={0.5}
                value={form.hours_per_day}
                onChange={(e) =>
                  setForm((f) => ({ ...f, hours_per_day: parseFloat(e.target.value) || 8 }))
                }
              />
              <span className="hint">Used to convert between hours and days</span>
            </div>
          </div>

          {/* ── Year-end carryover ── */}
          <fieldset>
            <legend>Year-end carryover</legend>
            <label className="radio-label">
              <input
                type="radio"
                name="carryover"
                checked={form.carryover_limit_hours == null}
                onChange={() => setForm((f) => ({ ...f, carryover_limit_hours: null }))}
              />
              Unlimited <span className="hint">(full balance rolls over)</span>
            </label>
            <label className="radio-label">
              <input
                type="radio"
                name="carryover"
                checked={form.carryover_limit_hours != null}
                onChange={() =>
                  setForm((f) => ({ ...f, carryover_limit_hours: f.carryover_limit_hours ?? 40 }))
                }
              />
              Cap carryover
            </label>

            {form.carryover_limit_hours != null && (
              <div className="carryover-input-row">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.carryover_limit_hours}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      carryover_limit_hours: parseFloat(e.target.value) || 0,
                    }))
                  }
                />
                <span className="unit-label">hours</span>
                {carryoverDays && (
                  <span className="hint">= {carryoverDays} days</span>
                )}
              </div>
            )}

            <p className="hint" style={{ marginTop: 8 }}>
              At year-end, any balance above this limit is forfeited.
            </p>
          </fieldset>

          {/* ── Accrual cap (continuous) ── */}
          <div className="field-group">
            <label htmlFor="mb">Accrual cap — days (optional)</label>
            <input
              id="mb"
              type="number"
              min={0}
              step={0.5}
              value={form.max_balance_days ?? ''}
              placeholder="No cap"
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  max_balance_days: e.target.value ? parseFloat(e.target.value) : null,
                }))
              }
            />
            <p className="hint">Accrual pauses once balance reaches this level (continuous cap, distinct from carryover).</p>
          </div>

        </div>

        {error && <p className="error-msg">{error}</p>}

        <div className="settings-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
