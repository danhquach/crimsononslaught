# Phase 2 balance pass (CO-125)

Ticket: [#147](https://github.com/danhquach/crimsononslaught/issues/147) · Spec: `docs/superpowers/specs/2026-09-18-phase2-spells.md` §9, §13

This document collects the bot runs made as each roster lands, so #147's
rounds start from measured numbers rather than the spec's first guesses. The
method is `docs/tuning/phase1-balance.md`'s, repeated exactly: seeds 1–3,
`timeScale=4`, one mortal sweep for survival and one invulnerable sweep for the
boss time-to-kill (TTK = win time − 5:00), a scratch Playwright bot steering the
`Player` by overriding its keyboard read. Noise is about a minute on survival
across seeds, so read three seeds moving together, never one.

**Bot for the Phase 2 kits.** Every element now has a ranged default, so the
kiting stance is used for all of them: sidestep round the crowd at about 65°,
back straight off when pressed or under 40 % HP, walk to XP gems that are not
behind the crowd, hold the boss at 200–330 px and sidestep its telegraph, keep
450 px off the walls. Level-up picks are kit-first: the element's own actives
as they are offered, then Power, Haste, Expanse, Persistence, then the rest.

## Ice roster viability (#141, 2026-09-22)

Configs as merged with #141: Ice Arrow as the `ice` default, Frost Nova Bomb,
Ice Shield, Ice Companion and Blizzard at the spec §9.3 numbers; waves, enemies
and boss at the Phase 1 round 4 values. The epic's viability requirement for
Ice ("survivable to the boss") was checked against the bot floor, with the Fire
kit run through the same bot on the same day as a control.

| Kit | Mortal: survived (seeds 1–3) | Reached boss | Level at death | Invulnerable TTK | Level at 5:00 (invuln) |
|---|---|---|---|---|---|
| Ice (#141) | 3:14 · 4:05 · 3:42 | 0 / 3 | 6 · 6 · 5 | 45 · 56 · 46 s | 13 · 7 · 9 |
| Fire (#140, control) | 3:23 · 3:56 · 3:06 | 0 / 3 | 6 · 6 · 4 | — | — |
| Ice, Phase 1 baseline (for scale) | 1:19 · 1:23 · 1:13 | 0 / 3 | — | 93 · 96 · 96 s | 21 · 19 · 21 |

What the runs say:

- **Ice is no longer the hard element.** Survival went from about 1:20 to
  3:14–4:05 and the boss time from 93–96 s to 45–56 s, inside the 45–90 s
  window the Phase 1 pass set. Against the Fire kit under the same bot, Ice
  lasts as long or longer on every seed.
- **The bot floor of 5:00 is not met — by either kit.** Both die in wave four
  at level 4–6, when the crowd passes ~100 live enemies and the second active
  has only just come online (slot 2 unlocks at level 3, around 1:30–2:00; slot
  3 at level 7 was never reached in a mortal run). This is the run's Phase 2
  balance — leveling pace and wave pressure against a two-slot loadout — not
  an Ice-specific gap, and it is #147's to close. The kit-side fix the Phase 1
  pass asked for (a slow that gates Fast) is in: Frost Nova Bomb's 15 % freeze
  and Blizzard's 50 % slow were taken in every run they were offered.
- **Slot timing decides the mortal runs.** The invulnerable seeds that reached
  level 9–13 by 5:00 cleared the crowd; the mortal runs died at level 5–6 with
  one extra active. Faster early levels, or an earlier slot 2, is the lever to
  try first in #147.
- **Human play-through: pending.** The bot is a floor for a competent player;
  a hand-played Ice run on the deployed build is still owed to the epic before
  the requirement is closed.

No config was changed for this check; the numbers are recorded here so #147
starts from them.

---

# The #147 pass (2026-09-22)

**Targets (from the ticket).** An average player reaches the boss with the
majority of the four elements, and the boss dies in roughly 45–90 s. Ice and
Earth must be viable. Uncapped passives must not trivialise the boss late, and
no passive may be the always-correct pick. Config values only.

**Result.** Met on the survival target, with Fire as the marginal element and
Earth's boss fight a little under the floor. On the shipped configs three of the
four elements reach the boss — Earth 5 of 5 seeds, Lightning 4 of 5, Ice 3 of 5
— and Fire 3 of 10 across two sweeps of the same configs. Boss TTK means by
element are 45 · 48 · 69 · 72 s (Earth · Fire · Ice · Lightning), inside the
45–90 s window; across every individual run the spread is **36–81 s**, and the
low end is Earth's. Two of Earth's five mortal boss kills land at 37 s and 38 s
— genuinely under the ticket's 45 s floor, not rounding. It is called out under
the follow-ups rather than papered over. Every change is a value in
`src/config/*`; the unit tests that pinned those values and the two specs'
tables were updated with them.

## Method

As above, with three extensions:

- **Five seeds, not three, from round 4 on.** Round 3 moved Ice from 3/3 to 1/3
  and Lightning from 3/3 to 2/3 on configs that changed nothing for either
  element. Three seeds cannot separate a real 1-minute move from the noise, and
  the "reached the boss" count is a step function right at the 5:00 line, so it
  swings hardest of all. Five seeds and a mean are the smallest thing that
  reads.
- **The bot's pick policy fills slots first.** The element's own actives as
  they are offered, then the passives damage-first. This is the new level-up
  (#132), not the Phase 1 perk order.
- **A passive-policy probe** for the ticket's "no passive is always the correct
  pick" clause: the same bot, but once the active slots are full every pick
  goes into one named passive to the exclusion of all others. A passive that
  beats the spread order under its own policy is an always-pick.

Two measurement traps worth writing down, both hit during this pass:

- **Never edit `src/config/*` while a sweep is running.** Vite hot-reloads the
  page, which resets the run: the first round 6 sweep returned three Fire
  timeouts and mortal numbers a level or two below every neighbouring round. It
  was discarded and re-run untouched.
- **One working tree, one sweep.** A second session switching branches in the
  same checkout swaps the configs under a running sweep. Rounds 1 onward ran in
  a separate `git worktree` on their own port.

## Round 0 — baseline (configs as merged, seeds 1–3)

| Element | Mortal: survived | Reached boss | Invulnerable TTK | Level at end (invuln) |
|---|---|---|---|---|
| Fire | 3:36 · 2:55 · 3:43 | 0 / 3 | 34 · 46 · 46 s | 10–14 |
| Ice | 4:05 · 3:09 · 3:52 | 0 / 3 | 45 · 59 · 62 s | 12–15 |
| Lightning | 4:00 · 3:34 · 5:04 | 1 / 3 | 46 · 54 · 57 s | 13–16 |
| Earth | 3:01 · 3:29 · 5:39 | 1 / 3 | 41 · 52 · 54 s | 9–14 |

**The boss was never the problem.** Every element already killed it in 34–62 s,
inside the window. Survival was the whole gap: 2 of 12 mortal runs reached 5:00.

**Why the runs could not level.** A probe run sampling live gems alongside HP
and level found ~540 XP gems lying in the arena at 5:00 against ~165 XP banked
— about a quarter of what the run killed. Gems never expire and never move
until the player is within the pickup radius, so a run that has to back away
from a 300-strong crowd walks away from everything it just earned. At level 5–6
at death, slot 3 (level 7) had never opened in a mortal run: the loadout the
whole epic is about existed only on paper.

## Round 1 — let the run level into its own loadout

Changes: `SLOT_UNLOCK_LEVELS` [3, 7] → **[2, 5]**; `PICKUP_RADIUS` 40 → **60**.

| Element | Mortal: survived | Reached boss | Invulnerable TTK |
|---|---|---|---|
| Fire | 2:27 · 3:03 · 3:43 | 0 / 3 | 35 · 38 · 41 s |
| Ice | 3:38 · 5:43 · 3:48 | 1 / 3 | 41 · 45 · 57 s |
| Lightning | 3:31 · 4:47 · 4:06 | 0 / 3 | 43 · 50 · 56 s |
| Earth | 3:18 · 5:36 · 5:29 | 2 / 3 | 31 · 33 · 46 s |

The XP fix worked on its own terms — end-of-run level went 4–6 to 7–8, so slot 3
opens in a mortal run now — but survival did not move (3 of 12, inside the
noise). The side effect was the tell: more passive ranks pulled Fire and Earth's
boss TTK down to 31–41 s, under the floor. More levels alone buys output, not
life.

## Round 2 — take the pressure off waves 3–5

Changes: spawns/s per wave 1.5 / 2.5 / **3.5 / 4.5 / 5** → 1.5 / 2.5 / **3 /
3.5 / 4** (870 spawns over a run, was 1020); boss HP 1500 → **1800**.

| Element | Mortal: survived | Reached boss | Invulnerable TTK |
|---|---|---|---|
| Fire | 4:01 · 3:58 · 4:17 | 0 / 3 | 35 · 40 · 44 s |
| Ice | 6:04 · 5:40 · 5:47 | **3 / 3** | 50 · 56 · 63 s |
| Lightning | 5:12 · 6:01 · 5:53 | **3 / 3** | 53 · 53 · 67 s |
| Earth | 4:23 · 4:33 · 5:44 | 1 / 3 | 37 · 43 · 44 s |

The single biggest move of the pass. Every run had been dying between 3:00 and
4:30, exactly where the crowd passes 150 live and climbs to the 300 cap; taking
about 15 % off waves 3–5 turned Ice and Lightning from 0–1 of 3 into 3 of 3.
Fire and Earth were left as the hard pair, both with boss fights that were still
too short.

## Round 3 — reach for Fire and Earth, not damage

Fire and Earth needed to clear a crowd better while killing a lone boss no
faster, so the levers are all area: an `aoeRadius` is worth a great deal against
a hundred enemies and almost nothing against one.

Changes: Fire Bolt `aoeRadius` 50 → **65**; Meteor `aoeRadius` 110 → **130**;
Fire Column `radius` 40 → **55**; Earth Spike `radius` 40 → **55**; Boulder
`pierce` 3 → **5**; Earthquake `radius` 160 → **180**; boss HP 1800 → **2000**.

| Element | Mortal: survived | Reached boss | Invulnerable TTK |
|---|---|---|---|
| Fire | 4:24 · 3:29 · 5:03 | 1 / 3 | 36 · 44 · 58 s |
| Ice | 5:58 · 4:31 · 4:09 | 1 / 3 | 51 · 61 · 64 s |
| Lightning | 5:57 · 6:05 · 3:00 | 2 / 3 | 57 · 57 · 67 s |
| Earth | 5:40 · 5:38 · 5:42 | **3 / 3** | 36 · 36 · 45 s |

Earth went 1/3 to 3/3 and the shape held. But Ice fell from 3/3 to 1/3 and
Lightning from 3/3 to 2/3 on configs that touched neither element — three seeds
were not enough to tell a change from the noise. From here the sweeps use five.

## Round 4 — five seeds, and a Fire lever

Changes: boss HP 2000 → **2200**; Fire Column `cooldown` 3.0 → **2.2** and
`burn` 6 → **8** (Fire's only wide, repeatable crowd tool).

| Element | Mortal: survived (seeds 1–5) | Reached boss | Invulnerable TTK | mean |
|---|---|---|---|---|
| Fire | 3:49 · 3:44 · 3:59 · 5:13 · 5:03 | 2 / 5 | 39 · 39 · 41 · 56 · 68 s | 48.6 |
| Ice | 4:57 · 6:00 · 3:53 · 5:49 · 5:59 | 3 / 5 | 48 · 55 · 55 · 57 · 70 s | 57.0 |
| Lightning | 6:13 · 4:49 · 5:59 · 4:27 · 6:10 | 3 / 5 | 52 · 60 · 63 · 67 · 71 s | 62.6 |
| Earth | 5:56 · 5:41 · 5:44 · 5:56 · 5:36 | **5 / 5** | 38 · 38 · 39 · 47 · 51 s | 42.6 |

Three elements at 3/5 or better and Earth perfect. Fire was still the outlier
and Earth's boss fight still the shortest.

## Round 5 — Meteor, Fire only

Change: Meteor `cooldown` 4.0 → **3.2**. Fire's crowd wipe on a shorter leash.

| Element | Mortal: survived (seeds 1–5) | Reached boss | Invulnerable TTK | mean |
|---|---|---|---|---|
| Fire | 5:01 · 5:52 · 4:05 · 3:47 · 5:03 | 3 / 5 (first mortal win, 52 s) | 31 · 39 · 43 · 44 · 52 s | 41.8 |

Bought the survival it was meant to (2/5 → 3/5, and Fire's first win without the
invulnerability hook) at the cost of the boss floor: mean TTK 48.6 → 41.8 s.

## Round 6 — restore the floor, and confirm

Change: boss HP 2200 → **2400**. Nothing else; this is the confirmation sweep.

| Element | Mortal: survived (seeds 1–5) | Reached boss | Mortal TTK | Invulnerable TTK | mean (invuln) |
|---|---|---|---|---|---|
| Fire | 2:49 · 3:50 · 4:43 · 3:14 · 3:40 | 0 / 5 | — | 41 · 42 · 46 · 56 · 57 s | 48.4 |
| Ice | 5:18 · 6:09 · 3:14 · 3:58 · 5:54 | 3 / 5 | 55 · 69 s | 54 · 70 · 72 · 74 · 77 s | 69.4 |
| Lightning | 5:53 · 3:04 · 5:06 · 6:06 · 6:20 | **4 / 5** | 54 · 66 · 80 s | 59 · 67 · 73 · 81 · 81 s | 72.2 |
| Earth | 5:36 · 5:47 · 5:49 · 5:48 · 5:38 | **5 / 5** | 37 · 38 · 48 · 49 · 50 s | 36 · 41 · 46 · 49 · 54 s | 45.2 |

**Fire's 0/5 here against round 5's 3/5 is the noise, not a regression.** Boss HP
is the only change between the two sweeps and it cannot touch a run before 5:00.
Fire's kit is identical in both, so the honest figure is the pooled one: **3 of
10**. Fire sits right on the 5:00 line, which is exactly where the step-function
count is least stable — the Phase 1 pass reported its Fire at 3 of 6 for the
same reason.

## Passives: is one of them always right?

The ticket asks two things of the uncapped passives — that they not trivialise
the boss late, and that none be the always-correct pick. Both are one
experiment: run the same element and seeds with a policy that pours every pick
after the actives into a single passive, and compare against the tuning order.

Lightning, invulnerable, seeds 1–3, shipped configs (levels 11–16 by 5:00):

| Policy | TTK (seeds 1–3) | mean TTK |
|---|---|---|
| Haste only | 79 · 55 · 60 s | **64.7 s** |
| Persistence only | 80 · 68 · 65 s | 71.0 s |
| Spread (the tuning order) | 68 · 84 · 67 s | 73.0 s |
| Power only | 77 · 66 · 80 s | 74.3 s |
| Expanse only | 85 · 83 · 68 s | 78.7 s |
| Vitality only | 81 · 79 · 86 s | 82.0 s |
| Ward only | 94 · 70 · 84 s | 82.7 s |

- **No passive is the always-correct pick.** Power — the uncapped flat damage
  multiplier, the obvious suspect — is *not better than spreading*: 74.3 s
  against 73.0 s, well inside the noise. Haste is the strongest single stack at
  64.7 s, and it runs into `cooldownMul`'s 0.35 clamp at about thirteen ranks,
  so it stops paying long before a run ends. The four uncapped passives span
  64.7–78.7 s: the choice between them moves the run, and none of them wins by
  default.
- **Uncapped stacking does not trivialise the boss.** The best single-passive
  stack available still needs 64.7 s mean, and no individual run in the table
  went under 55 s. A pure-damage late run stays inside 45–90 s.
- Ward and Vitality trailing at ~82 s is the cost of defence measured with the
  invulnerability hook on, where defence buys nothing. It is the opportunity
  cost, not a verdict on either passive.

The matching Earth mortal sweep was cut short for machine load; the Lightning
table above answers both clauses on its own, but a survival-side policy sweep
would be the natural follow-up.

## Final values versus the merged baseline

| Table | Field | Was | Now | Why |
|---|---|---|---|---|
| `loadout.ts` | `SLOT_UNLOCK_LEVELS` | [3, 7] | **[2, 5]** | No mortal run passed level 7, so slot 3 never opened; the spec's guess came from invulnerable level counts |
| `gems.ts` | `PICKUP_RADIUS` | 40 | **60** | ~540 gems left on the ground at 5:00 against ~165 XP banked; the run could not level into its own loadout |
| `waves.ts` | spawns/s, waves 3–5 | 3.5 / 4.5 / 5 | **3 / 3.5 / 4** | Every run died 3:00–4:30 as the crowd climbed to the 300 cap; the single biggest survival lever |
| `boss.ts` | `hp` | 1500 | **2400** | Three actives and an uncapped passive stack out-damage one spell and a 7-node tree; holds the fight in 45–90 s |
| `spells.ts` | Fire Bolt `aoeRadius` | 50 | **65** | Crowd reach for Fire, which has no crowd control; worth little against a lone boss |
| `spells.ts` | Earth Spike `radius` | 40 | **55** | Same, for Earth. Superseded by #205: the spike is a flying single-target shot with no `radius` |
| `strikes.ts` | Meteor `cooldown` / `aoeRadius` | 4.0 / 110 | **3.2 / 130** | Fire's crowd wipe; took Fire from 2/5 to 3/5 |
| `fireRoster.ts` | Fire Column `cooldown` / `radius` / `burn` | 3.0 / 40 / 6 | **2.2 / 55 / 8** | Fire's only wide repeatable tool |
| `earthRoster.ts` | Boulder `pierce` | 3 | **5** | Pure crowd value — pierce does nothing against one target |
| `areas.ts` | Earthquake `radius` | 160 | **180** | Earth's ground area, matched to the Blizzard it competes with |

Card stat strings follow the new values. Both specs were reconciled in place —
Phase 2 §3.1, §9.2, §9.5 and the §13 decision rows, Phase 1 §5's pickup radius,
spawn table and boss HP — so "matches spec" in the config tests stays true, and
the tests that pinned the old numbers were updated with them.

## What did not change, and why

- **The passive table (§5).** Thirteen passives, same fields, ops, amounts and
  caps as the spec's first guess. The policy sweep says the shape works: no
  always-pick, no trivialised boss. Weighting the offers, which §13 left as a
  #147 lever, was not needed.
- **The profile clamps (§4.3).** `cooldownMul`'s 0.35 floor is what stops the
  Haste stack, and it does the job.
- **Enemy archetypes and contact damage.** The Phase 1 pass had already halved
  contact; the Phase 2 deaths are crowd volume, not per-touch damage.
- **XP curve and 1 XP per gem.** The collection rate was the problem, not the
  curve. Raising the curve would have handed out levels; raising the radius let
  the player go and get them.
- **Player HP and speed.** Out of this ticket's remit, as in Phase 1.

## Follow-ups

- **Human play-through is still owed.** The epic requires Ice and Earth checked
  by a human on the keys at `timeScale=1` on the deployed build, not only by the
  bot. That is not something this pass could do; it is the one acceptance
  criterion on #147 left open, and it needs a person and the deployed build.
- **Fire is the marginal element** at 3 of 10 runs to the boss, where Earth is
  5 of 5. It is the flip of Phase 1, where Fire was the easy spell and Ice and
  Earth the hard pair. Fire is the one element with neither crowd control nor a
  defensive spell in its roster — every other element has a slow, a pull or a
  shield. One more notch is available (Fire Dragon's cooldown, or a slow on the
  Column's burn), but which way Fire should go is a feel call for a human.
- **A survival-side passive policy sweep**, the Earth mortal half that was cut
  here, would confirm that Ward and Vitality are not always-picks on the axis
  where they actually pay.
- **`e2e/shield.spec.ts` was timing-coupled to the spawn rates** and this pass
  broke it: the wave 3-5 trim means a standing player is first touched around
  75 s of run instead of ~40 s, so the guard's 100 s window ended mid-drain and
  never saw a pool recharge. Widened to 150 s of run here, which holds 4 of 4
  under a 4x and 8x CPU throttle. Any future spawn-rate change should re-check
  it — an e2e guard that samples a fixed window is a hidden dependency on how
  fast the arena fills.
- **Earth's boss fight is the shortest and dips under the floor.** Mortal TTK
  across its five seeds is 37 · 38 · 48 · 49 · 50 s (mean 44.4); two of the five
  are under 45 s. Earth is the only element that both reaches the boss every
  time and arrives over-levelled, so it brings the most damage to the fight.
  Boss HP cannot fix it alone — Lightning is already at 72 s mean and another
  raise would push Lightning past 90 s before it pulled Earth to 45 s. The lever
  is Earth's single-target output (Boulder's `damage`, which `pierce` 5 has
  already compensated for on the crowd side), and it wants one more round.
- **Lightning's boss fight is the longest** at 72 s mean and 81 s at the top of
  the range, close to the 90 s ceiling. Another boss-HP raise would push it out.
- **The `e2e/fullRun.spec.ts` Earth guard** has been red on CI since #93 for
  frame-length reasons unrelated to balance (see the Phase 1 doc). It passes
  locally on these configs — the Fire and Earth runs take 26.2 s and 27.0 s of
  a 90 s budget — but boss HP at 2400 spends more of that budget on the boss
  phase than 1500 did, so the guard has less room on the hosted runner than
  before. It still needs the CO-091-class fix it has been waiting for.

---

# Consumables and survival (#128, 2026-09-23)

Ticket: [#128](https://github.com/danhquach/crimsononslaught/issues/128) · Spec: `docs/superpowers/specs/2026-09-23-twenty-minute-run-design.md` §4.2

**Question.** #128 adds a health pickup, and every survival number above
assumed nothing on the floor healed. Does it move survival for the two weakest
elements, Fire and Ice?

**Answer: no, at the shipped drop rate.** The owner cut the consumable chance
from 3% to 0.3% before this sweep, so a consumable is a rare find. In ten runs
on the branch the bot picked up two consumables in all, none of them in a Fire
run. Healing had almost no chance to act, and no config was changed.

**Method.** Not comparable to the rounds above. The run is 20 minutes since
#127, and the bot is a new scratch Playwright bot built for this check: it
steers by overriding the player's keyboard read, is pushed away from nearby
enemies weighted by distance, sidesteps round the crowd at 65° unless hurt,
keeps off the walls, walks to consumables within 350 px (a health pickup within
700 px when under 70% HP), and to gems when nothing is close. Level-ups always
take the first card. Seeds 1–5, `timeScale=4`, mortal. `main` (337ee57) and
the branch ran side by side on their own ports, two runs at a time. On `main`
a consumable is #195's stub: 3% of deaths, no effect when picked up.

| Kit | Build | Survived (seeds 1–5) | Mean | Consumables picked up |
|---|---|---|---|---|
| Fire | main | 9:20 · 9:39 · 12:52 · 3:28 · 4:25 | 7:57 | 13 · 19 · 8 · 4 · 8 (no effect) |
| Fire | branch | 7:07 · 4:31 · 3:04 · 8:55 · 7:22 | 6:12 | 0 · 0 · 0 · 0 · 0 |
| Ice | main | 3:26 · 3:13 · 4:34 · 4:23 · 4:31 | 4:01 | 0 · 2 · 1 · 3 · 2 (no effect) |
| Ice | branch | 4:24 · 6:10 · 4:31 · 3:19 · 4:33 | 4:36 | 1 · 1 · 0 · 0 · 0 |

No run reached the 20:00 boss.

What the runs say:

- **The gaps are noise, not the pickups.** Fire's branch mean is 1:45 lower and
  Ice's 0:35 higher, but the Fire branch runs took no consumable at all, so
  nothing #128 added acted in them. One seed on `main` alone spans 3:28 to
  12:52. The two builds also walk different paths: `main`'s bot detours to ten
  times as many (inert) stubs.
- **At 3% it would have mattered.** One smoke run of the bot on the branch,
  before the cut, used Fire seed 1 at 3%. It picked up 42 consumables and
  survived the full 20:00 at level 42, where the same seed lasts 7:07 at 0.3%.
  One sample, but it points the same way as the owner's call: at 3% a
  consumable is a given, not a relief.
- **No tuning change.** If the drop rate is ever raised, re-run this sweep
  first; health and the bomb together are then enough to carry a run.

---

# Earth Spike as a flying shot (#205, 2026-09-25)

#205 turned Earth Spike from an instant eruption under the target, which hit
every enemy within 55 px for a 70 px shove and always bled, into a slow shot:
260 px/s over its 144 px range, stopping at the first enemy it touches
(`pierce` 1), a 25 px shove and a 5% bleed chance per hit. Damage (16) and
cooldown (1.1 s) are unchanged. The ticket asked for Earth's boss time to be
re-checked after the change, with `damage` as the lever if Earth fell short.

**Method.** The CO-125 bot adapted for the 20-minute run (boss at 20:00,
TTK = win time − 20:00, the Intro screen answered first), kit-first picks,
seeds 1–5, `timeScale=4`. The branch and `main` (bfe1b4f) each ran from their
own worktree on their own port, two runs at a time. The `main` mortal row is the
#175 re-measure on 8a16e15; Earth's kit is the same on both commits.

| Build | Mode | Survived (seeds 1–5) | Reached boss | Boss TTK | mean |
|---|---|---|---|---|---|
| branch | mortal | 20:02 · 20:42 · 21:28 · 20:36 · 20:41 | 5 / 5 | — · 42 · 88 · 37 · 42 s | 52 |
| main (8a16e15) | mortal | 20:44 · 21:07 · 16:29 · 20:54 · 20:47 | 4 / 5 | 44 · 68 · — · 54 · 48 s | 54 |
| branch | invulnerable | all won | 5 / 5 | 75 · 31 · 44 · 45 · 43 s | 47.6 |
| main | invulnerable | all won | 5 / 5 | 52 · 48 · 32 · 60 · 45 s | 47.4 |

Seed 1 on the branch reached the boss and died two seconds into the fight.

- **Earth did not get weaker where it counts.** It still reaches the boss on
  every seed, and the boss time is unchanged to within the noise (invulnerable
  mean 47.6 s against 47.4 s). By 20:00 an Earth run is level 34–50 with
  Boulder, Earthquake and the passives stacked, so the default is a small part
  of the fight, and it was never Earth's crowd clear either.
- **No tuning change.** `damage` stays 16. Both builds show one invulnerable
  run near 31–32 s. That is #210's 20-minute boss floor question, not this
  spell's.
