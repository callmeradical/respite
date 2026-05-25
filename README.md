# Respite

Most PTO trackers tell you what you've used. Respite tells you what you should use — and when.

It solves a specific problem: employees who accrue paid time off on a pay-period schedule often don't know their true available balance at any future point, end up forfeiting days at year-end, or schedule time off without realising they'll run a deficit. Respite fixes all three.

**What it does:**
- Computes your real balance at any future date — not just today's balance minus everything you've booked, but your accrued days *plus the days you'll earn before each event fires*
- Warns you before you schedule more time off than you'll have accrued by the event start date
- Finds the highest-ROI windows to take time off — days where a few PTO days bridge a holiday into a 7–10 day break
- Tracks your year-end carryover limit and tells you exactly how many hours are at risk before Jan 1
- Exports your PTO and holidays to a standards-compliant `.ics` file for import into any calendar app

Everything is stored locally in SQLite. No accounts, no cloud, no subscriptions.

Built with [Tauri](https://tauri.app) (Rust + React + TypeScript) for macOS.

---

## Screenshots

| Calendar view | Optimizer | Balance forecast |
|---|---|---|
| ![Calendar](docs/screenshots/calendar.png) | ![Optimizer](docs/screenshots/optimizer.png) | ![Forecast](docs/screenshots/forecast.png) |

| Left drawer | Right drawer — scheduled PTO | Export picker |
|---|---|---|
| ![Left drawer](docs/screenshots/left-drawer.png) | ![Right drawer](docs/screenshots/right-drawer.png) | ![Export](docs/screenshots/export.png) |

---

## Features

### Calendar
- Month-view calendar that fills the window and resizes dynamically
- Click any day to add PTO or a holiday
- Color-coded pills: **blue** = scheduled, **green** = taken, **amber** = holiday
- Today highlighted with a blue circle (Apple Calendar style)

### Accrual tracking
- Per-pay-period accrual — bi-weekly (26/yr) or semi-monthly (24/yr)
- Opening balance support (carry over from before you started tracking)
- Year-end carryover limit in hours (e.g. 40 hr max) with live green/red indicator
- Hours ↔ days conversion via configurable hours-per-day setting

### Balance dashboard (left drawer)
- Large remaining balance with carryover status badge
- Mini tiles: Accrued · Taken · Scheduled
- Progress bar showing usage against total available
- Quick actions: Add time off · Import holidays · Export .ics · Settings

### Time-off optimizer
- **Bridge algorithm** — finds windows where a few PTO days yield the most consecutive days off
- Budget uses *accrued + yet-to-earn before the window* so future accrual is correctly credited
- Scored by `totalDays × efficiency` — maximises continuous days for least PTO spend
- Category tabs: Long weekends · Full weeks · Extended · Two weeks
- "× to earn" chip on cards that require days not yet accrued
- One-click scheduling: pre-fills the entry form with the recommended date range

### Balance forecast (in optimizer)
- 18-month iterative projection accounting for future accrual and scheduled PTO
- Applies carryover cap at each Jan 1 boundary
- SVG chart with balance line, accrual reference line, and carryover limit marker
- Year-end warning with exact hours-at-risk and suggested action
- Spread advice: ideal days/month and days/week to use balance evenly

### Holiday management
- **US Federal holidays preset** — all 11 holidays computed algorithmically for any year (fixed-date observance shifts included)
- **Paste / CSV import** — free-form multi-line input, live parse preview
- Bulk select/deselect per year

### ICS export
- Picker modal — choose exactly which entries to include (scheduled pre-selected, taken opt-in)
- RFC 5545 compliant: CRLF, 75-octet line folding, exclusive DTEND, text escaping
- Native Save As dialog via `tauri-plugin-dialog`

---

## Tech stack

| Layer | Technology |
|---|---|
| Shell | [Tauri 2](https://tauri.app) (Rust) |
| Frontend | React 18 + TypeScript + Vite |
| Database | SQLite via `tauri-plugin-sql` (local, no server) |
| Styling | Plain CSS with Apple HIG design tokens |
| Tests | [Vitest](https://vitest.dev) |
| Docs | [VitePress](https://vitepress.dev) |

---

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org) 18+
- [Rust](https://rustup.rs) (stable toolchain)
- macOS 13+ (Ventura or later)

### Development

```bash
git clone https://github.com/callmeradical/respite.git
cd respite
npm install
npm run tauri dev
```

### Run tests

```bash
npm test          # run once
npm run test:watch  # watch mode
npm run coverage    # with coverage report
```

### Build for distribution

```bash
npm run tauri build
# → src-tauri/target/release/bundle/dmg/Respite_x.y.z_aarch64.dmg
```

The resulting DMG is ad-hoc signed. Recipients need to **right-click → Open** the first time to bypass Gatekeeper.

---

## Releasing

Push a version tag to trigger the release workflow:

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions will build the DMG and attach it to a draft GitHub Release. See [`.github/workflows/release.yml`](.github/workflows/release.yml).

---

## Project structure

```
respite/
├── src/
│   ├── components/       # React UI components
│   ├── lib/
│   │   ├── accrual.ts    # Pay-period counting & balance computation
│   │   ├── db.ts         # SQLite access layer (tauri-plugin-sql)
│   │   ├── federalHolidays.ts  # US federal holiday algorithm + paste parser
│   │   ├── icsExport.ts  # RFC 5545 ICS generator
│   │   ├── optimizer.ts  # Bridge algorithm, projection, year-end warning
│   │   └── types.ts      # Shared TypeScript types
│   └── App.tsx
├── src-tauri/
│   ├── src/lib.rs        # Tauri setup, SQL migrations, write_text_file command
│   ├── capabilities/     # Tauri ACL permissions
│   └── icons/            # App icon (all sizes generated from app-icon.svg)
├── tests/                # Vitest unit tests
└── docs/                 # VitePress documentation site
```

---

## License

MIT
