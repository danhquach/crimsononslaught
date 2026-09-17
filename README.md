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
  it up for testing.
- Dev switches: `?debug=textures` shows every placeholder texture in a row;
  `?debug=collisions` runs the collision pairs on their own.

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
src/config/   tunable data: spells, perks, enemies, waves, boss, progression
src/core/     pure game logic, no engine imports, unit-tested
src/scenes/   Boot, SpellSelect, Game, HUD, LevelUp, Result
src/entities/ Player, Enemy, Boss, XpGem, Projectile
src/spells/   one class per spell behind a shared interface
src/systems/  spawn director, perks, collisions, run state
src/render/   texture-key layer (placeholder shapes now, sprite atlas later)
docs/         design spec, ticket list, tuning notes
```

## Rendering and swapping in real art

Nothing in the game references an image file. Every visual asks for a
**texture key** (`player`, `enemy_swarm`, `enemy_fast`, `enemy_tank`, `boss`,
`gem`, `proj_fire`, `fx_nova`, `fx_bolt`, `boulder`), typed as `TextureKey`
in `src/config/colors.ts`. At boot, `src/render/textures.ts` generates a
flat-colored shape for each key with Phaser Graphics. Open
`http://localhost:5173/?debug=textures` to see all ten.

To replace the placeholders with a sprite atlas:

1. Put the atlas under `public/` (e.g. `public/art/atlas.png` + `atlas.json`).
2. In `BootScene.preload()`, load it:
   `this.load.atlas('art', 'art/atlas.png', 'art/atlas.json')`.
3. Name the atlas frames after the keys, then in `BootScene.create()`, before
   `generatePlaceholderTextures(this)`, copy each frame into a standalone
   texture of the same name:
   ```ts
   for (const key of TEXTURE_KEYS) {
     const frame = this.textures.getFrame('art', key);
     this.textures.createCanvas(key, frame.width, frame.height)?.drawFrame('art', key).refresh();
   }
   ```
4. `generatePlaceholderTextures` skips any key that already exists, so keys
   can be migrated one at a time; the rest keep their generated shapes.

No entity, spell, or scene code changes — they keep requesting the same keys.
If a texture needs animation later, add the frames to the atlas and drive
them with Phaser's animation manager keyed off the same `TextureKey`.

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
