# Crimson Onslaught — Phase 1 Tickets

Spec: `docs/superpowers/specs/2026-09-14-phase1-design.md`
Status: DRAFT — not filed anywhere. Ordered by dependency; IDs are stable.

Legend: **Deps** = must be merged first. **AC** = acceptance criteria.

---

## Epic A — Project foundation

### CO-001 Scaffold Vite + TypeScript + Phaser 3 project
Deps: —
- Vite project, strict TS, Phaser 3 latest 3.8x, `src/main.ts` boots an empty scene showing "Crimson Onslaught".
- npm scripts: `dev`, `build`, `preview`, `test`, `test:e2e`, `lint`, `format`.
- `.gitignore`, `README.md` with run instructions.
AC: `npm run dev` serves a black canvas with the title text; `npm run build` succeeds.

### CO-002 Lint, format, unit-test tooling
Deps: CO-001
- ESLint + Prettier + Vitest configured. Custom lint rule / restricted-syntax banning `Math.random` outside `src/core/rng.ts`.
- One trivial passing test to prove wiring.
AC: `npm run lint` and `npm test` pass; adding `Math.random()` in a scene fails lint.

### CO-003 GitHub Actions CI + gh-pages deploy
Deps: CO-002
- Workflow on PR: lint, unit tests, build. On push to `main`: also deploy `dist/` to gh-pages.
AC: Green check on a test PR; deployed URL loads the title scene.

### CO-004 Seeded RNG module
Deps: CO-002
- `src/core/rng.ts`: `createRng(seed)` returning `next()`, `int(min,max)`, `pick(arr)`, `shuffle(arr)`.
- Seed read from `?seed=` URL param, else `Date.now()`; logged to console.
AC: Unit tests: same seed -> identical 100-value sequence; `pick`/`shuffle` deterministic.

### CO-005 Placeholder texture layer
Deps: CO-001
- `src/config/colors.ts` + `src/render/textures.ts`: generate one texture per key (`player`, `enemy_swarm`, `enemy_fast`, `enemy_tank`, `boss`, `gem`, `proj_fire`, `fx_nova`, `fx_bolt`, `boulder`) with Phaser Graphics at boot.
- Document in README how to swap to a sprite atlas.
AC: Debug scene renders all 10 keys in a row, each distinct color/shape.

---

## Epic B — Scene flow

### CO-010 Scene skeleton and transitions
Deps: CO-005
- `BootScene` -> `SpellSelectScene` -> `GameScene` (+ `HudScene` overlay) -> `ResultScene` -> `SpellSelectScene`.
- Typed payloads: `{ spellId, seed }` into Game; `{ outcome, stats }` into Result. Missing payload on Result -> fall back to SpellSelect.
AC: Can click through the whole loop with stub content; no console errors.

### CO-011 Spell select screen
Deps: CO-010
- 4 cards (Fire / Ice / Lightning / Earth) with name, color, one-line description, base stats summary.
- Click or keys 1–4 to start.
AC: Each card starts Game with the right `spellId`; keyboard and mouse both work.

### CO-012 HUD overlay
Deps: CO-010, CO-030
- Timer (m:ss), HP bar, XP bar + level number, kill count, boss HP bar (hidden until boss phase).
- Driven by events from `RunState`, not by polling GameScene internals.
AC: Values update live; boss bar appears only in boss phase; HUD survives scene pause.

### CO-013 Level-up overlay
Deps: CO-010, CO-041
- Launched on level-up, pauses Game. Shows 1–3 perk cards (name, branch, rank x/y, description). Click or keys 1–3 to pick. Resumes Game.
- Zero eligible perks -> no overlay, +10 max HP applied silently.
AC: Game frozen while open (enemies/timer stop); pick applies perk and resumes; zero-perk path verified by exhausting a tree in a test seed.

### CO-014 Result screen
Deps: CO-010, CO-030
- Win / Lose headline, stats: time survived, level, kills, spell, perks taken. "Play again" -> SpellSelect.
AC: Both outcomes render correct stats; button works with mouse and Enter.

---

## Epic C — Core run loop

