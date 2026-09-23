# Embers economy (#195)

Ticket: [#195](https://github.com/danhquach/crimsononslaught/issues/195) · Spec: `docs/superpowers/specs/2026-09-23-twenty-minute-run-design.md` §4, §7

Since #195 a run banks exactly the Embers it picks up. The old end-of-run
formula (`currencyFor`) is gone. This note shows how the starting drop table
compares with the Upgrades store's prices, so the tuning pass starts from
numbers rather than guesses.

## The store

`config/meta.ts`, rank `r` (0-based) costs `baseCost + costStep × r`:

| Upgrade | Ranks | Full cost |
|---|---|---|
| Vigor | 5 | 1,000 |
| Might | 5 | 1,200 |
| Alacrity | 5 | 1,200 |
| Fleet | 3 | 360 |
| Fortune | 5 | 1,000 |
| Bulwark (after the first win) | 5 | 2,000 |
| **Everything** | | **6,760** |

The cheapest single rank is 80 (Fleet rank 1).

## Upper bound for one run

This counts every spawn on the `config/waves.ts` table, each 2-minute row at
its `spawnsPerSecond`, with types picked uniformly. Tanks join at 4:00.

| | Spawns | Embers |
|---|---|---|
| Swarm + fast (20% × 1) | ~3,140 | ~630 |
| Tank (always 3) | ~1,360 | ~4,080 |
| Boss kill | 1 | 100 |
| **Full clear, every drop collected** | ~4,500 | **~4,800** |

About 87% of that comes from tanks. A perfect run pays for about 70% of the
whole store. A win of any quality already buys several ranks.

## Measured (2026-09-23)

This is `e2e/pickups.spec.ts`'s run, not a balance sweep: seed 1, Fire,
invulnerable, standing still, `?startAt=240`. It banked 116 Embers over one
minute of the 4:00 row. That row can drop at most ~170 Embers a minute, so a
player who never steers still collects about two thirds of them, since the
crowd dies at their feet.

## Where to tune first

- **The tank row.** It is almost all of the income. Lowering its `value` or
  `chance` moves the whole economy. Swarm and fast change little.
- **`BOSS_EMBERS`.** It replaces the old 150 win bonus. It is small next to
  a 20-minute run's drops.
- Measure with the Phase 2 bot method (`docs/tuning/phase2-balance.md`), and
  read `stats.embers` from the Result payload per seed.
