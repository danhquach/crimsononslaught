# Meta progression: account level, skill tree, guest spells and maps

Design approved 2026-09-30. No ticket yet; §10 splits it into tickets. Extends the
Phase 2 spec (`2026-09-18-phase2-spells.md`) §3 (loadout) and the Embers store
(`docs/tuning/embers-economy.md`); supersedes the rotation in #250.

## 1. Why

- **No replay value.** Every run offers the whole kit from the first run, the
  store holds six small stat upgrades, and every run is played on the same open
  map. After a few runs there is nothing new to reach.
- **Too close to the rest of the genre.** A run is the only loop. There is no
  build that lasts between runs and no choice that shapes the next one.

This spec adds a second, lasting track beside the run: an account level that pays
skill points, a tree that spends them on spells and a cross-element slot, and maps
that open one by one and are harder to move through.

## 2. The two tracks

| Track | Resets | Holds |
|---|---|---|
| Run | Every run | Run level, level-up drafts, the loadout (Phase 2 §3) |
| Account | Never | Account XP and level, skill points, owned tree nodes, opened maps, Embers, store upgrades |

The run loop is unchanged: level 1 at the start, drafts on level-up. The account
track is read once when a run starts and written once on Result, as the save is
today, so a run stays a function of its seed and the save it started with.

## 3. Account XP and skill points

### 3.1 Earning account XP

Every run that reaches Result pays, whatever its outcome (`win`, `lose` or `ended`):

```
accountXp = RUN_BONUS + floor(secondsSurvived / 60 × map.xpPerMinute) + (outcome === 'win' ? map.bossBonus : 0)
```

| | Map 1 | Map 2 | Map 3 |
|---|---|---|---|
| `RUN_BONUS` (every run) | 5 | 5 | 5 |
| `xpPerMinute` | 2 | 3 | 4 |
| `bossBonus` | 20 | 30 | 40 |
| First win on the map | +1 skill point | +1 skill point | +1 skill point |

Time survived is the base rather than run level, so a harder map always pays more
per minute however early the player dies, and a change to gem values cannot move
the account economy. `RUN_BONUS` makes even a short first run count.

### 3.2 Levels

Account level `n` (reaching it from `n − 1`) costs `10 + 3n` account XP: 13 for
level 1, 25 for level 5, 49 for level 13. Each level pays 1 skill point. XP past
a level carries into the next; one run can pay several levels.

