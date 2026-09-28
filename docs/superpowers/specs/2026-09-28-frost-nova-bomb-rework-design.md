# Frost Nova Bomb rework: a spinning ice urchin that sprays icicles and bursts in the pack

Design approved 2026-09-28. Ticket: CO-182 (#303). Supersedes the Frost Nova Bomb
row and the `ice_nova_bomb` column of the Phase 2 spec (`2026-09-18-phase2-spells.md`
§9.3); that spec gets a pointer here when this lands.

## 1. Why

- **It misses.** The bomb flies at the nearest enemy and bursts on the first one it
  touches: often a lone runner at the front, or empty ground once its target steps
  aside. Many bursts catch one enemy or none.
- **Ice Storm makes it pointless.** Both land on the same crowd near the player. The
  storm slows harder (50% against 40%), slows don't stack, and the bomb's 24 damage
  lands on enemies the storm is already killing. Taking both feels like taking the
  storm alone.

The rework gives the bomb its own job: a slow rolling lane of icicle damage through
the crowd, ending in a burst inside the pack. The storm is a patch; the bomb is a line.

## 2. What the player sees

1. **Throw.** A spiky ball of clear blue icicles (`ice.urchin`, concept A) leaves the
   player toward the densest group and rolls slowly in a straight line, spinning.
2. **Spray.** As it rolls it throws icicles (`ice.icicle`) outward in a turning
   spiral: two at a time, opposite each other, the pair turning a little with every
   throw. An icicle that hits an enemy breaks on it.
3. **Burst.** Once the bomb has rolled clear of the player and its ring would catch a
   group, or at the end of its range, it bursts
   (`ice.spikeRing`): a white frost shockwave spreads to the burst radius and jagged
   ice spikes erupt from the stones around its rim, then shatter. The ring's art spans
   the burst radius.

## 3. Rules

| Rule | Value |
|---|---|
| Cast | Every `cooldown` s, and only while an enemy is within `range` (the cast waits otherwise, #212, as today). |
| Aim | Toward `densestSpot(caster, live enemies, radius, range, rng)` (`core/groundArea.ts`, the rule Ice Storm places by). If that spot is the caster itself, aim at the nearest enemy instead. |
| Flight | A straight line along the aim at `speed`, for at most `range` px. The bomb has no hitbox: it passes through enemies and never bursts on contact. |
| Spin | The bomb sprite turns at `BOMB_SPIN_DEG_PER_S` (540°/s). This is look only. |
| Icicle throws | The first throw is `throwInterval` s after the launch, then one every `throwInterval` s until the burst. Each throw sends `icicles` icicles spaced evenly round the circle (2 → opposite each other). The whole set turns by `ICICLE_SPIRAL_STEP_DEG` (40°) per throw, starting from the aim direction plus 90°. The burst check runs before the throw, so a step that bursts throws nothing. |
| Icicle | Leaves the bomb's position at `icicleSpeed` and expires after `icicleRange` px. It breaks on the first enemy it overlaps. That enemy is slowed by `slowPct` for `slowDuration` s (no freeze roll) and then takes `icicleDamage` as a `hit`: chill first, then damage, the way every Ice hit lands. |
| Burst trigger | The bomb can't burst before it has rolled `BURST_ARM_DISTANCE` (120 px, 1.5 s at the base speed, 6 throws). After that it bursts at the first step where at least `BURST_TRIGGER_COUNT` (3) live enemies are within its burst `radius`, or where its `range` runs out, whichever comes first. A lone runner can't set it off, and neither can a crowd at the player's feet. |
| Burst | Every live enemy within `radius` of the bomb gets the existing `bombFrost` (slow plus one freeze roll per enemy) and then takes `damage` as a `hit`. This is today's pulse, unchanged. |
| Snapshot | A bomb reads its stats once, at the throw (Phase 2 spec §6.2): the roll, the throws and the burst use that block. An icicle already in the air reads the live block when it lands (about 0.34 s of flight), the way Ice Arrow's arrows do. |
| Caps | `MAX_LIVE_BOMBS` 8 bombs in the air, as today. Icicles have their own pool, `MAX_LIVE_ICICLES` (32). A throw past either cap is dropped, never queued. |
| RNG | Only `densestSpot`'s tie-break and the burst's freeze rolls draw from the run's RNG. The spray draws nothing. |

## 4. Stats

The new `ice_nova_bomb` block. Changed or new fields are marked.

| Field | Base | Category (§6.1) | Scaled by |
|---|---|---|---|
| `cooldown` | **3.5** (was 2.2) | cooldown | Haste |
| `damage` | 24 | damage | Power |
| `radius` | 110 | area | Expanse |
| `speed` | **80** (was 220) | speed | Velocity |
| `range` | **240** (was 135) | area | Expanse |
| `slowPct` | 0.4 | unscaled | — |
| `slowDuration` | 2 | duration | Persistence |
| `freezeChance` | 0.15 | unscaled | — |
| `freezeDuration` | 1 | duration | Persistence |
| **`throwInterval`** | **0.25** | cooldown | Haste |
| **`icicles`** | **2** | unscaled (count) | — |
| **`icicleDamage`** | **14** | damage | Power |
| **`icicleSpeed`** | **320** | speed | Velocity |
| **`icicleRange`** | **110** | area | Expanse |

- A full flight takes 3 s and makes 11 throws, which is 22 icicles.
- An icicle does 14 damage, more than Ice Arrow's 10 ("decent damage, not chip").
- The new fields must be added to `config/spellFields.ts`, or boot validation
  rejects the block (Phase 2 spec §12).
- `BOMB_SPIN_DEG_PER_S`, `ICICLE_SPIRAL_STEP_DEG`, `BURST_TRIGGER_COUNT`,
  `BURST_ARM_DISTANCE` and `MAX_LIVE_ICICLES` are constants in `core/frostNova.ts`,
  not stats. No passive reaches them.
- These numbers are the starting point. The balance check in §7 may retune
  `cooldown`, `icicleDamage` and `throwInterval`, and the final values go in this
  table.

The level-up card changes to the following:

- Description: "Rolls a spinning ice bomb through the crowd. It sprays icicles, then bursts into a freezing ring."
- Stats: Cooldown 3.5 s, Icicles 14 each, Burst 24 in 110, Slow 40% for 2 s, Freeze 15% for 1 s.

## 5. Art

This follows the approved concept A: an ice urchin with a ring of erupting spikes.
All sheets are generated with Pollinations `openai/gpt-image-2` under the house rules
(`docs/art/prompts/_shared.md`), on flat magenta. The prompts go in
`docs/art/prompts/CO-182-frost-nova-bomb.md`, one self-contained `text` block per
sheet.

| Sheet | Grid | Clip(s) | Notes |
|---|---|---|---|
| `docs/art/sheets/CO-182/ice_urchin.png` | 2 × 1 | `ice.urchin` (1 frame), `ice.icicle` (1 frame) | Cell 1: a round urchin of clear blue icicles with a white core, symmetric so it reads at any spin angle, 27 × 28 px native. Cell 2: one icicle dart pointing right, lying along the anchor row (the game turns it to its flight), 27 × 7 px native. |
| `docs/art/sheets/CO-182/ice_spike_ring.png` | 3 × 2 | `ice.spikeRing` (6 frames, once) | 1 a white flash at the centre; 2 a thin frost shockwave ring; 3 short spikes rising around the rim; 4 full jagged spikes around the rim; 5 spikes cracking apart; 6 a few scattered shards, faint but visible. The ring's rim sits 61 px from the anchor (`SPIKE_RING_SCALE_RADIUS`), so the burst is drawn at `radius / 61` with its rim on the radius it reaches. The ring is near round (aspect 0.85), like the other ground rings. The inside of the ring stays open floor, never a frosted disc: a solid disc read as "ice pond" on CO-144. |
| `docs/art/sheets/CO-154/icons_ice.png`, cell 2 | spliced | `icon.ice_nova_bomb` | The icon is redrawn as the urchin, so the card matches the spell. Only that cell's pixels are spliced in; the other four icons stay byte-identical. |

- Both CO-182 sheets go on their own atlas page, 18, so no existing page is
  re-quantised except page 10, which holds the icon.
- What each delivered file needed is recorded in `docs/art/prompts/CO-182-frost-nova-bomb.md`:
  the ring sheet came back off its grid and as a flat ellipse, and both sheets had a
  pink JPEG tint.

- **Ice Shield** still bursts with `ice.nova`, so that clip stays in the atlas. Only
  the bomb stops using it.
- **Checks on the delivered pixels**:
  - Run the cutter's per-cell probe on every sheet before wiring.
  - Snap the magenta fringe.
  - Centre each cell's drawing, since the model drifts across frames.
  - Zoom a headless in-game screenshot at game scale over the dark floor.
  - Strip any C2PA chunk before the first push.
  - Adding sheets re-quantises their atlas pages. Judge palette error against the
    pre-quantise atlas, not drift against main.
- **No-atlas runs (#179):** give the bomb and the icicle placeholder textures in
  `config/colors.ts` (`proj_nova_bomb`, a circle, and `proj_icicle`, a thin diamond),
  mapped in `config/animations.ts` the way `proj_ice` is. Without the atlas the burst
  draws nothing, as `ice.nova` did (`FxPool.burst` needs the atlas); the burst still
  lands.
- **Sound:** the throw keeps `cast.ice_nova_bomb`. The icicles and the burst get no
  new sound in this ticket.

## 6. Code shape

- `core/frostNova.ts` (pure, Vitest):
  - `bombAim(caster, enemies, radius, range, rng)` returns a unit heading.
  - `throwAngles(aimDeg, throwIndex, icicles)` returns the icicle headings for one
    throw.
  - `shouldBurst(bomb, enemies, travelled, range, radius)` applies the trigger rule.
  - `icicleFrost(stats)` returns the icicle's `FrostHit`, with no freeze.
  - `pulseTargets`, `bombFrost` and `rollFreeze` are unchanged. `bombTarget` goes
    once nothing calls it.
- `spells/NovaBombSpell.ts`:
  - The bomb pool stops registering with `CollisionSystem`. Bombs move on Arcade
    velocity, spin, count their throws and check `shouldBurst` in `tick`.
  - A second `Projectile` group of icicles registers with `CollisionSystem` for
    first-hit damage.
  - The burst plays `ice.spikeRing`, scaled to `radius`.
  - Test hooks keep `hits` and `detonations`, and add `icicleHits` plus the per-burst
    caught counts (`burstCaught: number[]`), so e2e can tell whether most bursts
    caught a group.
- `config/iceRoster.ts`: the new base block and the card.
- `config/spellFields.ts`: the new fields' categories.
- `config/animations.ts`, `config/colors.ts`, `docs/art/sheets/manifest.json` and the
  generated `config/frames.ts` and atlas pages: the new clips and placeholders.

## 7. Tests and checks

- **Unit (Vitest, `src/core/**`):**
  - `bombAim` points at the densest group, not at a nearer lone enemy. It falls back
    to the nearest enemy when the densest spot is the caster, and draws from the RNG
    only on a tie.
  - `throwAngles` returns 2 opposite headings for the first throw, turned 90° off the
    aim, and each later throw turns 40° more. `icicles` 3 spaces them 120° apart.
  - `shouldBurst` is false before `BURST_ARM_DISTANCE` whatever the crowd; once armed,
    it is false with 2 enemies within `radius` and true with 3; and it is true at
    `range` with none.
  - An icicle hit slows first, then damages, and never freezes.
  - `effectiveStats` scales `throwInterval` with Haste, `icicleDamage` with Power,
    `icicleSpeed` with Velocity and `icicleRange` with Expanse, and leaves `icicles`
    untouched. The field map covers every new field.
  - The card matches the stat block.
- **Browser (`e2e/iceRoster.spec.ts`, reworked):**
  - The crowd is the run's own enemy mix from 5:00 (`?startAt=300`). Swarm alone
    (`?enemies=swarm`) dies to Ice Arrow in one hit, which left 0–3 enemies in the
    bomb's range.
  - The bomb sprite's rotation changes between samples while it moves.
  - Icicle hits are at least as many as bursts: every flight rolls the arming
    distance, so every flight sprays.
  - At least one burst catches ≥3 enemies. Log the per-burst counts before asserting.
  - "Most bursts on a group" is not asserted in the browser suite. An invulnerable
    player standing still is mobbed, and a bomb armed 120 px out has left most of
    that crowd behind: 5–8 of 16 bursts caught 3 or more over three runs.
  - Read the report in one `evaluate`.
  - The fps floor (20) still holds.
- **Group share, measured with the kiting balance bot** (mortal, Ice, Frost Nova Bomb
  forced in, 10 minutes of run, seeds 1–3):
  - Bursts that caught 3 or more: 120 of 219, 119 of 187 and 136 of 205 (55–66%).
  - Icicle hits: 700, 685 and 775, about 3.5 per bomb.
  - Recorded in `docs/tuning/phase2-balance.md`.
- **Balance (the 20-minute bot sweep, `docs/tuning/phase2-balance.md` method):**
  - Compare Ice Storm alone with Ice Storm + Frost Nova Bomb, 40 pooled runs each,
    logging loadouts.
  - Pass: Storm + Bomb wins more runs than Storm alone and kills the boss faster,
    beyond the run-to-run spread the doc records.
  - Record the round in `docs/tuning/phase2-balance.md`.
  - The sweep runs on a main that already has #304 (Ice Storm radius 120 / 4 s), so
    the baseline is the storm players will get.
- **Look:** headless in-game screenshots of the roll with the spray and of the burst,
  attached to the PR.
- **Injection check:** not needed. The change adds no player text, save data, URL
  parameter or network input.

## 8. Out of scope

- Ice Storm's numbers. #304 (CO-183) owns them.
- New sounds for the icicles or the burst.
- Removing `ice.nova` from the atlas. Ice Shield still uses it.
- Pierce for the icicles (the Pierce passive does not reach this spell).
- #301's reach problem, beyond what the longer 240 range already gives.

## 9. Risks

- **A spec conflict with #304.** #304 edits the same §9.3 of the Phase 2 spec. Rebase
  onto main after #304 merges, before the gates.
- **Too much damage.** Up to 22 icicles × 14 each is 308 per flight on paper. The spiral
  hits only a fraction of that, but the sweep can show it overshooting. If it does,
  tune `icicleDamage` or `throwInterval` first.
- **Sparse early waves.** With fewer than 3 enemies inside its ring, the bomb flies its
  full range and bursts at the end, perhaps on nothing. The icicles still land along
  the way. This is accepted: the acceptance criterion is about crowds. In the bot runs,
  18–30% of bursts caught nobody.
- **The ring lands on the crowd's near edge.** Once armed, the bomb bursts on the first
  step its ring catches 3, so against a trailing stream it goes off at the front of the
  pack, not in its middle. Waiting for the peak count was not worth the extra rule.
