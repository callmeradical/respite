import { useState, useEffect, useCallback } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import CalendarView from './components/Calendar';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';
import SettingsPanel from './components/Settings';
import EntryModal from './components/EntryModal';
import BulkHolidayModal from './components/BulkHolidayModal';
import OptimizeModal from './components/OptimizeModal';
import ExportModal from './components/ExportModal';
import { getSettings, getEntries, getHolidays } from './lib/db';
import { computeAccrual } from './lib/accrual';
import { generateICS } from './lib/icsExport';
import type { Settings, TimeOffEntry, Holiday, AccrualSummary } from './lib/types';
import './App.css';

type Modal =
  | { kind: 'settings' }
  | { kind: 'addEntry'; date: string; endDate?: string }
  | { kind: 'editEntry'; entry: TimeOffEntry }
  | { kind: 'editHoliday'; holiday: Holiday }
  | { kind: 'bulkHolidays' }
  | { kind: 'optimize' }
  | { kind: 'exportPicker' };

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [entries,  setEntries]  = useState<TimeOffEntry[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [summary,  setSummary]  = useState<AccrualSummary | null>(null);
  const [modal,    setModal]    = useState<Modal | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  // Drawer open state — both open by default
  const [leftOpen,  setLeftOpen]  = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  // ICS export
  const [exporting,  setExporting]  = useState(false);
  const [exportMsg,  setExportMsg]  = useState<string | null>(null);

  // ── Data loading ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const [s, e, h] = await Promise.all([getSettings(), getEntries(), getHolidays()]);
      setSettings(s);
      setEntries(e);
      setHolidays(h);
      setSummary(computeAccrual(s, e));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (settings) setSummary(computeAccrual(settings, entries));
  }, [settings, entries]);

  // Apply theme preference to the document root so CSS can react
  useEffect(() => {
    const root = document.documentElement;
    const theme = settings?.theme ?? 'auto';
    if (theme === 'auto') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
  }, [settings?.theme]);

  // ── ICS export ──────────────────────────────────────────────────────────────
  async function handleExportICS(selected: TimeOffEntry[]) {
    const ics = generateICS(selected);
    if (!ics) {
      setExportMsg('No events to export.');
      setTimeout(() => setExportMsg(null), 3000);
      return;
    }
    const path = await save({
      title: 'Export PTO calendar',
      filters: [{ name: 'iCalendar', extensions: ['ics'] }],
      defaultPath: 'respite-pto.ics',
    });
    if (!path) { return; }
    closeModal();
    setExporting(true);
    try {
      await invoke('write_text_file', { path, content: ics });
      setExportMsg(`Exported ${selected.length} event${selected.length !== 1 ? 's' : ''}`);
    } catch (e) {
      setExportMsg(`Export failed: ${e}`);
    } finally {
      setExporting(false);
      setTimeout(() => setExportMsg(null), 3000);
    }
  }

  // ── Modal helpers ────────────────────────────────────────────────────────────
  function closeModal() { setModal(null); }
  async function handleSaved() { closeModal(); await load(); }

  // ── Guards ───────────────────────────────────────────────────────────────────
  if (loading) {
    return <div className="app-loading"><span>Loading…</span></div>;
  }
  if (error || !settings || !summary) {
    return (
      <div className="app-error">
        <h2>Failed to load database</h2>
        <pre>{error}</pre>
        <button
          className="btn-primary"
          onClick={() => { setError(null); setLoading(true); load(); }}
        >
          Retry
        </button>
      </div>
    );
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="app">

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <header className="app-header" data-tauri-drag-region>
        <div className="header-left">
          <button
            className="btn-title-toggle"
            onClick={() => setLeftOpen((o) => !o)}
            aria-label={leftOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            title={leftOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <SidebarLeftIcon />
            <span className="app-logo">Respite</span>
          </button>
        </div>

        <div className="header-right">
          <button
            className="btn-optimize"
            onClick={() => setModal({ kind: 'optimize' })}
            title="Get optimization recommendations"
          >
            ✦ Optimize
          </button>
          <button
            className="btn-panel-toggle"
            onClick={() => setRightOpen((o) => !o)}
            aria-label={rightOpen ? 'Collapse events' : 'Expand events'}
            title={rightOpen ? 'Collapse events' : 'Expand events'}
          >
            <SidebarRightIcon />
          </button>
        </div>
      </header>

      {/* ── Three-column body ────────────────────────────────────────────── */}
      <div className="app-body">

        {/* Left drawer */}
        <div className={`panel-wrap panel-left-wrap${leftOpen ? '' : ' panel-closed'}`}>
          <LeftPanel
            summary={summary}
            settings={settings}
            onAddEntry={() => setModal({ kind: 'addEntry', date: todayIso })}
            onImportHolidays={() => setModal({ kind: 'bulkHolidays' })}
            onExportICS={() => setModal({ kind: 'exportPicker' })}
            exporting={exporting}
            onOpenSettings={() => setModal({ kind: 'settings' })}
          />
        </div>

        {/* Calendar — fills remaining space */}
        <main className="cal-main">
          <CalendarView
            entries={entries}
            holidays={holidays}
            onDayClick={(iso) => setModal({ kind: 'addEntry', date: iso })}
            onEntryClick={(entry) => setModal({ kind: 'editEntry', entry })}
            onHolidayClick={(holiday) => setModal({ kind: 'editHoliday', holiday })}
          />
        </main>

        {/* Right drawer */}
        <div className={`panel-wrap panel-right-wrap${rightOpen ? '' : ' panel-closed'}`}>
          <RightPanel
            entries={entries}
            onEntryClick={(entry) => setModal({ kind: 'editEntry', entry })}
          />
        </div>

      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {modal?.kind === 'settings' && (
        <SettingsPanel
          settings={settings}
          onSaved={(s) => { setSettings(s); closeModal(); }}
          onClose={closeModal}
        />
      )}

      {modal?.kind === 'addEntry' && (
        <EntryModal
          defaultDate={modal.date}
          defaultEndDate={modal.endDate}
          holidays={holidays}
          settings={settings}
          entries={entries}
          onSaved={handleSaved}
          onClose={closeModal}
        />
      )}

      {modal?.kind === 'editEntry' && (
        <EntryModal
          editEntry={modal.entry}
          holidays={holidays}
          settings={settings}
          entries={entries}
          onSaved={handleSaved}
          onClose={closeModal}
        />
      )}

      {modal?.kind === 'editHoliday' && (
        <EntryModal
          editHoliday={modal.holiday}
          defaultMode="holiday"
          holidays={holidays}
          settings={settings}
          entries={entries}
          onSaved={handleSaved}
          onClose={closeModal}
        />
      )}

      {modal?.kind === 'bulkHolidays' && (
        <BulkHolidayModal
          existingHolidays={holidays}
          onSaved={handleSaved}
          onClose={closeModal}
        />
      )}

      {modal?.kind === 'exportPicker' && (
        <ExportModal
          entries={entries}
          exporting={exporting}
          onExport={handleExportICS}
          onClose={closeModal}
        />
      )}

      {modal?.kind === 'optimize' && (
        <OptimizeModal
          settings={settings}
          entries={entries}
          holidays={holidays}
          summary={summary}
          onSchedule={(start, end) => {
            closeModal();
            setModal({ kind: 'addEntry', date: start, endDate: end });
          }}
          onClose={closeModal}
        />
      )}

      {/* ── Toast ────────────────────────────────────────────────────────── */}
      {exportMsg && (
        <div className={`export-toast${exportMsg.startsWith('Export failed') ? ' toast-error' : ''}`}>
          {exportMsg}
        </div>
      )}
    </div>
  );
}

// ── Toolbar SVG icons ─────────────────────────────────────────────────────────

function SidebarLeftIcon() {
  return (
    <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor" aria-hidden>
      <rect x="0"   y="0" width="4.5" height="11" rx="1.5" opacity="0.4" />
      <rect x="7"   y="0"   width="8" height="1.8" rx="0.9" />
      <rect x="7"   y="4.6" width="8" height="1.8" rx="0.9" />
      <rect x="7"   y="9.2" width="8" height="1.8" rx="0.9" />
    </svg>
  );
}

function SidebarRightIcon() {
  return (
    <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor" aria-hidden>
      <rect x="0"    y="0"   width="8" height="1.8" rx="0.9" />
      <rect x="0"    y="4.6" width="8" height="1.8" rx="0.9" />
      <rect x="0"    y="9.2" width="8" height="1.8" rx="0.9" />
      <rect x="10.5" y="0"   width="4.5" height="11" rx="1.5" opacity="0.4" />
    </svg>
  );
}