Target pace: the first run pays a point (a death at 5:00 on map 1 is 15 XP); the
whole tree (§4, 16 points = 13 levels + 3 first wins, 403 XP) fills in about
10–15 runs. The bot sweeps average about 55 XP a run (`docs/tuning/phase2-balance.md`,
the #210 pass), which is the fast end. Account levels keep counting after the tree
is full; points bank until ultimates and keystones (§11) give them a use, and the
menu says so.
The numbers are starting values; the ticket tunes them against measured runs.

### 3.3 Existing saves

Migration grants account XP once from the lifetime profile:
`min(120, 10 × runs + 20 × wins)`, about five points at the cap. A save with
`wins ≥ 1` also counts map 1 as won (its first-win point, map 2 open). The cap
keeps a veteran save well short of a full tree, while still covering one or two
gated spells.

### 3.4 Where the player sees it

- **Account XP bar**, labelled `Account level 7 — 32 / 36 XP`:
  - Main menu: always shown, with an unspent-points badge on the Skill tree button.
  - Result: the bar fills with the run's gain (`+42 XP`), and each level reached
    shows `+1 skill point`; a first win shows its point too.

## 4. The skill tree

### 4.1 Shape

A star with rim links, 21 nodes. `F` = Fire (top), `L` = Lightning (right),
`I` = Ice (bottom), `E` = Earth (left). Neighbours: F–L, L–I, I–E, E–F.

| Node | Count | Links to | Cost | Effect |
|---|---|---|---|---|
| Start | 1 | The four strongest-spell nodes | Free, always owned | None |
| Strongest spell `<el>` | 4 | Start, own guest access, the two neighbouring slot diamonds | 1 | Unlocks the element's gated tier-2 spell (§5.1) |
| Slot diamond `<el1>-<el2>` | 4 | The two strongest-spell nodes it sits between, its rim junction | 1 | Adds the fourth active slot (§5.2). Only one can be owned (§4.2) |
| Guest access `<el>` | 4 | Own strongest spell, own ultimate tip, the two neighbouring rim junctions | 1 | That element's spells join the offer pool of any run (§5.2) |
| Rim junction `<el1>-<el2>` | 4 | Its diamond, the two neighbouring guest-access nodes, the two neighbouring ultimate tips | 1 | None until keystones ship (§11) |
| Ultimate tip `<el>` | 4 | Own guest access, the two neighbouring rim junctions | — | Shown locked, not buyable until ultimates ship (§11) |

16 buyable nodes in all: 16 points fill today's tree; the four tips add four more
once ultimates ship.

### 4.2 Rules

- **Buy rule:** a node can be bought when it is linked to an owned node and a
  point is unspent.
- **One diamond:** every arm's strongest-spell node links to two diamonds, so
  whichever arm the player starts down, a diamond is one node away. Only one
  diamond can be owned at a time: once one is bought, the other three are drawn
  greyed out and cannot be bought, and the screen says why. They open again
  when that diamond is refunded. An unowned diamond is also not a path, so it
  cannot be walked through to its rim junction.
- **Respec, all or one**, free, any time between runs (the tree is not reachable
  mid-run):
  - `Reset tree` refunds every point.
  - **Refund one node:** right-click it, press `Delete` / `Backspace` on the
    focused node, or press the gamepad's X (west face button). This refunds one
    point.
- **Connectivity:** owned nodes always form one connected set containing Start.
  A single refund is allowed only if every other owned node stays connected to
  Start without it; otherwise it is refused and the screen names the nodes that
  hang from it (refund those first).

### 4.3 The screen

- Opened from the main menu and from the select screen before a run.
- Owned, buyable and locked nodes are drawn apart (fill, outline, dim). Focusing a
  node shows its name, its effect and a `Buy` button when buyable.
- **Zoom** 60–300% in 25% steps: on-screen `−` / `+` / `Reset` buttons, the `-` /
  `=` keys and the mouse wheel. Labels scale with the tree. The level is kept in
  `settings.treeZoom`.
- **Keyboard and gamepad:** arrow keys or the D-pad / left stick move focus
  along links to the nearest node in that direction; `Enter` or A buys;
  `Delete` / `Backspace` or X refunds one; the shoulder buttons zoom. The existing
  focus ring marks focus (`scenes/input.ts`). Everything works without a mouse.
- **Mouse:** left-click buys, right-click refunds one; the browser's context menu
  is suppressed on the tree only.

## 5. The run's loadout

### 5.1 Tiers and gating

| Tier | Spells | Open |
|---|---|---|
| 1 | The element's default spell | Always |
| 2 | The element's other four spells | Three always; the strongest one needs its tree node |
| 3 | Ultimates | Not built yet (§11) |

**Rule:** every element keeps at least one reach active open. The #210 pass
(`docs/tuning/phase2-balance.md`) found boss fights stall without one: the 38 wins
with Fire Dragon, Fire Wave, Boulder or Tornado had a median boss fight of 62 s,
the 46 without had 126 s (#301). Gating Tornado or Boulder would leave new
Lightning or Earth players with no reach at all.

Proposed gated spells, for the PM to confirm before ticket 3 starts:

| Element | Gated | Why |
|---|---|---|
| Fire | Fire Dragon (`fire_dragon`) | A top reach active; Fire Wave keeps Fire's reach open |
| Ice | Ice Storm (`ice_blizzard`) | The capstone; Ice has no measured reach active, so ticket 3 re-checks with a 5-seed sweep |
| Lightning | Lightning Sword (`lightning_sword`) | The capstone; Tornado stays open for reach |
| Earth | Earthquake (`earth_quake`) | The capstone; Boulder stays open for reach |

A locked spell is never offered at level-up. The offer shows up to three cards
(`MAX_OFFER_SIZE`): slot 2 chooses among three open spells, slot 3 among the two
left.

### 5.2 Guest spells and the fourth slot

Two separate unlocks, and neither ties a spell to a slot.

| Unlock | Tree node | Effect in a run |
|---|---|---|
| Guest spells | Guest access `<el>` | That element's tier-1 and open tier-2 spells join the offer pool for **every** open active slot, from slot 2 at level 2 on. Its gated spell also needs its strongest-spell node |
| Fourth slot | Any slot diamond | A fourth active slot that opens at **run level 8**. It takes any eligible spell, same-element or guest |

- **Slots:** 2 at run level 2 and 3 at level 5, unchanged (`SLOT_UNLOCK_LEVELS`);
  4 at level 8 with a diamond.
- **No mix limit.** With the guest access nodes owned, a run may hold any mix,
  up to four slots of four different elements. A player may also stay all one
  element.
- **The run's element** is the element of its default spell, picked on the
  select screen. Slot 1 is always that default spell. Phase 2 §3.2's element lock
  becomes: slots 2–4 draw from the run's element plus every element whose guest
  access is owned.
- **Offers:** while any active slot is open, the level-up offers actives
  (Phase 2 §7.1), drawn from one merged pool: the run element's open spells plus
  every guest-eligible spell, minus what is equipped. A pick fills the lowest open
  slot. Up to three cards show (`MAX_OFFER_SIZE`), so a bigger pool means more
  choice but the same number of cards.
- **Purity:** `core/loadout.ts` stays tree-free. The run start derives a snapshot
  from the save, `{ lockedSpells, guestElements, fourthSlot }`, and hands it to
  `buildLoadout`, so a run is still replayable from its seed and snapshot.
- Once filled, a slot is final for the run. A guest spell levels 1–3 exactly as
  it does in its own element, and passives apply to it the same way (Phase 2 §6).

## 6. Maps

### 6.1 Opening

Map 1 is open from the start. A boss win on map N opens map N+1. The select screen
gets a map picker; a locked map shows `Win on <map> to open`. The chosen map rides
in the scene payload next to the element and seed.

### 6.2 Shape and obstacles

- Each map is a **walkable mask** on a 64 px grid: every cell is floor, wall or
  edge. Layouts are hand-authored config data, one per map.
- **Walls block the player and enemies. Spells pass over them.** Blocking spells
  would touch all 20 spells; it is deferred (§11).
- **Enemy navigation:** a flow field, a breadth-first search over floor cells from
  the player's cell, rebuilt every 0.25 s. Each enemy steers along its cell's
  direction and slides along walls, so a crowd routes around a wall instead of
  piling on it. Map 1 has no walls and skips the field.
- **The boss** (`entities/Boss.ts`) chases in a straight line and charges along a
  locked line today. On a map with walls it steers by the flow field between
  charges, and a charge stops at the first wall cell, so it can never park behind
  a wall and make the run unwinnable.
- **Companions** ignore walls, as they ignore enemies' bodies today.
- **Rectangle assumptions** move to the mask: world bounds and camera bounds are
  the mask's bounding box; `spawnDirector`'s spawn point, ranged enemies'
  `confineVelocity`, `placeRelics` and `scatterProps` sample floor cells. A spawn
  point that lands on a wall moves to the nearest floor cell on the spawn ring; if
  none is in reach, it redraws from the seeded stream.
- **Layout check:** each layout's floor is one connected component and the
  player's start is on it; a unit test and a boot-time assertion in dev builds
  check every layout.
- **Placement:** relics, pickups and props land on floor cells only. Prop
  placement stays seeded (#120).

| Map | Name | Shape | Obstacles | Enemy HP | Enemy damage |
|---|---|---|---|---|---|
| 1 | Graveyard | Today's open rectangle, unchanged | None | ×1.0 | ×1.0 |
| 2 | Ruined Keep | Rectangle with inner walls | Broken wall runs and pillar clusters that make chokepoints | ×1.25 | ×1.15 |
| 3 | Scorched Wastes | Cross-shaped outline with narrow necks | Rock fields and dead-end pockets | ×1.6 | ×1.3 |

The map's HP and damage multipliers apply on top of the wave table's own.

### 6.3 Art

#250's scope carries over: each new map gets its own ground, edge and prop sheets
through the manifest and cut pipeline, plus wall art. Without the atlas every map
falls back to plain shapes. The rotation in #250 is replaced by §6.1.

## 7. Embers and the store

The store keeps its six permanent passives, unchanged. Respec is free, so Embers
buy nothing new here; cosmetics are the planned future use (§11).

## 8. Save data

- Stays in `localStorage`, processed on the player's machine only. The save holds
  meta data only; the split between `core/save.ts` (rules) and
  `storage/localSave.ts` (storage) is kept so a server sync can be added later
  without touching the rules.
- Schema v2 → v3 adds:

```ts
interface SaveV3 extends Save {
  account: { xp: number };           // level and unspent points are derived
  tree: { owned: TreeNodeId[] };     // Start is implied, never stored
  maps: { won: MapId[] };            // opened maps are derived: map 1 + one past each win
}
```

- Only what cannot be derived is stored: level comes from `xp`; unspent points
  are `level + won.length − owned.length`; opened maps come from `won`.
- **Ticket 1 lands the whole v3 shape** (`tree.owned: []`, `maps.won: []`
  included) with its validation, `SAVE_VERSION = 3` and `MIGRATIONS[2]` (the
  one-time grant of §3.3). Tickets 2 and 4 only fill those fields, so no two
  tickets bump the version.
- **Result payload:** `ResultPayload` gains `mapId`; Result computes the account
  delta (XP gained, levels, first-win point) from the save before and after
  `recordRun`, for the bar animation.
- **Validation on read** (an injection check applies, see the repo rules):
  - Node and map ids are checked against an allow-list; unknown ids are dropped.
  - Counters are clamped to `[0, SAVE_COUNT_MAX]`, as today.
  - Duplicate node ids and ultimate tips are dropped.
  - More than one diamond owned → the tree is reset.
  - **Points conservation:** if `owned.length > level + won.length` (more nodes
    than points ever earned), the tree is reset.
  - An owned set that is not connected to Start is reset and its points refunded.
  - `won` may hold a map only if every earlier map is also in it; otherwise it is
    cut back to the longest valid prefix.
  - Parsed with the existing never-throw path; prototype keys are ignored.

## 9. Testing

- **Unit** (`src/core`, no Phaser):
  - Account XP per map, boss bonus, carry-over across several levels, the curve.
  - Buy rule, connectivity, reset refund, the ultimate tips unbuyable.
  - One diamond: after one is bought the other three refuse; they open again
    after it is refunded.
  - Single refund: a leaf refunds one point; a node others hang from is
    refused and names them; refunding the only link to Start is refused.
  - Offers: a locked strongest spell is never offered; the pool holds exactly the
    run element's open spells plus the owned guest elements' open spells; the
    fourth slot opens at level 8 and not before; a run can end with four
    elements equipped.
  - Map opening on a win; the map multipliers.
  - Flow field: routes around a wall, no enemy stuck on a U-shaped wall in the
    map layouts, rebuilt on its interval.
  - Migration grant and cap; hostile saves (bad ids, disconnected sets, oversized
    and negative counters, `__proto__` keys, bidi and zero-width ids).
- **E2E** (Playwright):
  - Buy a strongest-spell node, then see that spell offered in a run.
  - With Ice guest access, a Fire run is offered an Ice spell for slot 2; with a
    diamond, the fourth slot opens at run level 8.
  - A win on map 1 opens map 2 in the picker.
  - Zoom buttons, keys and wheel change the tree's scale; keyboard buys a node
    and `Delete` refunds it; right-click refunds one; a second diamond shows
    greyed out.
- **Performance:** a unit bench of one flow-field rebuild on the largest layout
  (a fixed time budget per rebuild), plus the existing absolute frame-rate floor
  on maps 2 and 3. No relative "no worse than map 1" check: relative fps floors
  failed four times on the roster e2e.
- **Test hooks:** `?tree=<node,node>`, `?map=<id>`, `?accountXp=<n>`, all behind
  the existing test-hook allow-list.

## 10. Ticket map

In build order; each is one branch and one PR.

1. **Account XP and levels.** The whole save v3 shape (§8) and its validation,
   migration, the earning rule, the account XP bar on the main menu and Result,
   the `?accountXp=` hook.
2. **Skill tree model and screen.** Nodes, links, buy, reset, validation of
   `tree.owned`, the screen with zoom and keyboard. Needs ticket 1 (points and the
   `?accountXp=` hook to test with).
3. **Spell gating, guest spells and the fourth slot.** Tier table,
   locked-spell offers, the merged offer pool, the fourth slot, a balance sweep
   of mixed-element runs. Needs the strongest-spell confirmation (§5.1).
4. **Map framework.** Walkable mask, wall collision, flow field, the boss and
   rectangle changes of §6.2, floor-only placement, the map picker, opening,
   multipliers, filling `maps.won`. Map 1 only, plus a test layout with walls;
   the flow-field bench runs before any map art is made.
5. **Map 2: Ruined Keep.** Layout and art (from #250).
6. **Map 3: Scorched Wastes.** Layout and art (from #250).

Order: 1 first; then 2 and 4 in parallel; 3 needs 2; 5–6 need 4. #250 is
re-scoped into 5–6. Tickets 1, 2 and 4 move main-menu or select-screen layout,
so their gates include `npm run test:csp` (CI runs it with hard-coded click
coordinates).

## 11. Deferred

- **Keystones:** rule-changing effects on the four rim junctions.
- **Ultimates:** one tier-3 spell per element on the tree's tips.
- **Cosmetics** bought with Embers.
- **Walls that block spells.**
- **Server-side save.**

## 12. Risks

- **Frame rate** at the enemy cap with collision and a flow field. The field is
  one BFS over at most a few thousand cells four times a second; measure it in
  ticket 4 before any map art is made.
- **Gating feels like a loss** to existing players who had every spell. The §3.3
  grant covers one or two gated spells.
- **Mixed runs** may out-scale single-element runs: four elements means four
  kits' best spells in one run. Ticket 3 sweeps mixed against single-element
  loadouts and tunes the gated spells or the slot level if the boss window breaks.
- **XP with nothing to buy:** a full tree in 10–15 runs leaves points banking
  until ultimates or keystones ship. Schedule one of them before the tree fills
  for most players.
- **Pace** of §3.2 is a guess; ticket 1 logs account XP per run from the bot
  sweeps and tunes the curve.
- **Harder maps and the 45–90 s boss window** (`docs/tuning/phase2-balance.md`):
  the multipliers of §6.2 are starting values for a sweep in tickets 5–6.
