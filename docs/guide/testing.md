# Testing

Respite uses [Vitest](https://vitest.dev) for unit testing the pure-logic layer.

## Running tests

```bash
npm test              # run once, CI mode
npm run test:watch    # watch mode during development
npm run coverage      # run with V8 coverage report
```

## What's tested

| File | Coverage |
|---|---|
| `src/lib/accrual.ts` | `countPayPeriods` (bi-weekly & semi-monthly), `countWorkingDays`, `computeAccrual` |
| `src/lib/federalHolidays.ts` | All 11 US holidays for multiple years, weekend observance shifts, paste parser |
| `src/lib/icsExport.ts` | VCALENDAR structure, DTEND exclusivity, CRLF, line folding, text escaping |

## What's excluded

`src/lib/db.ts` requires the Tauri runtime (SQLite plugin) and cannot run in a Node.js test environment. Database interactions are tested manually via the running app.

## Adding a test

Tests live in `tests/`. Add a new file following the `*.test.ts` naming convention:

```ts
// tests/myModule.test.ts
import { describe, it, expect } from 'vitest';
import { myFunction } from '../src/lib/myModule';

describe('myFunction', () => {
  it('does the expected thing', () => {
    expect(myFunction(input)).toBe(expectedOutput);
  });
});
```
