# Crimson Onslaught

[![CI](https://github.com/danhquach/crimsononslaught/actions/workflows/ci.yml/badge.svg)](https://github.com/danhquach/crimsononslaught/actions/workflows/ci.yml)
**Play the latest build:** <https://danhquach.github.io/crimsononslaught/>

A browser-based auto-battler "bullet heaven". You move; your spell fires on
its own. Survive five minutes of escalating waves, then bring down the boss.

Built with [Phaser 3](https://phaser.io/), TypeScript, and Vite.

## Status

Phase 1 — design complete, implementation in progress. Tracked as GitHub
issues under the **Phase 1** milestone. Placeholder shapes stand in for art
until the asset pass.

## Phase 1 at a glance

- One character, one arena, one run of 5:00 ending in a boss fight.
- Pick one of four spells before the run: **Fire** (fireball, area burst),
  **Ice** (frost nova, slow), **Lightning** (chain bolt), **Earth** (orbiting
  boulders).
- Level up to draw three random perks from that spell's tree: power, reach,
  or utility.
- Three enemy archetypes (swarm, fast, tank) on a time-based spawn schedule.
- Seeded runs: `?seed=<n>` reproduces a run exactly; `?timeScale=<n>` speeds
  it up for testing; `?invulnerable=1` drops contact damage so an unattended
  run reaches the boss.
- Dev switches: `?debug=textures` plays every atlas animation in a labelled
  grid; `?debug=collisions` runs the collision pairs on their own.

## Controls

|                    | Keyboard / mouse                                  | Gamepad                                         |
| ------------------ | ------------------------------------------------- | ----------------------------------------------- |
| Move               | WASD or arrow keys                                | Left stick (analog, deadzone 0.2) or D-pad      |
| Menus and overlays | Click, or the number keys / Enter shown on screen | D-pad or left stick to select, **A** to confirm |

Both input sources are live at once, and a pad plugged in mid-run is picked up
without a reload. Mouse and keyboard stay primary: nothing is highlighted until
a gamepad is actually used.

## Getting started

Requires Node 20.19+ (or 22.12+).

```bash
npm ci
npm run dev        # local dev server (http://localhost:5173)
npm run build      # type-check + production build to dist/
npm run preview    # serve the production build locally
npm test           # unit tests (Vitest)
npm run test:e2e   # browser smoke tests (Playwright)
npm run lint       # type-check + ESLint + Prettier check
npm run format     # Prettier (write)
```

`test:e2e` starts its own Vite dev server and drives Chromium; the first run
needs the browser installed once with `npx playwright install chromium`.

## Project layout

```
src/config/   tunable data: spells, perks, enemies, waves, boss, progression, player, gems, animations, FX
src/core/     pure game logic, no engine imports, unit-tested: run state, perks, spawn director, spell math
src/scenes/   Boot, SpellSelect, Game, HUD, LevelUp, Result, two dev-only debug scenes
src/entities/ Player, Enemy, Boss, XpGem, Projectile, Boulder
src/spells/   one Phaser-side class per spell over its `src/core/` math, plus the damage sink
src/systems/  Phaser-side wrappers: spawn director, collisions, enemy / gem / FX / overlay pools
src/render/   texture-key layer: sprite atlas, animation playback, placeholder shapes as fallback
scripts/      art pipeline (`npm run art:cut`)
docs/         design spec, ticket list, tuning notes, art sheets + manifest
```

## Rendering and the art pipeline

Nothing in the game references an image file. Every visual asks for a
**texture key** (`player`, `enemy_swarm`, `enemy_fast`, `enemy_tank`, `boss`,
`gem`, `proj_fire`, `fx_nova`, `fx_bolt`, `boulder`), typed as `TextureKey`
in `src/config/colors.ts`.

At boot, `src/render/atlas.ts` loads the sprite atlas and points each texture
key at a still frame from it; `src/render/textures.ts` then generates a
flat-colored placeholder shape for any key the atlas did not supply. So the
art can be migrated a key at a time, and the game still runs if the atlas
fails to load. No entity, spell, or scene code knows the difference — they
keep requesting the same keys.

Open `http://localhost:5173/?debug=textures` to page through every animation
in the atlas, labelled with its frame count and native size.

The hero, enemies, boss and gems play the atlas clips for what they are doing
(CO-081). Which clip — facing from the movement vector, hurt over walk, death
over everything — is decided in `src/core/animation.ts`, pure and unit-tested;
`src/render/animate.ts` plays it and re-centres the Arcade body on the frame's
anchor, so a frame of any size leaves the hitbox where the config's radius put
it. Spawn holds, hurt flashes and death clips run on the run clock, so a paused
run holds them and a missing atlas (one `[atlas]` warning) shortens them to
nothing.

The spells play their effects the same way (CO-082). One-shot bursts — the
fireball's cast flash and explosion, the nova pulse, the strike and impact of
a bolt, the boulder's impact and knockback dust — come from
`src/systems/FxPool.ts`, a pool of plain sprites that free themselves when
the clip ends. Status overlays — the flame on a burning enemy, the frost on a
slowed one, the block on a frozen one, the sparks on a stunned one — come from
`src/systems/OverlayPool.ts`, one per afflicted enemy, positioned from its
host every frame and freed when the status ends or the host dies; the pool is
capped at the enemy cap, and `GameScene.overlayCount` exposes the count to
the browser suite. A chain jump is a tiled `lightning.chain` strip stretched
between two enemies for one pass of the clip, cycled on the run clock. Which
overlay a status calls for, how big an effect is drawn for the live stats and
how a strip lies are `src/core/fx.ts`; the tunables are `src/config/fx.ts`.

### Regenerating the atlas

```
npm run art:cut
```

Reads the 18 authored sheets under `docs/art/sheets/` (source of truth, not
shipped) and writes `public/assets/atlas/props.png` + `props.json` and the
generated `src/config/frames.ts`. The run is deterministic: the same sheets
always produce byte-identical output, so a re-run with nothing changed leaves
a clean working tree.

`docs/art/sheets/manifest.json` is the single place that maps grid cells to
animation frames — which sheet, how many columns and rows, and what each row
holds. The script never hardcodes a sheet, so new art only needs a manifest
entry. It fails loudly, naming sheet/row/column, when a cell declared blank
holds art, a declared frame is empty, or art runs off a cell edge without the
row declaring `allowEdge`.

The cut itself lives in `scripts/lib/spriteCut.mjs` as pure functions over
RGBA buffers, unit-tested on synthetic pixel buffers in `spriteCut.test.mjs`.
`src/config/animations.ts` holds the animation list as pure data, cross-checked
against both the manifest and the generated atlas by `animations.test.ts`, so
the three cannot drift apart.

## CI and deployment

Every pull request runs `npm run lint`, `npm test`, `npm run build`, and the
Playwright smoke suite (`npm run test:e2e`) in GitHub Actions
(`.github/workflows/ci.yml`); a failed smoke run uploads its HTML report as a
workflow artifact. Pushes to `main` additionally
deploy `dist/` to GitHub Pages at the URL above. The deploy job needs the
repository's Pages source set to **GitHub Actions** (Settings → Pages); the
lint/test/build job does not depend on it.

## Documentation

- Design spec: [`docs/superpowers/specs/2026-09-14-phase1-design.md`](docs/superpowers/specs/2026-09-14-phase1-design.md)
- Ticket list: [`docs/tickets/phase1-tickets.md`](docs/tickets/phase1-tickets.md)
- Contributor workflow rules: [`CLAUDE.md`](CLAUDE.md)

## Contributing

One branch per issue, merged via pull request only. See `CLAUDE.md` for the
full workflow and the public-repo data rules.

## License

MIT — see [LICENSE](LICENSE).
