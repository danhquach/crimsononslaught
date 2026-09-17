# Crimson Onslaught — Phase 1 Design

Date: 2026-09-14
Status: Approved

## 1. Goal

A minimal auto-battler "bullet heaven" that runs in the browser.
Phase 1 delivers one complete run loop: pick a spell, survive 5 minutes of
escalating waves, kill the boss, see results. Everything is playable with
placeholder shapes; real art is a later drop-in.

Done = a player can load the page, pick any of the 4 spells, play a full run
to either death or boss kill, and see a result screen. CI is green (unit +
browser smoke).

## 2. Scope

### In
- 1 character, 1 arena (bounded plane, camera follows player).
- 4 spells: Fire, Ice, Lightning, Earth. Exactly one chosen per run.
- Per-spell perk tree (3 branches, 2–3 ranked nodes each) + 3 generic perks, offered as
  3 random eligible cards on level-up.
- 3 enemy types (Swarm, Tank, Fast) + 1 boss.
- Time-based spawn director, 5:00 run timer, boss at 5:00.
- HUD: timer, XP bar/level, HP bar, kill count, boss HP bar.
- Scenes: Boot, SpellSelect, Game, HUD, LevelUp, Result.
- Seeded RNG; deterministic runs for tests.
- Placeholder rendering via colored Phaser Graphics behind a texture-key layer.
- Vitest unit tests, Playwright smoke test, GitHub Actions CI, gh-pages deploy.

### Out (phase 2+)
Gold / meta shop, additional characters, spell evolutions, chests, sound and
music, real art, mobile / touch controls (gamepad IS in scope), saves, multiple arenas, ranged or
elite enemies, settings menu.

## 3. Stack

| Concern | Choice |
|---|---|
| Engine | Phaser 3 (latest 3.8x), Arcade Physics |
| Language / build | TypeScript, Vite |
| Unit tests | Vitest (pure logic modules only, no Phaser import) |
| Browser test | Playwright (Chromium) |
| Lint / format | ESLint + Prettier |
| CI / deploy | GitHub Actions; deploy `dist/` to gh-pages on `main` |

## 4. Architecture

Phaser Scenes own the flow. Game systems are small plain TS classes. All
tunable content (spells, perks, enemies, waves, boss, XP curve) lives in
typed config modules under `src/config/`. Logic that must be unit-tested has
no Phaser dependency and lives under `src/core/`.

```
src/
  main.ts                 Phaser.Game bootstrap
  config/
    spells.ts             base SpellStats per spell
    perks.ts              perk trees (per spell + generic)
    enemies.ts            enemy archetypes
    waves.ts              spawn schedule
    boss.ts               boss stats / behaviour timings
    progression.ts        XP curve, run length
    colors.ts             placeholder color per texture key
  core/                   pure logic, Vitest-covered
    rng.ts                seeded RNG (mulberry32 or similar)
    xp.ts                 xpToNext(level), level-from-xp
    perkOffer.ts          eligible(perks, owned) / offer(rng, eligible, 3)
    waveSchedule.ts       activeWave(t), spawnBudget(t, dt)
    damage.ts             hit / slow / chain / knockback math
    spellStats.ts         SpellStats type + applyPerk reducer
  scenes/
    BootScene.ts          generate placeholder textures, go to SpellSelect
    SpellSelectScene.ts   4 cards, click -> start Game with spellId + seed
    GameScene.ts          world, player, systems, physics groups
    HudScene.ts           overlay; reads GameScene state via events
    LevelUpScene.ts       overlay; pauses Game, shows 3 cards, resumes
    ResultScene.ts        win / lose, stats, "play again"
  entities/
    Player.ts
    Enemy.ts              base; pooled; archetype from config
    Boss.ts               extends Enemy; telegraph + charge behaviour
    XpGem.ts              pooled
    Projectile.ts         pooled; used by Fire
  spells/
    Spell.ts              interface
    FireballSpell.ts
    FrostNovaSpell.ts
    ChainLightningSpell.ts
    BouldersSpell.ts
  systems/
    SpawnDirector.ts      consumes waveSchedule, spawns off-camera, caps count
    PerkSystem.ts         owned perks, level-up trigger, applies to SpellStats
    CollisionSystem.ts    overlap wiring: enemy<->player, spell<->enemy, gem<->player
    RunState.ts           timer, kills, level, xp, phase (waves | boss | over)
  render/
    textures.ts           textureKey -> Graphics-generated texture (swap point for art)
```