### CO-020 Arena, camera, player movement
Deps: CO-010
- 3000x3000 bounded world. `Player` entity: WASD + arrows, speed 180, Arcade body, camera follow with bounds.
AC: Player cannot leave world; diagonal speed normalized; 60 fps in dev.

### CO-021 Player HP, damage intake, death
Deps: CO-020
- HP 100, `takeDamage(n)`, 0.5 s invulnerability with alpha flicker, `died` event.
AC: Two hits inside 0.5 s deal damage once; HP 0 emits `died` exactly once.

### CO-022 Enemy base entity + object pool
Deps: CO-020, CO-005
- `Enemy` with archetype from `config/enemies.ts` (Swarm/Fast/Tank stats per spec). Chase AI. Pool with hard cap 300; spawn beyond cap dropped.
- Contact damage to player, max once per 0.5 s per enemy.
AC: 300 enemies alive holds 60 fps on dev machine; 301st spawn request is a no-op; contact damage cadence verified.

### CO-023 XP gems
Deps: CO-022, CO-021
- Pooled `XpGem`; enemy death drops 1 (Tank 3). Player pickup radius 40; gem drifts to player when inside radius.
AC: Kill Swarm -> 1 gem; kill Tank -> 3 gems; gems collected increment XP.

### CO-024 Wave schedule (pure logic)
Deps: CO-004
- `src/core/waveSchedule.ts`: `activeWave(t)`, `spawnBudget(t, dt)` with fractional accumulator; table in `config/waves.ts` per spec.
AC: Unit tests at boundaries (0, 59.9, 60, 299.9, 300); budget over 1 s at 2/s yields exactly 2 spawns; 300+ yields 0.

### CO-025 Spawn director
Deps: CO-022, CO-024
- Consumes budget each frame, picks type via seeded RNG from active wave, spawns on a ring 100 px outside camera view.
- Stops in boss phase.
AC: With seed 1 at t=0..10 s the spawn count and types are identical across two runs; no spawn ever visible on-screen at birth.

### CO-030 RunState (timer, phase, stats)
Deps: CO-004
- Timer counts up; phase `waves` -> `boss` at 300 s -> `over`. Tracks kills, level, xp, perks. Emits `timer`, `xp`, `hp`, `kill`, `phase`, `bossHp` events.
- `?timeScale=` URL param multiplies dt (test hook, dev only).
AC: Unit tests for phase transitions; events fire with correct payloads.

### CO-031 XP curve + level-up trigger
Deps: CO-030, CO-023
- `src/core/xp.ts`: `xpToNext(level) = 10 + level*5`; carry-over XP; multi-level in one pickup handled sequentially.
AC: Unit tests for curve and carry-over; gaining 100 XP at level 1 triggers the right number of level-ups in order.

### CO-032 Collision system wiring
Deps: CO-022, CO-023, CO-021
- One place that registers all Arcade overlaps: enemy<->player, gem<->player, spell hitboxes<->enemy (hook for Epic D).
AC: No overlap registration exists outside `CollisionSystem`; all pairs fire in a debug scene.

---

## Epic D — Spells and perks

### CO-040 SpellStats + perk reducer (pure logic)
Deps: CO-004
- `src/core/spellStats.ts`: `SpellStats` type per spell, `applyPerk(stats, perkId, rank)` reducer. Perk trees in `config/perks.ts` (4 spells x 12 perks + 3 generic) per spec.
- Boot-time config validation: prereqs exist, maxRank >= 1, tiers ascending.
AC: Unit test iterates every perk id in every tree: applies without throw, changes only its intended field(s). Validation test catches a bad prereq.

### CO-041 Perk offer logic (pure logic)
Deps: CO-040
- `src/core/perkOffer.ts`: `eligible(tree, owned)`, `offer(rng, eligible, 3)`.
AC: Unit tests: prereq gating, maxRank gating, offer size 3 / 2 / 1 / 0, no duplicates, deterministic under seed.

### CO-042 PerkSystem (runtime)
Deps: CO-041, CO-031
- Owns `owned` map, listens for level-up, produces offer, applies pick to active `Spell.stats`, handles generic perks (speed / max HP / pickup radius) on Player.
AC: Picking Move Speed x3 yields 180*1.1^3 speed; picking a spell perk changes the live spell behavior next cast.

