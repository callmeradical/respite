# Changelog

## [1.1.0] — 2026-05-25

### Added
- **Time-off optimizer** — bridge algorithm finds windows where a few PTO days yield the most consecutive days off; scored by `totalDays × efficiency` to maximise continuous breaks
- **Future accrual budget** — optimizer accounts for days not yet accrued but earned before a window starts, not just today's balance
- **Balance forecast** — 18-month iterative projection with year-end carryover cap applied at each Jan 1 crossing; SVG chart in the Optimize modal
- **Year-end warning** — alerts when projected balance will exceed the carryover limit, with exact hours at risk
- **ICS export picker** — choose which PTO events to include; scheduled pre-selected, taken opt-in
- **Left & right drawers** — sidebar with balance stats and quick actions; right panel with scheduled PTO list and proximity labels (today / tomorrow / in Nd)
- **US Federal holiday importer** — all 11 holidays computed algorithmically for any year with correct weekend observance shifts
- **Paste / CSV holiday import** — free-form multi-line parser with live preview
- **Year-end carryover limit** — configurable in hours (e.g. 40 hrs); green/red indicator on balance tile
- **Respite title + sidebar toggle combined** — clicking the wordmark collapses/expands the left drawer
- **Native macOS overlay title bar** — traffic lights over content, full drag region
- **Calendar fills window** — `grid-auto-rows: 1fr` distributes row height equally; resizes dynamically with window
- **54 Vitest unit tests** — accrual engine, US holiday algorithm, ICS generator
- **VitePress documentation site** — deployed to GitHub Pages
- **GitHub Actions release workflow** — push a `v*` tag → tests → universal macOS DMG → draft release

### Fixed
- `sql:allow-execute` added to Tauri capabilities — write operations (INSERT, UPDATE, migrations) were ACL-blocked in production builds
- `titleBarStyle: "Overlay"` capitalisation in `tauri.conf.json` — lowercase `"overlay"` failed schema validation during release builds
- `docs/package.json` — added `"type": "module"` to fix VitePress ESM loading error in CI

## [0.1.0] — 2026-05-25

Initial release — calendar, accrual tracking, per-pay-period balance, holiday management, ICS export, SQLite persistence.