### Data flow
1. `SpellSelectScene` -> `GameScene.init({ spellId, seed })`.
2. `GameScene.update(dt)`: `RunState.tick` -> `SpawnDirector.update` ->
   `Spell.update` -> entities move -> `CollisionSystem` resolves ->
   `RunState` records kills / xp -> emits events (`xp`, `hp`, `kill`,
   `timer`, `bossHp`) consumed by `HudScene`.
3. XP threshold reached -> `GameScene.scene.pause()`, launch `LevelUpScene`
   with `PerkSystem.offer()`. Pick -> `PerkSystem.apply(id)` ->
   `Spell.stats` mutated -> resume.
4. `RunState.phase` becomes `boss` at 5:00: `SpawnDirector` stops, boss
   spawned. Boss death -> `Result(win)`. Player HP 0 -> `Result(lose)`.

## 5. Gameplay rules

### Player
- Input: WASD + arrow keys, or gamepad left stick / D-pad (Phaser Gamepad plugin, deadzone 0.2, analog magnitude scales speed). Both live at once; non-zero input wins, keyboard on tie. Speed 180 px/s. No dash, no aim.
- Gamepad in menus/overlays: A = confirm, D-pad or left stick changes selection. Mouse and keyboard remain primary.
- HP 100. On contact damage: take damage, 0.5 s invulnerability with flicker.
- Pickup radius 40 px for XP gems (perk can increase).

### Enemies
| Type | HP | Speed | Contact dmg | Radius | Notes |
|---|---|---|---|---|---|
| Swarm | 10 | 90 | 3 | 10 | many, early |
| Fast | 8 | 170 | 3 | 8 | from 1:00 |
| Tank | 60 | 50 | 15 | 20 | from 2:00 |

- AI: move directly toward player each frame.
- Contact damage ticks at most once per 0.5 s per enemy.
- Death drops 1 XP gem (Tank drops 3).
- Object-pooled. Hard cap 300 live enemies.
- Spawn position: random point on a ring 100 px outside the camera view.

### Spawn schedule (`waves.ts`)
| t (s) | Types | Spawns / s |
|---|---|---|
| 0 | Swarm | 1.5 |
| 60 | Swarm, Fast | 2.5 |
| 120 | Swarm, Fast, Tank | 3.5 |
| 180 | Swarm, Fast, Tank | 4.5 |
| 240 | Swarm, Fast, Tank | 5 |
| 300 | none (boss phase) | 0 |

### Boss
- Spawns at 5:00 off-camera. HP 1800, speed 70, contact dmg 30, radius 40.
- Every 4 s: 0.8 s telegraph (color flash), then charge toward player's
  position at 400 px/s for 0.6 s.
- Remaining regular enemies keep living but no new spawns.
- Boss death -> win.

### XP and level-up
- `xpToNext(level) = 10 + level * 5`. Gem = 1 XP.
- On level-up: pause, offer 3 random eligible perks. If fewer than 3 are
  eligible, offer what exists. If 0, grant +10 max HP silently and resume.
- Eligible = prerequisites owned AND current rank < maxRank.

### Spells (one per run, auto-cast)
All spells read a `SpellStats` object; perks mutate it. Base values below.

**Fire — Fireball.** Every `cooldown` s, fire `projectiles` projectiles at
nearest enemies (distinct targets when possible). On hit: `damage` to
target, then explode: `damage * 0.5` to all enemies within `aoeRadius`.
Base: cooldown 1.0, damage 12, aoeRadius 50, projectiles 1, speed 350,
burn 0.
- Power: +dmg (x3 ranks), Burn (dmg/s for 2 s, x2), Big Blast (+aoe dmg to 100%).
- Reach: +aoeRadius (x3), +range (x1).
- Utility: +1 projectile (x2), -cooldown (x2).

