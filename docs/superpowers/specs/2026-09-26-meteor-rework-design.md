# Meteor rework: a diagonal fall, a blast that falls off, and a burning pond

Design approved 2026-09-26. Ticket: CO-167 (#258). Supersedes the Meteor paragraph
and the `fire_meteor` column of the Phase 2 spec (`2026-09-18-phase2-spells.md`
§9.2); that spec gets a pointer here when this lands.

## 1. Why

Meteor was specified as "falls from the sky onto a nearby target" (#140), and
the falling body was drawn and cut into the atlas (`fire.meteor`, #145, PR #178).
The strike ticket (#138) only asked for a telegraph ring and the landing burst,
so no code ever draws the body. In a run, Meteor is an orange ring on the ground
followed by an explosion.

## 2. What the player sees

1. **Cast.** Nothing appears on the ground. A flaming meteor (`fire.meteor`, the
   4-frame loop already in the atlas) enters from the upper left and travels in a
   straight line to the committed impact point. Its path is 35° off vertical, and
   the sprite is rotated to face along that path, rock first and flame trailing.
2. **Impact.** When the fall time is up, the meteor disappears on the point and
   `fire.explode` plays there. The explosion's art spans the blast diameter
   (drawn at `2 × aoeRadius` across), not the shared `explosionScale`.
3. **Magma pond.** At the moment of impact a small pool of molten magma is left
   on the ground, drawn under the crowd with the new `fire.pond` art (§5). It has
   no ring, rim or outline. It loops for its lifetime and fades out over the last
   0.3 s.

## 3. Rules

| Rule | Value |
|---|---|
| Fall path | Straight line into the impact point from 300 px back along the heading, which points down-right at 35° off vertical. The meteor moves at constant speed and reaches the point exactly when `fallDelay` ends. |
| Ground marker | None. The telegraph ring is no longer drawn. |
| Blast | Every enemy within `aoeRadius` of the point takes `damage × falloff(d)`: `1` at the centre down to `aoeEdgeFactor` at the rim, linear in distance `d`. Beyond `aoeRadius`, nothing. A blast hit may crit. |
| Pond | A ground area (`AreaPool`, drawn ringless with `fire.pond`) centred on the point, radius `pondRadius`, lasting `pondDuration`. Every `pondTickRate` it deals `pondTickDamage` to every enemy inside. Ticks are `tick` hits and never crit. |
| Who the pond hurts | Enemies only. Spell damage goes through `DamageSink`, which takes an `Enemy`, so neither the blast nor the pond can reach the player. |
| Snapshot | Every number a strike uses, pond included, is read once at the cast (Phase 2 spec §6.2). |
| Caps | At most `MAX_LIVE_TELEGRAPHS` (8) meteors in the air. Past the cap a cast is dropped, as today. Ponds share `MAX_LIVE_AREAS` (16) with Ice Storm and Earthquake. A pond dropped at the cap still leaves the blast intact. |
| Targeting | Unchanged: nearest enemy within `targetRange`, point scattered by `METEOR_SCATTER_PX` through the seeded RNG, and the cast waits with no target in range (#212). |

## 4. Stats

The new `fire_meteor` block. Changed or new fields are marked.

| Field | Base | Category (§6.1) | Scaled by |
|---|---|---|---|
| `cooldown` | 3.2 | cooldown | Haste |
| `damage` | 60 | damage | Power |
| `aoeRadius` | **70** (was 130) | area | Expanse |
| `aoeDamageFactor` | 1.0 | unscaled | — |
| **`aoeEdgeFactor`** | **0.4** | unscaled (fraction) | — |
| `projectiles` | 1 | unscaled | — |
| `targetRange` | 189 | area | Expanse |
| `fallDelay` | 1.0 | cooldown | Haste |
| **`pondRadius`** | **45** | area | Expanse |
| **`pondDuration`** | **1.5** | duration | Persistence |
| **`pondTickDamage`** | **5** | damage | Power |
| **`pondTickRate`** | **0.5** | unscaled | — |

These are the multipliers the passives already apply. At 5 Haste ranks the fall
takes 0.66 s; at 3 Expanse ranks the blast reaches 98 px and the pond 63 px; at
3 Persistence ranks the pond lasts 2.28 s. The new fields must be added to
`config/spellFields.ts`, or boot validation rejects the block (Phase 2 spec §12).

The level-up card changes to the following:

- Description: "Drops a meteor on the nearest enemy. It hits hardest at the centre and leaves a burning pool."
- Stats: Cooldown 3.2 s, Damage 60, Blast radius 70, Falls in 1 s, Pool 1.5 s.

## 5. Art

- **Falling body:** `fire.meteor`, already cut (35 × 76 frames, `props3`). It
  needs no new art, only rotation when drawn.
- **Pond:** a new sheet, `docs/art/sheets/CO-167/fire_meteor_pond.png`, from the
  approved concept A with a smaller molten centre. It's a 2 × 2 grid of 768 px
  cells, one 4-frame simmer loop cut centred as `fire.pond`, the same layout as
  the Ice Storm and Earthquake patches. The prompt goes in
  `docs/art/prompts/CO-167-meteor-pond.md`. The generated candidate has two known
  problems to fix before the cut:
  - The drawing's centre drifts between cells (x ±20 px, y ±23 px). Shift each
    cell's pixels to a common centre.
  - The JPEG left a pink fringe. Snap it to magenta (`b > g + 20` on fire art).
  Strip any C2PA chunk before the first push. Adding the sheet re-quantises its
  whole atlas page, so prove the scope by cutting with and without it.
- **Telegraph ring:** `fire.meteorMark` is no longer drawn. It stays in the atlas
  in this ticket; removing it is a separate cleanup.

## 6. Code shape

- `core/skyStrike.ts` (pure):
  - `blastFalloff(distance, radius, edgeFactor)` returns the damage multiplier.
  - `fallPosition(impact, progress)` returns the meteor's position at `progress`
    0–1 along the 35° path.
  - `strikeTargets` is unchanged.
- `systems/TelegraphPool.ts`: keeps the timing and the cap. It draws a rotated,
  animated `fire.meteor` sprite at `fallPosition` each step, above the crowd at
  `FX_DEPTH`, instead of a still ring. Renaming the class is out of scope.
- `spells/MeteorSpell.ts`: on landing it applies the falloff per enemy, plays the
  explosion at the diameter scale, and places the pond through `AreaPool`, with a
  tick that damages the enemies inside through `DamageSink` as `tick`.
- `systems/AreaPool.ts`: needs an end-of-life fade for a clip-drawn, ringless patch
  (0.3 s). It is the only new area behaviour.
- `config/strikes.ts`: holds the new base block, the path angle and length, and
  the card.

## 7. Tests

- **Unit (Vitest, `src/core/**`):**
  - The falloff is 1 at `d = 0`, `aoeEdgeFactor` at `d = aoeRadius`, linear
    between, and nothing beyond.
  - `fallPosition` starts 300 px back on the 35° heading and ends on the impact
    point.
  - `effectiveStats` scales `fallDelay` with Haste, `aoeRadius` and `pondRadius`
    with Expanse, `pondDuration` with Persistence, and `pondTickDamage` with Power,
    and leaves `aoeEdgeFactor` and `pondTickRate` untouched.
  - The field map covers every new field.
- **Browser (`e2e/meteor.spec.ts`, reworked):**
  - While a strike is live, a meteor sprite is on screen and moving toward its
    point, and nothing is drawn at the point.
  - After the landing, a pond is live at the point and has ticked at least one
    enemy.
  - The pond is gone once its duration has run out.
  - Enemies nearer the centre took more blast damage than enemies near the rim.
  - The fps floor (20) still holds.
  - Read the report and the HUD in one `evaluate`, and log counts over 3 runs
    (small-area sampling).
- **Look:** headless in-game screenshots of the fall, the impact and the pond,
  attached to the PR.

## 8. Out of scope

- Other strike spells, and renaming `TelegraphPool`.
- Removing `fire.meteorMark` from the atlas.
- Retuning other spells. #147's balance pass may still revisit these numbers.
