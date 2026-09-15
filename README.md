# Crimson Onslaught

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

## Getting started

Requires Node 20.19+ (or 22.12+).

```bash
npm ci
npm run dev        # local dev server (http://localhost:5173)
npm run build      # type-check + production build to dist/
npm run preview    # serve the production build locally
npm test           # unit tests (Vitest)
npm run test:e2e   # browser smoke tests (Playwright)
npm run lint       # ESLint (currently a strict type-check)
npm run format     # Prettier
```

`test`, `test:e2e`, `lint`, and `format` are declared now so the workflow is
stable; the tooling behind them lands with the lint/test ticket (CO-002).

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

## Documentation

- Design spec: [`docs/superpowers/specs/2026-09-14-phase1-design.md`](docs/superpowers/specs/2026-09-14-phase1-design.md)
- Ticket list: [`docs/tickets/phase1-tickets.md`](docs/tickets/phase1-tickets.md)
- Contributor workflow rules: [`CLAUDE.md`](CLAUDE.md)

## Contributing

One branch per issue, merged via pull request only. See `CLAUDE.md` for the
full workflow and the public-repo data rules.

## License

MIT — see [LICENSE](LICENSE).