### CO-043 Spell interface + scheduler
Deps: CO-032, CO-040
- `Spell { stats; update(dt); applyPerk(id, rank) }`; cooldown handling; target helpers (`nearestEnemies(n)`).
AC: A stub spell fires exactly on cooldown at timeScale 1 and 10.

### CO-044 Fire — Fireball
Deps: CO-043
- Pooled `Projectile` toward nearest enemy; on hit damage + AoE explosion (50% dmg in `aoeRadius`, 100% with Big Blast); Burn DoT; multi-projectile picks distinct targets.
AC: Manual: one Swarm cluster hit shows AoE kills; unit test for AoE damage math and burn ticks.

### CO-045 Ice — Frost Nova
Deps: CO-043
- Ring pulse: damage + slow (`slowPct`, `slowDuration`); slow is max-not-additive; Freeze chance stops enemy 1 s; Shatter +50% vs slowed.
AC: Unit test slow stacking rule and shatter; manual: enemies visibly slow in radius, nothing outside affected.

### CO-046 Lightning — Chain Lightning
Deps: CO-043
- Strike nearest, chain up to `chains` within `chainRange` to unhit enemies at 80% (100% with No Falloff); Stun; multi-strike; brief line FX.
AC: Unit test chain target selection and falloff; manual: visible chain across 3 enemies at base+1 chain.

### CO-047 Earth — Orbiting Boulders
Deps: CO-043
- `count` boulders orbit at `orbitRadius`/`orbitSpeed`; damage + knockback; per-enemy 0.4 s hit cooldown; Crush x2 vs Tank.
AC: Unit test knockback vector and Crush; manual: boulders evenly spaced, count perk adds one and re-spaces.

---

## Epic E — Boss and run end

### CO-050 Boss entity
Deps: CO-022, CO-030
- Extends `Enemy`; stats per spec (HP 1500, speed 70, dmg 30, r 40). Every 4 s: 0.8 s telegraph flash then 0.6 s charge at 400 px/s toward player's position at telegraph end.
AC: Telegraph visible before every charge; charge direction locked at telegraph end; boss takes spell damage.

### CO-051 Boss phase orchestration
Deps: CO-050, CO-025, CO-014
- At phase `boss`: spawn director stops, boss spawns off-camera, HUD boss bar on. Boss death -> `Result(win)`. Player death any time -> `Result(lose)`.
AC: Run at timeScale 10 reaches boss at 5:00; killing boss shows Win with stats; dying shows Lose.

---

## Epic F — Verification

### CO-060 Playwright smoke: boot + each spell 10 s
Deps: CO-051 (all gameplay merged)
- For each spell: load `/?seed=1&timeScale=10`, click card, wait 10 s, assert HUD timer advanced, kills > 0, zero console errors.
AC: Passes locally and in CI; wired into CI workflow.

### CO-061 Playwright full run to Result
Deps: CO-060
- Seeded run at max time scale reaches boss phase and a Result scene (either outcome) without errors.
AC: Passes in CI under 90 s.

### CO-062 Balance pass and tuning doc
Deps: CO-051
- Play each spell 3 runs at timeScale 1; adjust configs so an average player reaches the boss with 2 of 4 spells and the boss is killable in ~45–90 s.
- Record results in `docs/tuning/phase1-balance.md`.
AC: Tuning doc filled with per-spell outcomes; config changes only, no code.

### CO-063 Phase 1 acceptance checklist
Deps: CO-062, CO-061
- Manual walkthrough of every AC above on the deployed gh-pages URL; file bugs as new tickets.
AC: Checklist in `docs/tickets/phase1-acceptance.md` fully ticked, deployed build hash recorded.

---

## Summary

| Epic | Tickets | Parallelizable after |
|---|---|---|
| A Foundation | 5 | CO-001 |
| B Scene flow | 5 | CO-010 |
| C Core loop | 9 | CO-020 / CO-004 |
| D Spells & perks | 8 | CO-043 (4 spells in parallel) |
| E Boss | 2 | CO-050 |
| F Verification | 4 | CO-051 |
| **Total** | **33** | |

Critical path: 001 -> 005 -> 010 -> 020 -> 022 -> 032 -> 043 -> (one spell) -> 050 -> 051 -> 060.
