# Optimizer

The optimizer finds **bridge opportunities** — windows of days where a small number of PTO days, combined with existing weekends and holidays, produce the longest possible continuous break.

## How the budget is calculated

A common misconception is that you can only schedule PTO you've already accrued. Respite computes the budget for each recommended window as:

```
budget(window_start) = balance_accrued_so_far
                     + will_accrue_between_now_and_window_start
                     - scheduled_PTO_ending_before_window_start
```

This means a window in August is evaluated against what you'll actually have in August, not what you have today.

## Scoring

Recommendations are ranked by:

```
score = totalDays × efficiency × (1 + 0.25 × holiday_anchor_count)
```

Where `efficiency = totalDays / ptoDays`. This formula ensures:

- A 10-day break at 2.5× efficiency (score 25) beats a 4-day long weekend at 3.0× (score 12)
- Holiday-anchored windows get a scoring bonus since they leverage fixed free days

## Categories

| Category | Total days |
|---|---|
| Long weekend | 3–5 |
| Full week | 5–9 |
| Extended | 8–12 |
| Two weeks | 10–16 |

## Reading a recommendation card

- **X.X×** — efficiency ratio (days off per PTO day)
- **N days off** — total consecutive calendar days
- **N PTO days** — net new PTO you need to request
- **N already free** — days that are weekends/holidays/existing PTO
- **+X.Xd to earn** *(amber chip, when present)* — portion of the budget that is future accrual, not yet in your balance

## Balance forecast

The **Balance forecast** tab shows an 18-month projection. The balance line accounts for:

1. Future pay-period accrual added each month
2. Scheduled PTO deducted when it falls
3. Year-end carryover cap applied at each Jan 1 crossing

The amber dashed line marks your carryover limit. The grey dashed line shows the theoretical accrual curve if you took no PTO.