**Ice — Frost Nova.** Every `cooldown` s, ring pulse of `radius` around
player: `damage` to all in radius, apply slow `slowPct` for `slowDuration`.
Base: cooldown 1.4, damage 12, radius 90, slowPct 0.3, slowDuration 1.5,
freezeChance 0.
- Power: +dmg (x3), Freeze chance (full stop 1 s, x2), Shatter (+50% dmg to slowed).
- Reach: +radius (x3), +slowDuration (x1).
- Utility: +slowPct (x2), -cooldown (x2).

**Lightning — Chain Lightning.** Every `cooldown` s, `strikes` bolts each
hit nearest enemy for `damage`, then chain up to `chains` times to nearest
unhit enemy within `chainRange`, each chain `damage * 0.8`.
Base: cooldown 1.0, damage 12, chains 2, chainRange 120, strikes 1, stun 0.
- Power: +dmg (x3), Stun 0.3 s (x2), No falloff (chains do 100%).
- Reach: +chains (x3), +chainRange (x1).
- Utility: +1 strike (x2), -cooldown (x2).

**Earth — Orbiting Boulders.** `count` boulders orbit player at
`orbitRadius`, angular speed `orbitSpeed`. On overlap: `damage` and knockback
`knockback` px; per-enemy hit cooldown 0.4 s.
Base: count 3, orbitRadius 80, orbitSpeed 2.5 rad/s, damage 10,
knockback 60, size 14.
- Power: +dmg (x3), +knockback (x2), Crush (x2 dmg to Tanks).
- Reach: +orbitRadius (x3), +size (x1).
- Utility: +1 boulder (x2), +orbitSpeed (x2).

**Generic perks (all spells):** Move speed +10% (x3), Max HP +20 (x3),
Pickup radius +25% (x2).

Tiers: nodes within a branch are listed in tier order; node N+1 requires node N owned at rank >= 1. Each spell has 7 nodes (18–20 total ranks); with generics, a run can level ~25 times before perks run dry.

## 6. Rendering

Everything visual requests a `textureKey`. `render/textures.ts` builds each
key at boot from `config/colors.ts` using Phaser Graphics (circle / rect /
ring). Replacing with a sprite atlas later means loading the atlas in
`BootScene` and pointing the same keys at atlas frames; no entity code
changes.

Keys: `player`, `enemy_swarm`, `enemy_fast`, `enemy_tank`, `boss`, `gem`,
`proj_fire`, `fx_nova`, `fx_bolt`, `boulder`.

## 7. Error handling

- Config validated once at boot (perk prereqs exist, wave times ascending,
  positive stats). Fails loudly in dev console; game still starts.
- Pools never grow past cap; spawn requests beyond cap are dropped.
- All `Math.random` banned (lint rule); only `core/rng.ts`.
- Scene transitions always carry a full payload; `Result` falls back to
  `SpellSelect` if payload missing.

## 8. Testing

**Unit (Vitest, `src/core/**`):**
- `rng`: same seed -> same sequence.
- `xp`: curve values, level-from-total-xp.
- `perkOffer`: eligibility (prereq, maxRank), offer size 3 / fewer / zero,
  determinism under seed, no duplicates in one offer.
- `waveSchedule`: active wave at boundaries (59.9, 60, 300), spawn budget
  accumulates fractional spawns correctly.
- `damage`: chain falloff, slow stacking rule (max, not additive), knockback
  vector, boss-phase rules.
- `spellStats`: every perk id in every tree applies without throwing and
  changes exactly the intended field(s).

**Browser smoke (Playwright):**
- Load page -> SpellSelect visible -> click each spell -> Game scene runs
  with `?seed=1&timeScale=10` for 10 s -> HUD timer advanced, kills > 0,
  no console errors.
- One full run at high time scale reaches boss phase and Result scene.

**Manual (per ticket AC):** listed in tickets.

## 9. Open decisions (defaults taken)
- Run length 5:00 (extend later via `progression.ts`).
- Arena size 3000 x 3000 px, bounded.
- Boss has no minions.
