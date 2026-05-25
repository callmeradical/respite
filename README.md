# Respite

I have a hard time taking PTO. This app helps me see how much time I have, how much I've used, and when I should take more before I lose it.

Built for macOS with [Tauri](https://tauri.app). Everything stays local — SQLite, no accounts, no cloud.

---

## What it does

- Tracks PTO accrual by pay period (bi-weekly or semi-monthly)
- Shows your current balance and what it will be after all your scheduled time off fires, accounting for days you'll earn before each event
- Warns you if you're scheduling more than you'll have accrued by that date
- Finds windows where a few PTO days bridge a holiday into a longer break
- Flags days at risk of being forfeited at year-end based on your carryover limit
- Imports US federal holidays and exports your calendar as a `.ics` file

---

## Getting started

```bash
git clone https://github.com/callmeradical/respite.git
cd respite
npm install
npm run tauri dev
```

Open Settings (bottom of the left drawer) and enter your pay period cadence, accrual rate, start date, and any opening balance. Everything else updates automatically.

### Run tests

```bash
npm test
```

### Build a DMG

```bash
npm run tauri build
# → src-tauri/target/release/bundle/dmg/
```

---

## Releases

Download the latest DMG from the [Releases page](https://github.com/callmeradical/respite/releases). On first launch, right-click → Open to bypass Gatekeeper (the app is ad-hoc signed).

---

## Tech

Tauri 2 · React 18 · TypeScript · SQLite · Vite · Vitest
