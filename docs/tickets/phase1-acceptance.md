# Phase 1 acceptance checklist (CO-063)

Ticket: [#33](https://github.com/danhquach/crimsononslaught/issues/33) ·
Spec: `docs/superpowers/specs/2026-09-14-phase1-design.md` ·
Ticket list: `docs/tickets/phase1-tickets.md`

**Deployed build walked through:** `7fc01a92990f0c3ada38e76315d619e236d5aaec`
(`7fc01a9`, "fix: simulate the arena in 60 fps steps whatever the frame length
(#94) (#96)"), deployed to GitHub Pages 2026-09-18T01:37Z by CI run
[35295873488](https://github.com/danhquach/crimsononslaught/actions/runs/35295873488).

**URL:** https://danhquach.github.io/crimsononslaught/

**Deployed bundle:** `assets/index-BtVl1VYo.js`. `npm run build` at `7fc01a9`
emits a bundle of the same content hash, so the page being walked through is
that commit's build and not an older deploy.

**Walkthrough date:** 2026-09-17. **Result: every acceptance criterion below is
met. No bugs filed.** Two ACs could not be exercised end to end on the deployed
page; both are listed under [Gaps](#gaps-in-this-walkthrough) with what was
checked instead.

---

## How each line was checked

| Tag | Meaning |
|---|---|
| **page** | Observed on the deployed page. Driven in headless Chromium at the canvas's own size (960x540) by a scratch Playwright script — not committed, the same approach the CO-062 balance pass used — which clicks cards, holds keys and saves a screenshot per checkpoint for reading. Console errors and page errors were collected on every run: **zero** across all of them. |
| **suite** | `npm ci && npm run lint && npm test && npm run build && npm run test:e2e` from a clean install at `7fc01a9`: 31 test files / 410 unit tests, 6 browser checks, lint and build — all green. CI ran the same on the deploy commit. |
| **pixels** | Measured off the deployed page's own frames: each screenshot is drawn to a canvas in a second browser page and its placeholder colours counted, so an effect too brief to catch by eye is still evidence. |

The run-time hooks the checks lean on are the ones the spec already documents:
`?seed=`, `?timeScale=` and `?invulnerable=1`.

---

## Epic A — Project foundation

- [x] **CO-001** — `npm run dev` serves the title canvas; `npm run build` succeeds.
      **suite**: the browser checks boot the game through `npm run dev` and
      reach the titled scene; `npm run build` green. **page**: the deployed
      build of the same source boots the same way, black canvas, no errors.
- [x] **CO-002** — `npm run lint` and `npm test` pass; `Math.random()` in a scene
      fails lint. **suite**: both green. Adding `Math.random()` to
      `src/scenes/BootScene.ts` failed ESLint with
      `'Math.random' is restricted from being used` (`no-restricted-properties`);
      the probe line was reverted.
- [x] **CO-003** — Green check on a PR; deployed URL loads the title scene.
      CI is green on the deploy commit and the Pages deployment for it is live;
      the URL above loads SpellSelect.
- [x] **CO-004** — Same seed gives an identical sequence; `pick`/`shuffle`
      deterministic. **suite**: `src/core/rng.test.ts` (13). **page**:
      `?seed=1` logs `[rng] seed=1` and the seed is printed under the cards.
- [x] **CO-005** — Debug scene renders all 10 texture keys, each distinct.
      **page**: `?debug=textures` draws player, enemy_swarm, enemy_fast,
      enemy_tank, boss, gem, proj_fire, fx_nova, fx_bolt, boulder in a row, each
      labelled with its shape and size.

## Epic B — Scene flow

- [x] **CO-010** — The whole loop is clickable; no console errors. **page**:
      SpellSelect → Game (+ Hud) → LevelUp overlay → Result → "Play again" →
      SpellSelect, walked in one session with zero console errors.
- [x] **CO-011** — Each card starts Game with the right spell; keyboard and mouse
      both work. **page**: pressing `2` started Frost Nova; clicking card 4
      started Orbiting Boulders (three boulders orbiting, evenly spaced); the
      Result screen named the spell that had been chosen in each run.
- [x] **CO-012** — HUD values update live; boss bar appears only in the boss
      phase; the HUD survives a scene pause. **page**: timer, HP (100 → 52 → 19
      as the swarm closed in), XP bar, level, kills all moved live; no boss bar
      before 5:00 and a boss bar from the boss phase on; the HUD stayed drawn and
      readable while the level-up overlay held the run.
- [x] **CO-013** — Game frozen while the overlay is open; a pick applies and
      resumes; the zero-perk path is silent. **page**: two screenshots 3 s apart
      with the overlay open were byte-identical (timer, enemies and gems all
      still); pressing `1` applied the perk and the run resumed (0:25 → 0:32).
      Cards show name, branch, rank x/y and description. Zero-perk path —
      **suite**: `src/core/perkOffer.test.ts`, `src/core/perkSystem.test.ts`.
- [x] **CO-014** — Both outcomes render correct stats; the button works with
      mouse and Enter. **page**: **Victory** — 5:29, level 20, 1,020 kills,
      Fireball, eleven perks listed; **Defeat** — 0:43, level 2, 53 kills, Chain
      Lightning, one perk. Enter from the Result returned to SpellSelect.

## Epic C — Core run loop

- [x] **CO-020** — The player cannot leave the world; diagonal speed normalised;
      60 fps. **page**: holding up+left for 12 s pinned the player against the
      north edge and the camera stopped scrolling — a further 4 s moved it no
      further. The same 12 s did *not* reach the west edge 2,040 px away, which
      180 px/s on each axis would have covered in 11.3 s: the diagonal is
      normalised. 60 fps — see CO-022.
      Gamepad: see [Gaps](#gaps-in-this-walkthrough).
- [x] **CO-021** — Two hits inside 0.5 s deal damage once; HP 0 emits `died`
      once. **suite**: `src/core/health.test.ts` (15). **page**: HP fell in
      steps while standing in the swarm (100 → 52 → 19), the player showed the
      damage flicker, and hitting 0 ended the run in a single Defeat screen.
- [x] **CO-022** — 300 enemies hold 60 fps; the 301st spawn is a no-op; contact
      damage cadence. **page**: `requestAnimationFrame` sampled in the page for
      3 s at four points of a full run — the last of them at 6:01, deep in the
      boss phase with the arena at its fullest — returned **60, 60, 60, 60
      fps**. Cap and cadence — **suite**:
      `src/core/enemy.test.ts`, `src/config/enemies.test.ts`.
- [x] **CO-023** — Swarm drops 1 gem, Tank 3; gems collected raise XP. **suite**:
      `src/core/gems.test.ts` (10). **page**: gems drop where enemies die, drift
      to the player inside the pickup radius and the XP bar and level move with
      them (`?debug=collisions` counts the pickups on its own).
- [x] **CO-024** — Boundary and budget unit tests. **suite**:
      `src/core/waveSchedule.test.ts` (11), `src/config/waves.test.ts` (6).
- [x] **CO-025** — Seeded spawns repeat; nothing is spawned on camera. **suite**:
      `src/core/spawnDirector.test.ts` (14). **page**: across every frame read,
      each new enemy was first seen at the edge of the view — none was caught
      appearing inside it — and the late-wave mix is the table's (swarm circles,
      fast triangles and tank squares together at 4:34).
- [x] **CO-030** — Phase transitions and event payloads. **suite**:
      `src/core/runState.test.ts` (36), `src/core/runEvents.test.ts` (5).
      **page**: the timer tracked wall clock at `timeScale=1` (0:04 after 4 s),
      the boss phase began at 5:00 and the run ended in `over`.
- [x] **CO-031** — XP curve, carry-over, multi-level. **suite**:
      `src/core/xp.test.ts` (10), `src/core/levelUp.test.ts` (10). **page**: a
      hands-off run reached level 20 with the overlay offering a pick per level.
- [x] **CO-032** — No overlap registration outside `CollisionSystem`; all pairs
      fire. **page**: `?debug=collisions` on the deployed build turned all three
      counters green — enemy↔player, gem↔player, spell↔enemy. **suite**:
      `src/core/collisionWiring.test.ts`, `src/core/wiring.test.ts`.

## Epic D — Spells and perks

- [x] **CO-040** — Every perk id applies without throwing and changes only its
      own field; validation catches a bad prereq. **suite**:
      `src/core/spellStats.test.ts` (17), `src/config/perks.test.ts` (6).
- [x] **CO-041** — Prereq and maxRank gating, offer sizes 3/2/1/0, no duplicates,
      deterministic. **suite**: `src/core/perkOffer.test.ts` (18).
- [x] **CO-042** — Move Speed x3 gives 180·1.1³; a spell perk changes the next
      cast. **suite**: `src/core/perkSystem.test.ts` (13). **page**: generic
      perks landed visibly — max HP read `100 / 140` after two Vitality picks,
      and the Victory screen listed the whole set that had been applied.
- [x] **CO-043** — A stub spell fires exactly on cooldown at time scale 1 and 10.
      **suite**: `src/core/spell.test.ts` (23), `src/config/spells.test.ts` (10).
- [x] **CO-044** — Fire: AoE kills on a cluster; AoE and burn maths. **suite**:
      `src/core/fireball.test.ts` (18). **page**: fireballs are visible in
      flight, travelling out from the player toward the crowd; a fire run stood
      at 56 kills by 0:45 on about 45 casts — more kills than casts, which is
      the blast — and the Victory run cleared 1,020.
- [x] **CO-045** — Ice: slow stacking and shatter; enemies slow inside the ring
      only. **suite**: `src/core/frostNova.test.ts` (26). **page**: the ring
      pulse is drawn around the player at its current radius, and an unattended
      ice run cleared its way to the boss phase and took the boss to about 15%
      of its HP, so the ring is dealing its damage on the deployed build.
- [x] **CO-046** — Lightning: chain target selection and falloff; a visible chain.
      **suite**: `src/core/chainLightning.test.ts` (29). **page**: a lightning
      run killed 56 by 0:45 with no projectile ever crossing the screen — the
      chain is what is killing; the bolt line itself is shorter-lived than the
      frame sampling (see [Gaps](#gaps-in-this-walkthrough)).
- [x] **CO-047** — Earth: knockback vector and Crush; boulders evenly spaced and
      re-spaced by the count perk. **suite**: `src/core/orbitingBoulders.test.ts`
      (21). **page**: three boulders orbit the player 120° apart from the first
      second of an earth run.

## Epic E — Boss and run end

- [x] **CO-050** — A telegraph before every charge; direction locked at the end
      of it; the boss takes spell damage. **pixels**: 12 s of the boss fight
      sampled frame by frame at `timeScale=2` shows the whole cycle. Chasing —
      about 2,090 purple ring pixels whose centre creeps 109 px in 0.79 s of
      wall clock, i.e. ~69 px/s of run time against the spec's 70. Telegraph —
      for seven consecutive frames the purple count falls to 0 while the white
      count jumps from 557 (the player alone) to 2,482, and the centre does not
      move at all: the ring has filled white and the boss has stopped. That
      window is ~0.8 s of run time. Charge — the purple returns and the centre
      crosses ~160 px in a quarter second along one straight line, an order
      above its chase speed, then the cycle repeats. **suite**:
      `src/core/boss.test.ts` (15), `src/config/boss.test.ts` (4). **page**: the
      boss HP bar fell steadily under fire and reached zero.
- [x] **CO-051** — A run at high time scale reaches the boss at 5:00; killing it
      shows Win; dying shows Lose. **page**: both, on the deployed build. No
      boss and no boss bar at 4:34; boss on screen with its bar by 5:08 and 5:15
      in two separate runs; a fire run ended in **Victory** at 5:29, and an
      unattended lightning run in **Defeat** at 0:43.

## Epic F — Verification

- [x] **CO-060** — Smoke passes locally and in CI, wired into the workflow.
      **suite**: four browser checks (one per spell) green locally; CI runs
      `npm run test:e2e` on every push and PR.
- [x] **CO-061** — Full run to a Result in CI under 90 s. **suite**: fire 26.3 s,
      earth 30.3 s; green on the deploy commit's CI run.
- [x] **CO-062** — Tuning doc filled with per-spell outcomes; config-only
      changes. `docs/tuning/phase1-balance.md` records all four spells across
      four rounds.
- [x] **CO-063** — This checklist, ticked against the deployed build hash above.

---

## Gaps in this walkthrough

Neither is a defect in the build; both are limits of what the deployed page can
be made to show from a script, and both are recorded here rather than ticked
quietly.

1. **Gamepad input (part of CO-020).** No controller was attached to the machine
   doing the walkthrough, so the stick, the deadzone, the D-pad and hot-plugging
   were not exercised on the deployed page. Covered by `src/core/input.test.ts`
   (20 cases) over the same pure input helper the scenes read, and both menus
   print the gamepad prompt. Worth one hands-on pass with a pad before Phase 2
   leans on it.
2. **The chain's bolt line (the manual half of CO-046).** The bolt is drawn for
   a fraction of a second and fell between frames at 220 ms sampling, so the
   "visible chain across 3 enemies" was not photographed. The chain's effect is
   evidenced above by kill rate and by `src/core/chainLightning.test.ts` (29
   cases). The other three spells' effects were all seen on the page: the
   fireball in flight, the frost ring, and the boulders in orbit.

## Reproducing this walkthrough

```
https://danhquach.github.io/crimsononslaught/?seed=1                  # spell select, seeded
https://danhquach.github.io/crimsononslaught/?debug=textures          # CO-005
https://danhquach.github.io/crimsononslaught/?debug=collisions        # CO-032
https://danhquach.github.io/crimsononslaught/?seed=1&timeScale=20&invulnerable=1   # CO-051, a run to Victory
https://danhquach.github.io/crimsononslaught/?seed=3&timeScale=2&invulnerable=1    # CO-050, the boss cycle at a readable pace
```

Clear the level-up overlay with `1` as it appears, or the run holds there —
that pause is itself CO-013's acceptance criterion.
