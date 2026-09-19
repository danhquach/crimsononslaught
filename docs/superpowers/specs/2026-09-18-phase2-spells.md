# Crimson Onslaught — Phase 2 Design: Loadout, Passives and the Spell Roster

Date: 2026-09-18
Status: Draft — the pull request for CO-107 is the review gate
Epic: [#122](https://github.com/danhquach/crimsononslaught/issues/122) · Ticket:
[#129](https://github.com/danhquach/crimsononslaught/issues/129)
Supersedes parts of: `docs/superpowers/specs/2026-09-14-phase1-design.md`

## 1. Goal

Phase 1 ships one spell per run and a seven-node perk tree that mutates that
spell's stat block. Phase 2 replaces both:

- A run carries a **default spell plus two active spells**, each casting on its
  own cooldown.
- Level-up fills those slots first, then hands out **passives** for the rest of
  the run. Passives are uncapped in number and modify a **global player
  profile**, not one spell.
- Each element grows from one spell to **five**, twenty in total.

Done for this ticket = this document is agreed in its pull request. No code
changes here; every number below is a starting point that
[#147](https://github.com/danhquach/crimsononslaught/issues/147) finalises.

## 2. Relationship to the Phase 1 spec

The Phase 1 spec stays where it is and keeps its `Approved` status: it is the
record of what shipped, and the balance pass in `docs/tuning/phase1-balance.md`
is measured against it. It is not rewritten in place. Instead, every section of
it that assumes one spell per run now carries a pointer to this document, and
this document is authoritative wherever the two disagree:

| Phase 1 spec section | What this spec replaces |
|---|---|
| §2 In — "4 spells … Exactly one chosen per run" | §3 here: default spell + two active slots |
| §2 In — "Per-spell perk tree … + 3 generic perks" | §5 and §8 here: passives, trees retired |
| §2 Out — "spell evolutions" | Still out; the roster in §9 is not an evolution system |
| §4 Data flow, step 3 | §7 here: level-up offers actives, then passives |
| §5 "XP and level-up" | §7 here |
| §5 "Spells (one per run, auto-cast)" | §9 here: twenty spells, five per element |
| §5 "Generic perks" | §5 here: the three generics become passives |
| §8 Testing | §12 here, for the modules this spec adds |

Everything else in the Phase 1 spec — player, enemies, spawn schedule, boss, XP
curve, rendering, error handling — is unchanged by this document.

**This is a deliberate deviation from #129's wording**, which asks for every
one-spell-per-run section of the existing spec to be *rewritten*. Rewriting it
would destroy the record the Phase 1 balance pass is measured against and leave
two documents competing to describe the same system. Annotating instead covers
the same sections — the table above is the full list — and keeps one
authoritative source per phase. It needs a yes or a no in review; a "no" is one
editing pass over the Phase 1 spec, not a change to anything below.

## 3. Loadout model

### 3.1 Slots

| Slot | Holds | Filled | Changeable |
|---|---|---|---|
| Default | The element's default spell | Before the run, on the select screen | No |
| Active 2 | Any unequipped active of the same element | Level-up, once unlocked | No |
| Active 3 | Any unequipped active of the same element | Level-up, once unlocked | No |
| Passives | Any number of passive ranks | Level-up, whenever no active slot is open | Never removed |

- **Active 2 unlocks at level 3, active 3 at level 7.** The Phase 1 tuning pass
  recorded Fire and Lightning reaching level 10–12 by 5:00 and Ice and Earth
  13–20, so both slots fill mid-run for every element, and the slower elements
  are not punished for levelling fast on a crowd they cannot kill.
- A slot that is unlocked and empty is **open**. A slot that has been filled is
  final for the rest of the run — no swap, no re-roll, no sell.
- Passive slots are uncapped: a run can hold any number of passive ranks.

### 3.2 Element lock

A run stays locked to the element of its default spell; the two active slots
draw from that element's four non-default spells only. Mixing elements is
deferred (§13).

### 3.3 Shape

The loadout lives in the engine-free core layer
([#130](https://github.com/danhquach/crimsononslaught/issues/130)):

```ts
interface Loadout {
  element: ElementId;               // 'fire' | 'ice' | 'lightning' | 'earth'
  actives: EquippedSpell[];         // [default, ...up to 2 more], in pick order
  passives: Map<PassiveId, number>; // id -> rank owned
  profile: PlayerProfile;           // §4, derived from passives
}

interface EquippedSpell {
  id: SpellId;                      // 'fire' | 'fire_meteor' | ...
  base: SpellStats;                 // §9, a copy of the config block
  cooldownLeft: number;             // seconds, per spell (#131)
}
```

`base` is never mutated after the copy. Everything a passive does is derived at
read time (§6), so a passive taken at level 9 applies to a spell equipped at
level 3 without anything having to walk the loadout and rewrite numbers.

### 3.4 Spell-select flow

The select screen keeps its four cards; each card now names the element and its
default spell, and lists what the element's other four spells do, so the choice
is a choice of kit rather than of one attack. `scenePayloads` carries
`{ element, seed }` in place of `{ spellId, seed }`; the payload's spell ids
stay `fire` / `ice` / `lightning` / `earth` for the four defaults (§9.1).

## 4. The player profile

### 4.1 Fields

`PlayerProfile` replaces today's `PlayerStats`. It is the only thing a passive
can change.

| Field | Base | Meaning |
|---|---|---|
| `moveSpeed` | 180 | px/s, before diagonal normalisation |
| `maxHp` | 100 | Player max HP |
| `hpRegen` | 0 | HP per second, healed continuously |
| `pickupRadius` | 40 | Gem pickup radius, px |
| `xpGain` | 1 | Multiplier on XP collected |
| `damageMul` | 1 | Multiplier on every damage field a spell deals |
| `cooldownMul` | 1 | Multiplier on every cooldown field (below 1 = faster) |
| `areaMul` | 1 | Multiplier on radii, reach and body sizes |
| `projectileSpeedMul` | 1 | Multiplier on travel and orbit speeds |
| `durationMul` | 1 | Multiplier on effect and status durations |
| `critChance` | 0 | Chance per damage instance to crit, 0–1 |
| `critMultiplier` | 1.5 | Damage multiplier on a crit |
| `damageReduction` | 0 | Fraction of incoming player damage removed, 0–1 |

`critChance` / `critMultiplier` are the stats
[#125](https://github.com/danhquach/crimsononslaught/issues/125) asks the
loadout to own rather than hard-code; `damageReduction` is the player-side
status from
[#139](https://github.com/danhquach/crimsononslaught/issues/139).

### 4.2 How passives combine

For each field, over every owned passive rank:

```
value = clamp(field, (base + Σ add amounts) × Π mul amounts)
```

Adds are summed first, muls multiplied second, clamps applied last. The result
does not depend on the order the passives were picked — that is the acceptance
criterion #130 tests, and it is true by construction because addition and
multiplication are each order-independent and the two groups never interleave.

A rank is one application of the passive's `{op, amount}`: three ranks of a
`mul 1.10` passive contribute `1.10³ ≈ 1.331`, not `1.30`.

The profile is recomputed from the passive map whenever a passive is taken, not
accumulated in place, so a wrong rank can never be baked in.

### 4.3 Clamps

| Field | Clamp | Why |
|---|---|---|
| `cooldownMul` | ≥ 0.35 | A cast loop below a third of its base outruns the FX and the cap on live projectiles |
| `critChance` | ≤ 0.75 | Leaves a visible non-crit case; crits are feedback as much as damage |
| `damageReduction` | ≤ 0.60 | The player must still be killable at any stack |
| `moveSpeed` | ≤ 320 | Above this the player outruns the camera's follow lerp and Fast stops being a threat |
| every field | ≥ 0 | A negative stat is a config bug, not a build |

## 5. Passives

Thirteen passives, shared by every element. A passive is data:

```ts
interface Passive {
  id: PassiveId;
  name: string;
  description: string;            // one line, for the level-up card
  field: keyof PlayerProfile;
  op: 'add' | 'mul';
  amount: number;
  maxRank?: number;               // absent = stacks without limit
}
```

| id | Name | Field | Op | Amount | maxRank |
|---|---|---|---|---|---|
| `passive_power` | Power | `damageMul` | mul | 1.10 | — |
| `passive_haste` | Haste | `cooldownMul` | mul | 0.92 | — |
| `passive_expanse` | Expanse | `areaMul` | mul | 1.12 | — |
| `passive_velocity` | Velocity | `projectileSpeedMul` | mul | 1.10 | 5 |
| `passive_persistence` | Persistence | `durationMul` | mul | 1.15 | — |
| `passive_precision` | Precision | `critChance` | add | 0.05 | 10 |
| `passive_savagery` | Savagery | `critMultiplier` | add | 0.25 | 6 |
| `passive_ward` | Ward | `damageReduction` | add | 0.04 | 8 |
| `passive_swift` | Swift | `moveSpeed` | mul | 1.08 | 5 |
| `passive_vitality` | Vitality | `maxHp` | add | 20 | 8 |
| `passive_regeneration` | Regeneration | `hpRegen` | add | 0.5 | 6 |
| `passive_magnet` | Magnet | `pickupRadius` | mul | 1.25 | 3 |
| `passive_avarice` | Avarice | `xpGain` | mul | 1.12 | 5 |

Notes:

- Swift, Vitality and Magnet are the Phase 1 generic perks, renamed only where
  the old name was a tree node (§8). Vitality raises current HP by the same
  amount it raises the maximum, so taking it mid-fight is a heal.
- Four passives never cap — Power, Haste, Expanse and Persistence. They are the
  ones that scale a build the player already has rather than open a new
  behaviour, so a long run can keep leaning on them. Everything that changes how
  survivable or how lucky the player is caps, including Vitality, which Phase 1
  capped at rank 3.
- Passives never grant a behaviour a spell does not already have. A passive that
  adds projectiles, pierce or chains is out of scope here — see §13.

## 6. From the profile to a spell's stat block

### 6.1 Category map

Every field of every spell stat block belongs to exactly one category. The
category decides which profile multiplier reaches it.

| Category | Multiplier | Spell fields |
|---|---|---|
| damage | `damageMul` | `damage`, `tickDamage`, `breakDamage`, `burn`, `bleed` |
| cooldown | `cooldownMul` | `cooldown`, `attackCooldown`, `rechargeDelay`, `fallDelay` |
| area | `areaMul` | `aoeRadius`, `radius`, `breakRadius`, `chainRange`, `orbitRadius`, `leashRadius`, `targetRange`, `range`, `size`, `pullRadius` |
| speed | `projectileSpeedMul` | `speed`, `orbitSpeed`, `chaseSpeed` (companions) |
| duration | `durationMul` | `duration`, `burnDuration`, `bleedDuration`, `slowDuration`, `freezeDuration`, `stunDuration`, `staggerDuration` |
| unscaled | — | counts (`projectiles`, `strikes`, `chains`, `count`, `pierce`), fractions (`slowPct`, `freezeChance`, `stunChance`, `chainFalloff`, `aoeDamageFactor`), `knockback`, `pullForce`, `homingTurnRate`, `hitCooldown`, `tickRate`, `shieldHp` |

Counts stay unscaled on purpose: a global "+12% area" that silently became
"+12% boulders" would round to nothing on a 3-boulder ring and to a lot on a
9-boulder one. Counts change only in a spell's own block and in #147's pass.

Adding a field to a spell block without adding it to this table is a config
error; the boot-time validation (§12) reports it.

### 6.2 Derivation

```ts
effectiveStats(base: SpellStats, profile: PlayerProfile): SpellStats
```

Pure, in `core/`, called where the value is used — not stored on the loadout:

- Every field is `base[field] × profile[multiplier for its category]`, `1` for
  unscaled fields.
- `cooldown` is read by the cast scheduler when a cast completes, so a Haste
  taken mid-run shortens the *next* interval and never rewinds a timer that is
  already running.
- **Anything with a finite lifetime snapshots at spawn** — a projectile in
  flight, a meteor falling, a ground area ticking down — and keeps those numbers
  until it expires; the next one cast gets the new ones. This keeps a Blizzard
  from growing under the player's feet mid-duration.
- **Anything that lives as long as it is equipped reads live** — companions,
  orbiting bodies and shields. A shield's `rechargeDelay`, `breakDamage` and
  `breakRadius` therefore change the moment a passive is taken. `shieldHp` is
  unscaled today (§6.1); should anything ever scale it, it resizes when the
  shield next reforms rather than mid-pool, so it can never refill a shield that
  is about to break.
- Crit is rolled once per damage instance through the run's seeded RNG:
  `damage × critMultiplier` on a hit. Damage-over-time ticks (burn, bleed,
  ground areas) do not crit — one tick source would otherwise strobe the screen
  with crit numbers.
- Six profile fields never reach a spell block at all: `moveSpeed`, `maxHp` and
  `hpRegen` are read by the player entity and `core/health.ts` (regen ticks
  there, capped at `maxHp`), `pickupRadius` by the gem system, `xpGain` when a
  gem is collected, and `damageReduction` below.
- `damageReduction` applies where the player takes damage (`core/health.ts`),
  after the enemy's contact damage and before the invulnerability window, so it
  reduces the number the player sees rather than the rate at which they are hit.

## 7. Level-up

### 7.1 What is offered

On each level-up, in order:

1. **Any active slot open?** (unlocked, empty) → offer up to 3 of the element's
   unequipped active spells. The element has 4 non-default actives, so this is
   3 cards for the first slot and exactly 3 for the second. Only spells the
   build can actually cast are offered — until the roster tickets
   ([#140](https://github.com/danhquach/crimsononslaught/issues/140)-[#143](https://github.com/danhquach/crimsononslaught/issues/143))
   land there are none, and an open slot falls through to state 2 rather than to
   state 3: the slot waits for a later level and the run still gets the upgrade
   it earned.
2. **Otherwise** → offer 3 passives drawn from those with `rank < maxRank`, via
   `rng.shuffle(pool).slice(0, 3)`. Uncapped passives are always eligible.
3. **Nothing eligible** → no overlay; grant `EMPTY_OFFER_MAX_HP_BONUS` (+10 max
   HP) and resume, exactly as Phase 1 does.

An offer is all actives or all passives, never mixed: a card the player will
never see again (an active slot's last chance) should not compete against a card
they can take at any later level.

With the passive list in §5, four passives never cap, so state 3 is unreachable
in a real run. It stays specified, and keeps its unit test, because it is the
defined behaviour for a config where every passive is capped.

### 7.2 Determinism

Both draws go through `core/rng.ts` — the same seed produces the same offers in
the same order. Nothing in the level-up path may call `Math.random`; the lint
rule already enforces that.

### 7.3 Skipping

There is no skip and no re-roll. A level-up always resolves to one pick or the
fallback, so the run's level and the run's power never diverge.

## 8. Retiring the perk trees

`config/perks.ts`, `core/perkOffer.ts` and `core/perkSystem.ts` are deleted,
along with `applyPerk` and `validatePerks` in `core/spellStats.ts` and the
`LoadoutStats` type. What replaces them: `config/passives.ts`,
`core/levelUpOffer.ts`, `core/playerProfile.ts` and `core/loadout.ts`. (§7's
state machine draws both kinds of card, so the one module is
`core/levelUpOffer.ts` rather than the `core/passiveOffer.ts` + `spellOffer`
pair this section first named.)

Where each node goes:

**Fire**

| Node | Fate |
|---|---|
| Kindling (+damage) | `passive_power` |
| Burn (burn dmg/s) | Always-on stat block of Fire Column |
| Big Blast (`aoeDamageFactor` → 1) | Always-on stat block of Meteor |
| Blast Radius (+`aoeRadius`) | `passive_expanse` |
| Long Throw (+`range`) | `passive_expanse` |
| Split Shot (+1 projectile) | Dropped — count passives are out (§6.1, §13) |
| Quickfire (−cooldown) | `passive_haste` |

**Ice**

| Node | Fate |
|---|---|
| +damage | `passive_power` |
| Freeze chance | Always-on stat block of Frost Nova Bomb |
| Shatter (+dmg to slowed) | Dropped — folded into Frost Nova Bomb's base damage by #147 |
| +radius | `passive_expanse` |
| +slow duration | `passive_persistence` |
| +slow strength | Always-on: each Ice spell carries its own `slowPct` |
| −cooldown | `passive_haste` |

**Lightning**

| Node | Fate |
|---|---|
| +damage | `passive_power` |
| Stun | Always-on: `stunChance` / `stunDuration` on the bolt kits |
| No falloff (`chainFalloff` → 1) | Dropped — folded into Chain Lightning's base falloff by #147 |
| +chains | Always-on: Chain Lightning's `chains` |
| +chain range | `passive_expanse` |
| +1 strike | Dropped — count passives are out |
| −cooldown | `passive_haste` |

**Earth**

| Node | Fate |
|---|---|
| +damage | `passive_power` |
| +knockback | Always-on: every Earth spell that strikes an enemy carries `knockback`; Earthquake slows instead |
| Crush (×dmg to Tanks) | Dropped — no type-specific damage in the new model |
| +orbit radius | `passive_expanse` |
| +boulder size | `passive_expanse` |
| +1 boulder | Dropped — count passives are out |
| +orbit speed | `passive_velocity` |

**Generic**

| Node | Fate |
|---|---|
| Swift (+move speed) | `passive_swift`, same field, 10% → 8% per rank |
| Vitality (+max HP) | `passive_vitality`, unchanged, now also heals |
| Magnet (+pickup radius) | `passive_magnet`, unchanged |

Thirty-one nodes in, thirty-one accounted for: 18 become passives, 7 become
always-on properties of the spell that owns them, and 6 are removed outright —
the three count nodes (Split Shot, +1 strike, +1 boulder), the two folded into a
base number by #147 (Shatter, No falloff) and Crush, which goes with
type-specific damage.

## 9. The rosters

### 9.1 Reading these tables

- **Ids.** The four default spells keep the ids `fire`, `ice`, `lightning` and
  `earth`, so e2e selectors, payloads and save-free URLs do not churn. New
  spells take new ids prefixed by their element. The default spells' *names* and
  *behaviour* change where the epic says so — `ice` is Ice Arrow, not Frost
  Nova, and `earth` is Earth Spike, not Orbiting Boulders. The Phase 1 Frost
  Nova and Orbiting Boulders kits live on as Frost Nova Bomb and Earth Shield,
  which is where their numbers went.
- **Numbers are a starting point.** Where a Phase 1 kit maps onto a Phase 2
  spell, the Phase 1 block seeds it (`BASE_SPELL_STATS` in `config/spells.ts`).
  Everything else is a first guess sized against those.
  [#147](https://github.com/danhquach/crimsononslaught/issues/147) finalises
  every number in this section, and only that ticket's measured runs make them
  real.
- **Needs** names the mechanic ticket a spell cannot ship without.
- Units: seconds, pixels, px/s, rad/s. `tickRate` is seconds between ticks.

### 9.2 Fire

| Spell | id | Behaviour | Needs |
|---|---|---|---|
| Fire Bolt (default) | `fire` | Fast projectile at the nearest enemy, small explosion on hit | — |
| Meteor | `fire_meteor` | Falls on a nearby target after a telegraph; big damage, slow | #138 |
| Fire Column | `fire_column` | Slow column travels out from the player, burns what it touches | — |
| Fire Companion | `fire_companion` | Ranged ally, auto-shoots nearby enemies, light burn | #133 |
| Fire Dragon | `fire_dragon` | Homing missile, heavy single-target damage | #137 |

| Field | `fire` | `fire_meteor` | `fire_column` | `fire_companion` | `fire_dragon` |
|---|---|---|---|---|---|
| `cooldown` | 1.0 | 4.0 | 3.0 | — | 2.5 |
| `attackCooldown` | — | — | — | 1.2 | — |
| `damage` | 12 | 60 | 18 | 8 | 45 |
| `aoeRadius` | 50 | 110 | — | — | 30 |
| `aoeDamageFactor` | 0.5 | 1.0 | — | — | 0.4 |
| `radius` | — | — | 40 | — | — |
| `projectiles` | 1 | 1 | 1 | 1 | 1 |
| `speed` | 350 | — | 120 | 320 | 260 |
| `range` | 400 | — | 500 | — | — |
| `targetRange` | — | 420 | — | 260 | 420 |
| `fallDelay` | — | 1.0 | — | — | — |
| `homingTurnRate` | — | — | — | — | 4.0 rad/s |
| `duration` | — | — | — | — | 3.0 |
| `leashRadius` | — | — | — | 60 | — |
| `hitCooldown` | — | — | 0.5 | — | — |
| `burn` | — | — | 6 | 2 | — |
| `burnDuration` | — | — | 3.0 | 2.0 | — |

Fire Bolt is today's Fire block with `burn` removed — burn is Fire Column's
identity now, and a 0-valued field with nothing to raise it is dead weight.

Fire Dragon's homing (#137) turns the shot's heading toward its target by at
most `homingTurnRate` per second, so a dragon fired away from its mark arcs
round rather than snapping onto it. When the target dies in flight the dragon
**retargets to the nearest live enemy within `targetRange` of the dragon
itself**, not of the player; with nothing in range it flies straight on its last
heading. It expires after `duration` seconds of run clock — a curving flight
covers more ground than the line to its target, so a distance range would
expire it late or never on a target it circles.

### 9.3 Ice

| Spell | id | Behaviour | Needs |
|---|---|---|---|
| Ice Arrow (default) | `ice` | Fast single projectile, small slow on hit, no AoE so it fires faster than Fire Bolt | — |
| Frost Nova Bomb | `ice_nova_bomb` | Slow bomb detonates into a frost nova, slows the group | — |
| Ice Shield | `ice_shield` | Absorbing layer on the player; recharges; hurts and slows nearby enemies when it breaks | #134 |
| Ice Companion | `ice_companion` | Ranged ally, light slow on hit | #133 |
| Blizzard | `ice_blizzard` | Wide ground area, heavy slow, the element's crowd control | #135 |

| Field | `ice` | `ice_nova_bomb` | `ice_shield` | `ice_companion` | `ice_blizzard` |
|---|---|---|---|---|---|
| `cooldown` | 0.8 | 2.2 | — | — | 12 |
| `attackCooldown` | — | — | — | 1.4 | — |
| `damage` | 10 | 24 | — | 7 | — |
| `tickDamage` | — | — | — | — | 6 |
| `tickRate` | — | — | — | — | 0.5 |
| `radius` | — | 110 | — | — | 180 |
| `speed` | 380 | 220 | — | 320 | — |
| `range` | 420 | 300 | — | — | — |
| `targetRange` | — | — | — | 260 | 400 |
| `leashRadius` | — | — | — | 60 | — |
| `duration` | — | — | — | — | 6.0 |
| `slowPct` | 0.2 | 0.4 | 0.4 | 0.25 | 0.5 |
| `slowDuration` | 1.0 | 2.0 | 2.0 | 1.5 | 1.0 |
| `freezeChance` | — | 0.15 | — | — | — |
| `freezeDuration` | — | 1.0 | — | — | — |
| `shieldHp` | — | — | 60 | — | — |
| `rechargeDelay` | — | — | 6.0 | — | — |
| `breakDamage` | — | — | 40 | — | — |
| `breakRadius` | — | — | 120 | — | — |

Ice Shield recharges at `shieldHp / rechargeDelay` per second once
`rechargeDelay` seconds have passed with no damage taken, and absorbs player
damage before `damageReduction` applies. Blizzard's area is placed on the
densest cluster within `targetRange`, chosen through the seeded RNG when two
clusters tie.

Ground areas — Blizzard here, Earthquake in §9.5, Tornado in §9.4 — share one
rule for standing in more than one at a time (#135): **they do not merge.** Each
patch keeps its own clock and ticks against its own members, so an enemy inside
two of them takes both lots of damage, while the slows they apply resolve to the
strongest rather than summing, which is what `applyFrost` already does for every
other source of slow. A patch's first tick lands one `tickRate` after it is
placed and its last on the frame its `duration` runs out, so a patch is worth
`duration / tickRate` ticks however the frames fell; an enemy that walks in is
caught by the next tick and never by the one before it, and one that walks out
is not hit again.

Phase 1's balance pass recorded Ice dying in waves two to three. The element's
answer here is Frost Nova Bomb's freeze chance plus Blizzard's 50% area slow —
gating Fast rather than out-damaging it — which is the kit-side fix that pass
asked for.

### 9.4 Lightning

| Spell | id | Behaviour | Needs |
|---|---|---|---|
| Lightning Bolt (default) | `lightning` | Strikes the nearest enemy; light stagger, small stun chance | #139 |
| Chain Lightning | `lightning_chain` | Strikes and chains to nearby enemies with falloff | #139 |
| Tornado | `lightning_tornado` | Drifting vortex pulls enemies in and damages them continuously | #135, #136 |
| Lightning Companion | `lightning_companion` | Melee ally, charges nearby enemies, staggers | #133 |
| Lightning Sword | `lightning_sword` | Blade circles the player, staggering what it cuts | — |

| Field | `lightning` | `lightning_chain` | `lightning_tornado` | `lightning_companion` | `lightning_sword` |
|---|---|---|---|---|---|
| `cooldown` | 0.9 | 1.4 | 9.0 | — | — |
| `attackCooldown` | — | — | — | 0.8 | — |
| `damage` | 14 | 12 | — | 9 | 16 |
| `tickDamage` | — | — | 5 | — | — |
| `tickRate` | — | — | 0.4 | — | — |
| `strikes` | 1 | 1 | — | — | — |
| `chains` | — | 2 | — | — | — |
| `chainRange` | — | 120 | — | — | — |
| `chainFalloff` | — | 0.8 | — | — | — |
| `targetRange` | 400 | 400 | 360 | 200 | — |
| `radius` | — | — | 110 | — | — |
| `pullRadius` | — | — | 150 | — | — |
| `pullForce` | — | — | 90 | — | — |
| `speed` | — | — | 60 | — | — |
| `chaseSpeed` | — | — | — | 240 | — |
| `leashRadius` | — | — | — | 220 | — |
| `orbitRadius` | — | — | — | — | 70 |
| `orbitSpeed` | — | — | — | — | 3.2 rad/s |
| `count` | — | — | — | — | 1 |
| `size` | — | — | — | — | 18 |
| `hitCooldown` | — | — | — | — | 0.35 |
| `duration` | — | — | 5.0 | — | — |
| `staggerDuration` | 0.5 | 0.5 | — | 0.3 | 0.3 |
| `stunChance` | 0.08 | 0.08 | — | — | — |
| `stunDuration` | 2.0 | 2.0 | — | — | — |

Stagger is the new brief interrupt from #139 — it stops an enemy's movement for
its duration without the full stop of a stun, and it does not stack: a second
stagger refreshes the timer.

### 9.5 Earth

| Spell | id | Behaviour | Needs |
|---|---|---|---|
| Earth Spike (default) | `earth` | Spike erupts under a nearby enemy, knocks back, applies bleed | #139 |
| Boulder | `earth_boulder` | Heavy rolling boulder, big damage and knockback, passes through a few enemies | — |
| Earth Shield | `earth_shield` | Stones circle the player, knock back, have their own HP and return after a cooldown | #134 |
| Earthquake | `earth_quake` | Ground area, continuous damage and slow, long cooldown | #135 |
| Earth Companion | `earth_companion` | Melee ally, heavy knockback | #133 |

| Field | `earth` | `earth_boulder` | `earth_shield` | `earth_quake` | `earth_companion` |
|---|---|---|---|---|---|
| `cooldown` | 1.1 | 2.0 | — | 14 | — |
| `attackCooldown` | — | — | — | — | 1.6 |
| `rechargeDelay` | — | — | 8.0 | — | — |
| `damage` | 16 | 40 | 10 | — | 14 |
| `tickDamage` | — | — | — | 8 | — |
| `tickRate` | — | — | — | 0.5 | — |
| `radius` | 40 | 36 | — | 160 | — |
| `speed` | — | 280 | — | — | — |
| `chaseSpeed` | — | — | — | — | 200 |
| `range` | — | 460 | — | — | — |
| `targetRange` | 320 | — | — | 360 | 200 |
| `leashRadius` | — | — | — | — | 200 |
| `pierce` | — | 3 | — | — | — |
| `count` | — | — | 3 | — | — |
| `orbitRadius` | — | — | 80 | — | — |
| `orbitSpeed` | — | — | 2.5 rad/s | — | — |
| `size` | — | — | 14 | — | — |
| `hitCooldown` | — | — | 0.4 | — | — |
| `shieldHp` | — | — | 80 | — | — |
| `duration` | — | — | — | 6.0 | — |
| `knockback` | 70 | 120 | 60 | — | 80 |
| `slowPct` | — | — | — | 0.35 | — |
| `slowDuration` | — | — | — | 1.0 | — |
| `bleed` | 4 | — | — | — | — |
| `bleedDuration` | 3.0 | — | — | — | — |

Earthquake's `duration` and the slow its prose promises are not in the table
above; `config/areas.ts` carries both as tuning values (8 s, 30% for 1 s) for
#147's pass to confirm.

Earth Shield is Phase 1's Orbiting Boulders block plus a shared HP pool: the
ring absorbs `shieldHp` of player damage, breaks at 0, and returns after
`rechargeDelay`. Knockback on every hit — the Phase 1 pass's ask for Earth — is
now the element's baseline rather than a perk two tiers up a branch.

### 9.6 Coverage

| Mechanic | Ticket | Spells that need it |
|---|---|---|
| Companion allies | #133 | `fire_companion`, `ice_companion`, `lightning_companion`, `earth_companion` |
| Player shields | #134 | `ice_shield`, `earth_shield` |
| Persistent ground areas | #135 | `ice_blizzard`, `lightning_tornado`, `earth_quake` |
| Vortex pull | #136 | `lightning_tornado` |
| Homing projectiles | #137 | `fire_dragon` |
| Sky-strike targeting | #138 | `fire_meteor` |
| Bleed / stagger / damage reduction | #139 | `earth`, `lightning`, `lightning_chain`, `lightning_companion`, `lightning_sword`, all passives touching `damageReduction` |

Six spells need no new mechanic and can be built as soon as #130–#132 land —
`fire`, `fire_column`, `ice`, `ice_nova_bomb`, `earth_boulder` and
`lightning_sword` — reusing the projectile, orbit and pulse code Phase 1 already
has.

## 10. Presentation

Out of scope here beyond what the rosters imply; the detail belongs to
[#144](https://github.com/danhquach/crimsononslaught/issues/144) (HUD),
[#145](https://github.com/danhquach/crimsononslaught/issues/145) (FX) and
[#146](https://github.com/danhquach/crimsononslaught/issues/146) (companion
sheets). What this spec commits them to:

- The HUD shows up to three cooldowns, the equipped loadout, and a shield pool
  when one is equipped. A locked slot reads as locked with its unlock level; an
  open slot reads as open.
- Passives are visible as a list with ranks, so a run's build is legible without
  opening a menu.
- Every new spell needs FX, and the four companions need character sheets. The
  placeholder-texture path from Phase 1 §6 covers them until the art lands: each
  new spell registers a texture key and a placeholder colour on day one.

## 11. Performance

The Phase 1 cap of 300 live enemies stands. New load this adds: three cast
loops instead of one, up to four companion entities (one per active slot that
holds one), and persistent areas that overlap-test every enemy inside them each
tick. The epic's bar is the frame rate holding at the enemy cap with three
actives firing; ground areas tick on their own `tickRate` rather than per frame,
and companions share the enemy pool's spatial queries.

## 12. Testing

Unit (Vitest, `src/core/**`, no Phaser import):

- `playerProfile`: adds sum, muls multiply, a shuffled pick order gives an
  identical profile, clamps hold at the caps in §4.3.
- `loadout`: slots unlock at 3 and 7; a filled slot cannot be reassigned;
  passives are uncapped; the element lock rejects a spell from another element.
- `levelUpOffer`: three cards while nothing is capped, fewer near the end of a
  capped config, no duplicates in one offer, determinism under a seed; offers
  only unequipped actives of the run's element, exactly 3 for each of the two
  slots.
- `levelUp`: actives while a slot is open, passives once none is, the +10 max HP
  fallback at zero eligible.
- `effectiveStats`: each category multiplier reaches exactly the fields §6.1
  lists and nothing else; unscaled fields are untouched; every field of every
  one of the twenty blocks is covered by the category map.
- Per-spell math modules, one per new spell, in the shape Phase 1 uses for
  `frostNova` / `chainLightning` / `orbitingBoulders`.

Browser smoke (Playwright): a seeded run reaches level 7, ends with three
actives equipped and at least one passive owned, and the HUD shows three
cooldowns. The Phase 1 full-run guard keeps its known CI caveat
(`docs/tuning/phase1-balance.md`, follow-ups).

Boot-time config validation, in the shape Phase 1 §7 uses: every spell id in a
roster exists, every stat field appears in the §6.1 category map, every passive
field exists on `PlayerProfile`, `maxRank` is a positive integer where present,
and slot unlock levels ascend. It logs and the game still starts.

## 13. Decisions and deferrals

Answered here:

| Question | Decision |
|---|---|
| When do active slots unlock? | Levels 3 and 7 (§3.1) |
| Can a filled slot be swapped? | No, final for the run (§3.1) |
| How many passives can a run hold? | Unlimited ranks; some passives cap their own rank (§5) |
| How do stacked passives combine? | Adds summed, then muls multiplied, then clamps (§4.2) |
| How does a global passive reach one spell? | Category map plus a pure `effectiveStats`, derived at read time (§6) |
| What does level-up offer? | Actives while a slot is open, otherwise passives, never mixed (§7.1) |
| What if nothing is eligible? | +10 max HP, no overlay (§7.1) |
| What happens to the perk trees? | Deleted; each node maps to a passive, a spell property or is dropped (§8) |
| What happens to the generic perks? | Swift, Vitality and Magnet become passives (§5) |
| Do the default spells keep their ids? | Yes — `fire`, `ice`, `lightning`, `earth` (§9.1) |

Deferred, deliberately:

- **Mixing elements in one run.** A run stays locked to its default spell's
  element, as the epic states. Revisit after the rebalance.
- **Count passives** (+1 projectile, +1 chain, +1 boulder). They interact with
  every spell differently and would need a per-spell cap to stay sane. The three
  Phase 1 nodes that did this are dropped (§8).
- **Spell levels / evolutions.** Still out, as in Phase 1 §2.
- **Removing or re-rolling a pick.** No skip, no re-roll (§7.3).
- **Passive rarity or weighting.** Every eligible passive is equally likely;
  weighting is a #147 lever if the offers feel flat.
- **Enemy-type-specific damage.** The Crush node is dropped with no replacement.
- **Final numbers.** Every value in §9 and §5 is a starting point; #147 owns the
  measured pass and reconciles this document with what ships.

## 14. Ticket map

| Section | Implemented by |
|---|---|
| §3 Loadout, §4 profile | #130 |
| §3.3 per-spell cooldowns | #131 |
| §5 passives, §7 level-up, §8 retirement | #132 |
| §6 category map and `effectiveStats` | #130, refined by #132 |
| §9.2 Fire roster | #140 |
| §9.3 Ice roster | #141 |
| §9.4 Lightning roster | #142 |
| §9.5 Earth roster | #143 |
| §9.6 mechanics | #133–#139 |
| §10 presentation | #144, #145, #146 |
| §9 numbers, §13 final balance | #147 |
