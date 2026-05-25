# Getting started

## Prerequisites

| Requirement | Version |
|---|---|
| macOS | 13 Ventura or later |
| Node.js | 18+ |
| Rust | stable toolchain |

## Install from DMG (end users)

1. Download the latest `Respite_x.y.z_aarch64.dmg` from the [Releases page](https://github.com/callmeradical/respite/releases)
2. Open the DMG and drag **Respite.app** to your Applications folder
3. On first launch, **right-click → Open** to bypass the Gatekeeper warning (the app is ad-hoc signed, not notarized)
4. From the second launch onwards, double-click works normally

## Build from source (developers)

```bash
# 1. Clone the repo
git clone https://github.com/callmeradical/respite.git
cd respite

# 2. Install frontend dependencies
npm install

# 3. Launch in dev mode (hot-reload frontend + Rust backend)
npm run tauri dev
```

## First-time setup

When Respite launches for the first time it creates a local SQLite database and applies the schema migrations automatically. Open **Settings** (bottom of the left drawer) to configure:

- Your **pay period cadence** (bi-weekly or semi-monthly)
- **PTO days per year** you accrue
- **Accrual start date** (your hire date or Jan 1)
- **Opening balance** — days you already held when you started tracking
- **Year-end carryover limit** in hours (e.g. 40 hrs)

See [Settings](./settings.md) for the full reference.
