# Epic H — Standards & tech debt

Filed 2026-09-17 to milestone "Phase 1". Source: a coding-standards review of the
tree at `ed83f9e` (CO-043 merged) against `CLAUDE.md`, spec §4 and `README.md`.

Spec: `docs/superpowers/specs/2026-09-14-phase1-design.md`
Phase 1 feature tickets: `docs/tickets/phase1-tickets.md`

Legend: **Deps** = must be merged first. **AC** = acceptance criteria (in the issue).

---

## The tickets

| Ticket | Issue | Priority | Milestone | Deps | Summary |
|---|---|---|---|---|---|
| CO-090 | [#73](https://github.com/danhquach/crimsononslaught/issues/73) | P1 | Phase 1 | — | Lint-enforce the core/config purity rule (no engine imports) |
| CO-091 | [#74](https://github.com/danhquach/crimsononslaught/issues/74) | P2 | Phase 1 | — | `Player` owns its move speed behind a setter, not a public field |
| CO-092 | [#75](https://github.com/danhquach/crimsononslaught/issues/75) | P2 | Phase 1 | CO-091 | `Player` owns its pickup radius instead of `GameScene` passing it through |
| CO-093 | [#76](https://github.com/danhquach/crimsononslaught/issues/76) | P2 | Phase 1 | CO-092 | Move numeric tunables out of `src/core` into typed config modules |
| CO-094 | [#77](https://github.com/danhquach/crimsononslaught/issues/77) | P3 | Phase 1 | CO-093 | Reconcile the spec §4 and README file trees with the actual layout |

Priority scale: **P1** blocks work that is about to start · **P2** must land before a
named Phase 1 ticket · **P3** cleanup, no downstream ticket depends on it.

---

## Implementation order

These interleave with the remaining Phase 1 feature tickets. Read top to bottom.

| # | Ticket | Why here |
|---|---|---|
| 1 | **CO-090** (P1) | Before the four spell tickets, each of which adds `src/core/` modules. Landing the guard afterwards means reviewing four PRs by eye for a rule a linter should check. |
| 2 | CO-044…047 | The four spells (existing tickets, unchanged). |
| 3 | **CO-091** (P2) | Touches `Player` + `GameScene.applyPlayerStats`. Do it before the boss lands more code in `GameScene`. |
| 4 | **CO-092** (P2) | Same two files as CO-091 — adjacent so the second PR rebases cleanly on the first. |
| 5 | CO-050, CO-051 | Boss entity and phase orchestration (existing tickets, unchanged). |
| 6 | **CO-093** (P2) | Before CO-062. That ticket's AC is "config changes only, no code" — impossible while player HP, pickup radius and the XP curve live in `src/core/`. |
| 7 | CO-060, CO-061 | Playwright smoke suites (existing tickets, unchanged). |
| 8 | CO-062 | Balance pass — now genuinely config-only. |
| 9 | **CO-094** (P3) | Last. CO-090…093 each change the tree; documenting before they land means writing it twice. Must precede CO-063 so the acceptance walkthrough follows a true tree, and precede Phase 2 / CO-080 so the art tickets reference real paths. |
| 10 | CO-063 | Phase 1 acceptance checklist (existing ticket, unchanged). |

Critical path unchanged apart from the insertions:
`090 -> 044…047 -> 091 -> 092 -> 050 -> 051 -> 093 -> 060 -> 061 -> 062 -> 094 -> 063`

---

## What prompted each ticket

Findings from the review, in the order they were found. All five are deviations from
a rule the repo already states in writing — none is a new convention.

1. **CO-091** — `Player.speed` is a public mutable field written from outside
   (`GameScene`). Every other entity stat is read-through: `Enemy` reads
   `ENEMY_ARCHETYPES` on each access, `Player.hp` / `maxHp` are getters over a
   private `HealthState`. `speed` is the one stat any caller can corrupt.
2. **CO-092** — Pickup radius is a player stat in spec §5 and a generic perk in
   CO-042, but `Player` has no member for it; `GameScene` reads it from the perk
   system each frame. Two of the three generic perks land on the entity, one bypasses it.
3. **CO-093** — Spec §4 puts all tunable content under `src/config/`. Player HP and
   speed, the gem constants, the contact-damage interval, the spawn ring margin and
   the XP curve are all in `src/core/` instead.
4. **CO-094** — Spec §4 and the README layout block both list `systems/RunState.ts`,
   `systems/PerkSystem.ts`, `spells/Spell.ts` and `core/damage.ts`. None exists at
   that path. The moves were correct; the docs are stale.
5. **CO-090** — "no Phaser imports in `src/core/**`" is stated in four documents and
   enforced by none. ESLint bans only `Math.random`. The tree complies today with
   nothing keeping it that way.

## Not findings

Recorded so they are not re-raised:

- `Player` / `Enemy` / `XpGem` *are* classes, as spec §4 and the tickets require
  (`Boss` is specced to extend `Enemy`). The thin-entity pattern — state and math in
  `src/core/`, the entity only moving the sprite — is the documented architecture,
  not a deviation.
- `Boss.ts`, `Projectile.ts`, `src/spells/`, `config/boss.ts` are absent because
  CO-044…050 are unbuilt, not because they were skipped.
- The texture-key rule (`README`, spec §6) is followed: nothing references an image
  file, every visual requests a `TextureKey` from `config/colors.ts`.
- No `Math.random` outside `src/core/rng.ts`; every `src/core/*.ts` has a paired
  `*.test.ts`. Suites green at `ed83f9e`: 25 files, 290 tests, lint and build clean.
