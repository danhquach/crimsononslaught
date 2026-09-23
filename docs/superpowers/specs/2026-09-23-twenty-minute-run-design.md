# Crimson Onslaught — 20-Minute Run, Drops and Map Pickups

Date: 2026-09-23
Status: Draft — agreed in chat, reviewed in the pull request for #127
Tickets: [#127](https://github.com/danhquach/crimsononslaught/issues/127) (rewritten, §2), plus one new ticket for drops and map pickups (§3–§5)
Supersedes:
- Phase 1 spec §5 "Spawn schedule" and "Boss" timing (boss at 5:00);
- the end-of-run Embers formula from CO-101 (`currencyFor`);
- #127's original difficulty tiers and endless mode.

## 1. Goal

- A run lasts **20 minutes**, and the boss arrives at 20:00. Killing it wins,
  as today.
- **Monsters drop** XP gems (unchanged), **Embers** and, rarely, a
  **consumable**:
  - Embers collected in the run are banked at the end, win or lose, and spent
    in the existing pre-run Upgrades store.
  - The consumable is a placeholder whose effects #128 designs.
- **Strong pickups are scattered around the map** at run start for the player
  to go and collect. Their effects are placeholders, designed in a later
  ticket.

Out of scope:
- difficulty tiers, endless mode, stages and an in-run shop;
- any real consumable or map-pickup effect.

## 2. The 20-minute run (#127)

### 2.1 Wave table

`config/waves.ts` keeps its shape and gains two columns. Each row owns the run
from its `startTime` to the next row's.

```ts
interface Wave {
  startTime: number;
  types: readonly EnemyType[];
  spawnsPerSecond: number;
  hpMul: number;     // new: multiplies archetype hp at spawn
  damageMul: number; // new: multiplies archetype contactDamage at spawn
}
```

Starting values (a tuning pass is expected, §7):

| Start | Types | Spawns/s | HP × | Damage × |
|---|---|---|---|---|
| 0:00 | swarm | 1.5 | 1.0 | 1.0 |
| 2:00 | swarm, fast | 2.0 | 1.2 | 1.1 |
| 4:00 | swarm, fast, tank | 2.5 | 1.4 | 1.2 |
| 6:00 | swarm, fast, tank | 3.0 | 1.6 | 1.3 |
| 8:00 | swarm, fast, tank | 3.5 | 1.8 | 1.4 |
| 10:00 | swarm, fast, tank | 4.0 | 2.0 | 1.5 |
| 12:00 | swarm, fast, tank | 4.5 | 2.2 | 1.6 |
| 14:00 | swarm, fast, tank | 5.0 | 2.4 | 1.7 |
| 16:00 | swarm, fast, tank | 5.5 | 2.6 | 1.8 |
| 18:00 | swarm, fast, tank | 6.0 | 2.8 | 1.9 |
| 20:00 | — (boss) | 0 | — | — |

- `BOSS_START_TIME` becomes `1200`. The boss row keeps `types: []` and zero
  spawns, and uses `hpMul` / `damageMul` of 1.
- The multipliers apply when an enemy spawns, to the archetype row's `hp` and
  `contactDamage`. Speed, radius and texture are not scaled. Enemies already
  on the field keep the stats they spawned with.
- `BOSS.hp` goes from 2400 to 7200, a starting value that matches a
  20-minute build. Speed, contact damage and the charge cycle are unchanged.
- The 300 live-enemy cap is unchanged.

Invariants the tests pin:

- start times ascend, and the first is 0;
- the last row starts at `BOSS_START_TIME` and spawns nothing;
- every non-boss row has at least one type;
- `spawnsPerSecond`, `hpMul` and `damageMul` never go down from one non-boss
  row to the next.

`RunPhase` (`waves | boss | over`), the budget maths in `core/waveSchedule.ts`,
and "boss death → win, player death → lose" are all unchanged.

### 2.2 Test hook `?startAt=<seconds>`

- It starts the run clock at the given time, e.g. `?startAt=1190` means the boss
  is 10 s away.
- It is read in the built app, like `?timeScale=`. Anything absent, non-numeric,
  negative, or at or past `BOSS_START_TIME` reads as 0.
- The player still starts at level 1 with the chosen spell plus `?loadout=`.
  It is a test hook, not a feature.
- Why it's needed: at `?timeScale=30`, 20 minutes is 40 s of wall time before
  the boss, and far more on a slow CI runner that renders fewer frames.
- `fullRun` moves to `?startAt=1190&invulnerable=1`. Any smoke spec that
  assumes the boss at 5:00 moves to `?startAt=`.

### 2.3 Acceptance

- A default run spawns by the table above and brings the boss at 20:00.
- A run started with `?startAt=` reaches the boss and a Result.
- The same seed and the same `?startAt=` reproduce the run.

## 3. Pickups — shared plumbing (new ticket)

Everything on the floor except XP gems goes through one **`PickupPool`**,
modelled on `GemPool`:

- one Arcade group;
- a `maxSize` cap;
- `runChildUpdate: false`;
- reclaimed when collected;
- no special cleanup, because the group dies with the scene, as gems do.

```ts
type PickupKind = 'ember' | 'consumable' | 'relic';
```

- Data lives in `config/pickups.ts`: drop chances, counts, the cap, placement
  numbers and textures. Rules live in `core/pickups.ts`, pure and
  Vitest-covered.
- Embers and consumables drift to the player within the pickup radius, the
  same rule and the same radius as gems. Relics do not drift: they are
  collected when the player's body touches them.
- There is one overlap, `player ↔ pickups.group`, registered in
  `CollisionSystem`'s constructor (guarded by `collisionWiring.test.ts`). Its
  handler, `onPickup(kind)`, lives in `GameScene`.
- **Separate RNG stream.** Every drop roll and relic placement draws from
  `createRng(deriveSeed(runSeed, 'pickups'))` (`deriveSeed` is a new pure helper in `core/rng.ts`), never from the run RNG. That way
  adding pickups does not shift the spawn angles or level-up offers that
  existing seeded e2e checks rely on.
- Placeholder textures for all three kinds are new `TextureKey`s in
  `config/colors.ts`. They must be distinct from gems at a glance, and relics
  are drawn larger. Real art comes later through the manifest.

## 4. Monster drops (new ticket)

Rolled once per regular enemy death, next to `gems.dropFor` in
`GameScene.damageEnemy`:

| Source | Embers | Consumable |
|---|---|---|
| swarm | 20% chance of 1 | 3% |
| fast | 20% chance of 1 | 3% |
| tank | always 3 | 3% |
| boss | 100, credited directly on the kill | — |

- An Ember pickup carries a value (tank = one pickup worth 3).
- **Cap:** `MAX_LIVE_PICKUPS = 500`. An Ember drop past the cap is credited
  straight to the run, so Embers are never lost to the cap. A consumable past
  the cap is dropped. Relics have their own reserved slots (§5).
- The boss's 100 Embers are credited directly: the win follows the death
  clip, so there is no time to walk to a pile.

### 4.1 Embers replace the end-of-run formula

- `RunState` owns `embers` (collected this run). A `run:embers` event carries
  `{ embers }`, and the HUD shows the count.
- `RunStats` gains `embers`. `GameScene.endRun` banks `stats.embers`, win or
  lose: `recordRun(save, stats, outcome, stats.embers)`.
- `currencyFor` and `CURRENCY_RATES` are removed, along with their tests.
  There is no separate win bonus; the boss's 100 plays that role.
- The Result screen shows "Embers collected: N" in place of the formula
  payout.
- The Upgrades store (`UpgradesScene`, `config/meta.ts` upgrades) is unchanged.

### 4.2 Consumable stub

- Picking one up calls `onConsumable()`, which only emits
  `pickup:consumable` and counts it into `RunStats.consumables`.
- #128 replaces that stub with health, magnet, bomb and chest. It will add a
  `consumableKind` then; it is not designed here.

## 5. Map pickups ("relics", new ticket)

- **8 relics** are placed at run start, on seeded spots in the 3000×3000 arena:
  - at least 400 px from the player's start;
  - at least 500 px from each other;
  - at least 100 px inside the arena edge.
- `placeRelics(rng, world, start, count)` in `core/pickups.ts` does rejection
  sampling with an attempt cap. If spacing can't be met within the cap, it
  returns fewer relics rather than looping forever. Tests pin the spacing and
  the cap.
- Relics never despawn and never respawn. Once taken, a relic is gone.
- Picking one up calls `onRelic()`, which only emits `pickup:relic` and counts
  it into `RunStats.relics`. The effect is designed in a later ticket.
- The pool's `maxSize` is `MAX_LIVE_PICKUPS + RELIC_COUNT`, so relics never
  take a slot away from drops.

## 6. Tests

**Unit (Vitest, `src/core/**` and `src/config/**`)**
- Wave table invariants (§2.1), and scaled hp and damage at spawn.
- `?startAt=` parsing.
- Drop rolls per source on a seeded RNG, the boss credit, and the cap
  overflow credit.
- Relic placement spacing, edge margin and attempt cap.
- `recordRun` banks exactly `stats.embers`.
- The `RunState` Embers tally and the `run:embers` event.
- `collisionWiring.test.ts` gains the pickups overlap.

**e2e (Playwright)**
- `fullRun` on `?startAt=1190&invulnerable=1` reaches the boss and a Result
  with an Embers count.
- A pickups smoke test sees 8 relics in the arena at start, and an Embers count
  that rises during play.
- Run e2e specs alone and re-run once before diagnosing a flake.

## 7. Risks and tuning

- Twenty minutes with 3 enemy types will get repetitive. The roster work
  (#126) matters more now.
- The XP curve (`10 + 5 × level`) and the passive pool were sized for five
  minutes. Expect much higher levels and stacked uncapped passives, so plan a
  balance pass.
- The Embers economy changes: a 20-minute run of drops has no relation to the
  old formula's numbers. Tune the drop rates against the Upgrades store's
  prices.
- The wave multipliers and boss HP above are starting values, not balanced
  ones.
