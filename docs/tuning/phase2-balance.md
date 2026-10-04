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

**The dash (#384).** The bot never presses Space or pad A: it overrides only the
`Player`'s keyboard move read, and the dash is read from its own Space key event
and pad button. Every figure in this document is therefore a no-dash run and
stays valid; a bot that dashes is a separate decision, and its runs would not be
comparable with these.

## The sweep tool (#407)

The bot is now a committed tool, `scripts/sweep/`, so a balance sweep is one
command instead of a scratch script. It changes no game code: it steers the
`Player` by overriding its keyboard read, as above, and plays the level-up and
spell-select screens by key.

```
npm run sweep -- --elements fire,ice --seeds 1-5 --sweeps 2 --out sweep-results/run.jsonl
npm run sweep:summary -- sweep-results/run.jsonl
```

**Options.** `--elements` (default all four), `--seeds` (`1-5` or `1,3,7`,
default 1–5, at most 100), `--sweeps N` (the whole set N times, default 1),
`--port` (default 5190), `--loadout fire,fire_dragon:3` (the game's `?loadout=`
switch), `--invulnerable` (`?invulnerable=1`), `--dash` (the bot dashes; off by
default, because the figures here are no-dash runs), `--out` (a `.jsonl` file,
default `sweep-results/runs.jsonl`, git-ignored). Every value is allow-listed, so
a bad flag fails before a browser starts. Runs go at `timeScale=8`.

**What it does.** Starts its own Vite server from the checkout, plays one run
per element, seed and sweep in a fresh headless Chromium, and appends one JSON
line per run: outcome (`win`, `death`, `stall-timeout`, `error`), time
survived, boss kill time, levels, the final build, HP lost by source, minutes at
the enemy cap, one sample per minute (live enemies, level, fps, boss HP), the
commit, whether `src/` or `public/` had uncommitted changes (`dirty`), and the
options. A run still alive at 40:00 is a stall.

**Resume.** Rerunning the same command skips runs already finished under the
same options **and on the same commit**; runs that ended in `error` are played
again. A new commit, a changed option, or a record marked `dirty` (uncommitted
changes in `src/` or `public/`) all play again, so a file never mixes builds
under one resume. `dashes` in a record counts the dashes the bot queued.

**Summary.** `sweep:summary` prints the run table, the group tables (all runs,
per element, with and without a reach spell, per sweep), wins per extra active,
and the death and frame-rate lines. It reproduces the #406 tables from that
sweep's results file.

**Known limits.**

- The bot kites perfectly and never closes in, so it overstates survival for
  kits that need to be near the crowd. Compare pooled sweeps of about 40 runs
  (4 elements, 5 seeds, 2 sweeps); one sweep, or one seed, is noise.
- `suspectBot` is set when the bot is level 5 or less at 10:00 (it is probably
  stuck). It is a warning only; it does not change the outcome.
- HP lost misses damage taken on the same step as a heal.
- Run one sweep at a time, and in its own worktree: a second sweep or a test
  run on the same machine slows the game and skews the frame-rate figures.
- The bot reads game fields by name. A renamed or removed field stops the
  sweep with `sweep: game field missing: <path>` rather than steering on
  nothing; update `scripts/sweep/bot.mjs` to match.

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

---

# The expanded enemy roster (#126, 2026-09-27)

Ticket: [#126](https://github.com/danhquach/crimsononslaught/issues/126) · Spec: `docs/superpowers/specs/2026-09-14-phase1-design.md` "Enemies"

**Question.** #126 added four enemy types (ranged from 6:00, exploder from 8:00,
splitter from 10:00, shielded from 12:00) and nine scheduled elites. Does the
20-minute run stay winnable with every element?

**Answer: not yet, and the rest belongs to #210.** On the commit before #126,
the bot won 20 of 20 runs. With the roster as merged it won 10 of 20. Three
changes, all config values, bring it to 7 of 12 on seeds 1–3, where the
baseline won 12 of 12. Two further levers did not move the count, so the
remaining gap goes to #210's pass over the whole run.

**Method.** This is a before-and-after comparison, not a balance target. The
baseline is `fb06b0b`, the last commit before #126; nothing merged since then
changes balance, only sound, music, the Help screen and the player name. The
bot is a new scratch Playwright bot built along the lines of the #128 bot:

- It steers by overriding the player's keyboard read on every simulation step.
- It is pushed away from enemies within 320 px, weighted by distance (the boss
  4x, an elite 2x), and from enemy shots within 220 px.
- It sidesteps round the crowd at 65°. It backs straight off when pressed or
  under 40 % HP.
- It keeps 450 px off the walls.
- It walks to a chest within 700 px, to a consumable within 350 px (a health
  pickup within 700 px when under 70 % HP), and otherwise to the nearest XP gem
  that no enemy is standing on.
- It holds the boss at 200–330 px.
- It picks actives first, then Power, Haste, Expanse and Persistence, then
  anything else.

The sweeps used `timeScale=4`, mortal runs and a fresh context each time, from
their own worktrees on their own ports, two runs at a time. A win's boss
time-to-kill is `timeSurvivedMs − 1 200 000`. The bot also logs the HP lost to
shots, blasts and contact, and the live types every minute.

Two limits on this method:

- **Rounds 2 and 3 used seeds 1–3, and their last ten runs used
  `timeScale=8`.** Both were cut to save time. `Player.update` runs once per
  ~16 ms simulation step at any time scale, so 8x plays the same simulation as
  4x, only faster. Three seeds only show a large change; the doc's own
  earlier rounds found that three seeds cannot separate a one-run move from
  noise.
- **The bot changed after round 1.** It was taught to walk at a ranged enemy
  when no melee enemy is within 150 px (see round 2). Baseline has no ranged
  enemies, so its numbers stand. The main-with-new-bot runs were dropped to save
  time after two (Fire seed 1 lost where the old bot won; Ice seed 1 won). How
  much of round 2's gain is the bot, not the config, is therefore not measured.

## Round 0 — before and after #126 (seeds 1–5)

| Element | Baseline `fb06b0b` | #126 as merged (`c1e868c`) |
|---|---|---|
| Fire | 5 / 5 · TTK 23–46 s | 1 / 5 · died 8:44–10:03 |
| Ice | 5 / 5 · TTK 24–64 s | 3 / 5 · died 8:05, 9:59 |
| Lightning | 5 / 5 · TTK 56–99 s | 2 / 5 · one a stall (below) · died 9:49–15:11 |
| Earth | 5 / 5 · TTK 43–216 s | 4 / 5 · one a stall · died 8:45 |
| **Total** | **20 / 20** | **10 / 20** |

Winning runs on the baseline ended at level 43–68. The winning runs on main that
did not stall ended at level 35–60.

What the runs say:

- **Both builds run the same until 6:00.** Mean level each minute matched to
  within half a level through 5:00 (both builds reach 11.5 by then), and both
  gather the same tank wave at 4:00–5:00. From 6:00 main carried 89–133 live
  enemies against 60–88 on the baseline.
- **Ranged enemies could not be killed by a kiting player.** They hold
  200–240 px off and fire from 260 px, but every element's default spell
  reaches only 144–189 px (Earth 144, Fire and Lightning 150, Ice 189). By
  8–10 minutes 80–120 of them stood round the player, unkillable and filling
  the 300 cap. With the cap full nothing new spawns, so the run stops paying
  XP.
- **Two runs stalled.** Lightning seed 2 and Earth seed 5 hit a cap of tanks and
  ranged enemies that never caught the player. They went on with no kill and no
  hit for over ten minutes, reached the boss at level 18–19, and needed
  21–36 minutes to kill it. A player who only kites can stall the whole run.
- **Exploder blasts did most of the killing.** In seven of the eight deaths
  measured, blasts took 40–82 % of the HP lost and shots 17–29 %. The eighth,
  Ice seed 5, died at 8:05, five seconds after exploders joined, to contact
  and shots.

## Isolation runs (Fire, seeds 1–5)

Fire was the element #126 hurt most, so two single changes were run on it:

| Change | Fire wins |
|---|---|
| none (round 0) | 1 / 5 |
| A: no elites (one swarm elite at 19:59.9, to keep the mark pool non-empty) | 3 / 5 |
| B: `EXPLODER_BLAST.damage` 16 → 8 | 2 / 5 |

Both were real causes. With the elites off, the tank build-up from 5:00 mostly
went away: an 8x elite tank near the player soaked single-target fire while its
crowd grew.

## Round 1 — elite HP and the blast (seeds 1–5)

Changes: `ELITE.hpMul` 8 → **4**; `EXPLODER_BLAST.damage` 16 → **8**.

| Element | Wins | Runs |
|---|---|---|
| Fire | 3 / 5 | two deaths at 8:25, 9:12 |
| Ice | 5 / 5 | one stall (TTK 313 s at level 23) |
| Lightning | 3 / 5 | died 10:14 and 22:44 |
| Earth | 4 / 5 | died 8:25 |
| **Total** | **15 / 20** | |

Better, but the ranged build-up was untouched, and it explained the low-level
wins as well as the stalls.

## Round 2 — bring ranged enemies within reach (seeds 1–3)

Changes: `RANGED_ATTACK.keepDistance` 240 → **170** and `fireDistance` 260 →
**190**, so it holds 130–170 px off, a step from every default reach; the bot
walks at a ranged enemy when no melee enemy is near. Round 1's changes are kept.

| Element | Baseline, seeds 1–3 | Round 2 |
|---|---|---|
| Fire | 3 / 3 | 1 / 3 · died 8:15, 12:13 |
| Ice | 3 / 3 | 3 / 3 |
| Lightning | 3 / 3 | 1 / 3 · died 10:28, 11:36 |
| Earth | 3 / 3 | 2 / 3 · died 9:44 |
| **Total** | **12 / 12** | **7 / 12** |

The build-up is gone: 11–34 ranged enemies were alive at the deaths, against
80–120 in round 0, and no run stalled. The deaths are spread over blasts, shots
and contact, and Fire still collects tanks (128–200 alive at its deaths).

## Round 3 — stronger levers (seeds 1–3, not shipped)

Changes on top of round 2: exploders join at 10:00 instead of 8:00;
`EXPLODER_BLAST.damage` 8 → 6; `ELITE.damageMul` 1.5 → 1.25; the elite schedule
reshuffled so each elite's type is still in its row's crowd.

| Element | Round 3 |
|---|---|
| Fire | 0 / 3 · died 10:35, 11:29, and 20:06 in the boss fight |
| Ice | 2 / 3 · died 13:35 |
| Lightning | 2 / 3 · one a stall (TTK 641 s) · died 12:49 |
| Earth | 3 / 3 |
| **Total** | **7 / 12** |

Same count as round 2; the changes moved which runs died, not how many. With
shots, blasts and contact now each only part of any death, no #126 lever is left
that clearly outweighs the noise of three seeds. Round 2's values ship, since
they change the wave table and the elite schedule not at all.

## Frame rate at the cap

The bot sampled `game.loop.actualFps` and the live count every run-minute. Across
19 runs on #126 builds there are 179 samples with 295–301 enemies alive (the cap
plus the boss's own slot), every regular type mixed in including splitlings:
**60–61 fps in every one**, headless Chromium on a desktop, at 4x and 8x. A
separate probe at 18:00 read every pool against its cap each 5 s for 150 s:
enemies, shots (max 60), gems, pickups, effects and elite marks (max 9) never
passed their caps. The CI runner draws about 10 fps (#94) and was not measured.

## Final values versus the #126 starting values

| Table | Field | Was | Now | Why |
|---|---|---|---|---|
| `enemies.ts` | `RANGED_ATTACK.keepDistance` / `fireDistance` | 240 / 260 | **170 / 190** | Held past every default spell's reach, ranged enemies outlived a kiting player, filled the cap and stalled two runs |
| `enemies.ts` | `EXPLODER_BLAST.damage` | 16 | **8** | Blasts were 40–82 % of the HP lost in seven of eight deaths after 8:00; Fire went 1/5 → 2/5 on this alone |
| `enemies.ts` | `ELITE.hpMul` | 8 | **4** | An 8x elite tank at 5:00 soaked single-target fire while the crowd grew; Fire went 1/5 → 3/5 with elites off |

The phase1 spec's Ranged and Exploder rows were updated with them. A new unit
test pins the rule round 0 found: a ranged enemy's inner edge sits inside every
default spell's reach.

## What did not change, and why

- **The wave table, the elite schedule, `ELITE.damageMul` and `gemMul`.**
  Round 3 changed three of them for no gain in wins.
- **Splitter and shielded stats.** Neither showed up as a cause: at the deaths
  they were a few of the enemies near the player, never the main source of HP
  lost.
- **Ranged shot damage and fire interval.** Shots took a larger share once ranged
  enemies came in range (44–318 HP in round 3's deaths). They are the next lever
  if #210 wants one.

## Follow-ups

- **#210 owns the remaining gap:** 7 of 12 against the baseline's 12 of 12, with
  deaths at 8:15–13:35. The wave multipliers (`hpMul`, `damageMul`,
  `spawnsPerSecond` from 6:00) are the whole-run levers, and #210's pass sets
  them.
- **Fire is again the weak element.** It won 1 of 3 in round 2 and 0 of 3 in
  round 3, and still collects tanks, which its single-target default cannot
  clear.
- **Stalls are possible.** A crowd that fills the cap and never reaches the
  player freezes the run. Pulling ranged enemies in removed the cases seen here
  (none in round 2). A cap made of slow tanks alone could still do it.
- **Five-seed confirmation of the shipped values was skipped** at the owner's
  call. So was the main-with-new-bot row that would separate the bot's share
  of the gain from the config's.

# The 20-minute run (#210, 2026-09-28)

Ticket: [#210](https://github.com/danhquach/crimsononslaught/issues/210) · Spec: `docs/superpowers/specs/2026-09-23-twenty-minute-run-design.md`

**Question.** #127 made the run 20 minutes long with the boss at the end, on
starting values. Does every element reach the boss, and does the boss fall in
the 45–90 s window? The PM kept that window for the 20-minute run, and asked for
Fire to be lifted rather than left as the hard element.

**Answer: `main` ships unchanged. The wave table cannot close the gap that is
left.** Two sweeps of `main` won 28 of 40 runs. The best candidate, with four
changes (below), won 29 of 40, which is the same number inside the noise.
Where the boss falls outside the window, the loadout is the cause, not the
waves: builds with little reach stall the run and drag the boss fight out,
whatever the waves do. That goes to a follow-up.

**Method.** The #126 bot and method, unchanged: fills the slots first, then
passives damage-first. Mortal runs, 5 seeds × 4 elements, `timeScale=8`, one
sweep per working tree on its own port, two runs at a time, a fresh Vite server
for each round, no config edits mid-sweep. The bot now also logs the full
loadout from the result screen (spells, passives with ranks, relics).

**The noise sets what this pass can see.** Rounds 4 and 5 run identical configs
up to 20:00; only boss HP differs, which cannot matter before the boss. They
won 17/20 and 12/20, and Earth alone went 5/5 → 2/5. The seed fixes the crowd,
not the run: level-up timing, and with it the offers, shift with the frame
timing. At 20 runs a round, a change under about 5 wins cannot be told from
noise.

## Round 0 — `main` (`ab5ff1f`), two sweeps

Second sweep, with loadouts (the element's default spell is always slot 1):

| Element | Seed | Result | Level | Boss TTK | Other actives | Passives (ranks) |
|---|---|---|---|---|---|---|
| Fire | 1 | win 20:48 | 48 | 48 s | Fire Companion, Fire Wave | Persistence 11 · Power 9 · Haste 8 · Expanse 8 · Vitality 3 · Velocity 2 · Avarice 2 · Savagery 1 · Regeneration 1 |
| Fire | 2 | died 14:23 | 37 | — | Fire Wave, Fire Companion | Expanse 6 · Haste 4 · Vitality 4 · Avarice 4 · Persistence 3 · Ward 2 · Precision 2 · Regeneration 2 · Magnet 2 · Power 2 · Savagery 1 · Velocity 1 · Swift 1 |
| Fire | 3 | win 20:44 | 46 | 44 s | Fire Dragon, Fire Wave | Power 9 · Haste 7 · Ward 6 · Persistence 6 · Expanse 4 · Vitality 3 · Regeneration 2 · Magnet 2 · Precision 1 · Swift 1 · Velocity 1 · Savagery 1 |
| Fire | 4 | win 20:27 | 55 | 27 s | Fire Companion, Fire Wave | Haste 11 · Power 11 · Expanse 11 · Persistence 6 · Precision 4 · Vitality 3 · Savagery 2 · Ward 1 · Velocity 1 · Avarice 1 · Regeneration 1 |
| Fire | 5 | died 10:34 | 26 | — | Meteor, Fire Companion | Haste 8 · Expanse 5 · Power 4 · Swift 2 · Velocity 2 · Precision 2 |
| Ice | 1 | win 22:05 | 52 | 125 s | Frost Nova Bomb, Ice Shield | Power 14 · Haste 7 · Regeneration 5 · Persistence 4 · Expanse 3 · Avarice 3 · Magnet 3 · Savagery 3 · Velocity 3 · Precision 2 · Ward 1 · Swift 1 |
| Ice | 2 | died 9:34 | 16 | — | Ice Companion, Ice Storm | Persistence 4 · Expanse 3 · Haste 2 · Regeneration 1 · Power 1 · Ward 1 · Precision 1 |
| Ice | 3 | win 21:11 | 48 | 71 s | Frost Nova Bomb, Ice Shield | Power 12 · Haste 11 · Persistence 5 · Expanse 5 · Velocity 3 · Vitality 3 · Regeneration 2 · Avarice 2 · Swift 1 · Savagery 1 |
| Ice | 4 | win 20:39 | 55 | 39 s | Frost Nova Bomb, Ice Companion | Power 11 · Expanse 11 · Haste 10 · Persistence 8 · Velocity 3 · Ward 3 · Vitality 2 · Swift 1 · Avarice 1 · Magnet 1 · Regeneration 1 |
| Ice | 5 | win 20:41 | 55 | 41 s | Ice Companion, Frost Nova Bomb | Power 12 · Expanse 12 · Haste 9 · Avarice 3 · Regeneration 3 · Persistence 3 · Swift 2 · Savagery 2 · Magnet 2 · Velocity 2 · Vitality 1 · Ward 1 |
| Lightning | 1 | win 25:53 | 46 | 353 s | Lightning Sword, Chain Lightning | Haste 13 · Power 10 · Expanse 6 · Persistence 4 · Magnet 2 · Velocity 2 · Avarice 2 · Savagery 1 · Regeneration 1 · Swift 1 · Ward 1 |
| Lightning | 2 | died 8:52 | 20 | — | Tornado, Chain Lightning | Expanse 4 · Savagery 3 · Ward 2 · Power 2 · Haste 1 · Avarice 1 · Persistence 1 · Magnet 1 · Swift 1 · Velocity 1 |
| Lightning | 3 | win 23:04 | 31 | 184 s | Lightning Sword, Lightning Companion | Haste 9 · Power 5 · Expanse 4 · Regeneration 2 · Persistence 2 · Ward 1 · Vitality 1 · Precision 1 · Swift 1 · Velocity 1 · Savagery 1 |
| Lightning | 4 | win 20:25 | 57 | 25 s | Lightning Sword, Tornado | Power 17 · Haste 12 · Expanse 10 · Persistence 5 · Magnet 2 · Vitality 2 · Avarice 2 · Savagery 1 · Swift 1 · Velocity 1 · Precision 1 |
| Lightning | 5 | win 53:52 | 22 | 2032 s | Lightning Companion, Lightning Sword | Haste 6 · Power 4 · Persistence 4 · Expanse 3 · Vitality 1 · Swift 1 |
| Earth | 1 | win 21:27 | 47 | 87 s | Earth Shield, Boulder | Haste 15 · Power 10 · Persistence 6 · Swift 3 · Expanse 3 · Velocity 2 · Avarice 1 · Ward 1 · Magnet 1 · Precision 1 · Regeneration 1 |
| Earth | 2 | died 17:21 | 41 | — | Earthquake, Earth Companion | Power 8 · Expanse 8 · Haste 7 · Persistence 5 · Swift 2 · Ward 2 · Regeneration 1 · Pierce 1 · Velocity 1 · Savagery 1 · Precision 1 · Avarice 1 |
| Earth | 3 | win 20:52 | 46 | 52 s | Boulder, Earth Shield | Power 11 · Haste 9 · Persistence 7 · Expanse 5 · Pierce 3 · Savagery 2 · Ward 2 · Magnet 1 · Regeneration 1 · Velocity 1 · Swift 1 |
| Earth | 4 | win 25:53 | 32 | 353 s | Earth Shield, Earth Companion | Haste 7 · Persistence 4 · Expanse 4 · Swift 3 · Velocity 3 · Power 3 · Avarice 2 · Ward 2 · Vitality 1 |
| Earth | 5 | win 24:05 | 33 | 245 s | Earth Shield, Earth Companion | Haste 8 · Power 6 · Persistence 4 · Expanse 3 · Regeneration 3 · Magnet 2 · Velocity 1 · Pierce 1 · Ward 1 · Savagery 1 |

Every run spread its picks
over 6–13 passives. Power, Haste, Persistence and Expanse led, at 4–17
ranks each; one of those four was the top pick in every run.

Both sweeps together (the first had no loadout logging):

| Element | Reached the boss | Deaths | Boss TTK, wins (median) | In 45–90 s |
|---|---|---|---|---|
| Fire | 7 / 10 | 10:34–15:22 | 27–53 s (37) | 2 / 7 |
| Ice | 7 / 10 | 8:20–13:07 | 39–1179 s (61) | 3 / 7 |
| Lightning | 5 / 10 | 8:52–18:18 | 25–2032 s (184) | 0 / 5 |
| Earth | 9 / 10 | 17:21 | 32–353 s (87) | 4 / 9 |
| **Total** | **28 / 40** | | | **9 / 28** |

- **Ice and Earth reach the boss on most seeds** (7/10 and 9/10). Fire is no
  longer the weak element: 7/10, against #126's 1 of 3. Lightning is now the
  lowest, at 5/10.
- **Deaths come at 8:20–18:18.** Blasts and shots together took more than half
  the HP lost in 10 of the 12.
- **The boss window fails both ways.** Fire kills it too fast (median 37 s).
  Lightning and some Earth runs take minutes. Four fights ran past 300 s.

## Rounds 1–5 — candidates (seeds 1–5, not shipped)

| Round | Change on top of the previous | Wins | Fights > 300 s |
|---|---|---|---|
| 1 | Recycling: an enemy more than 1.5 spawn-ring radii from the view centre moves to the ring point straight across, ahead of the player | 12 / 20 | 1 |
| 2 | Wave `hpMul` from 6:00: 1.6–2.8 → **1.5–2.1**; `spawnsPerSecond` from 8:00: 3.5–6 → **3.25–4.5**; `BOSS.hp` 7200 → **10800** | 14 / 20 | 0 |
| 3 | Tank `hp` 60 → **45** | 14 / 20 | 3 |
| 4 | Round 2 (tank back to 60), and `spawnsPerSecond` from 4:00: **2.25–4** | 17 / 20 | 3 |
| 5 | Round 4 with `BOSS.hp` **8000** | 12 / 20 | 2 |

Rounds 4 and 5 together won 29 of 40, against `main`'s 28 of 40, with 5
fights past 300 s against `main`'s 4. On the PM's call, none of it ships.

What the rounds found:

- **A full cap stops the run.** In the worst case, 189–197 tanks that could
  never catch the kiting player held the cap from 18:00 to 39:00, at level 20. A
  full cap spawns nothing and pays no XP. Recycling removed that case in round
  1, and stalls came back in rounds 3–5. Every one had a loadout with none of
  the four reach actives below.
- **Where the boss falls outside the window, the loadout is the cause, not
  the level.** The bot holds the boss at 200–330 px, past every default spell's
  144–189 px. Across the 84 wins with a logged loadout, the 38 with Fire Dragon,
  Fire Wave, Boulder or Tornado took 20–273 s (median 62 s, 20 in the window).
  The 46 without took 39–2032 s (median 126 s, 10 in the window). In the slowest
  round 4 fights the boss was the only enemy left, and the player lost no HP.
  Boss HP moves both groups together, so no value puts both in the window.
- **None of the 38 had a fight past 300 s. All 12 such fights with a logged
  loadout lacked those four:** 11 paired two of Ice Shield, Earth Shield, a
  companion, Frost Nova Bomb, Earthquake and Lightning Sword. The 12th was
  Lightning Sword with Chain Lightning.

## Earth's boss time-to-kill (#175)

#175 found Earth killing the old 5-minute boss in 37–38 s. On `main` now,
Earth's wins take 32–353 s (median 87 s), and only 2 of 9 are under 45 s. The
too-fast problem is gone. What remains is the spread above, which the
follow-up covers.

## Frame rate at the cap

The bot sampled `game.loop.actualFps` and the live count each run-minute. Across
the 140 runs of this pass, 229 samples had 295–301 enemies alive. They came
from 30 runs. All 120 runs with a logged loadout ended with three actives
equipped. Every one read **56–61 fps**, and 222 of them read
60–61. On `main` alone, 85 samples read 56–61. That was headless Chromium on a
desktop at 8x. The CI runner was not measured. The cap holds, and no follow-up
is needed.

## Passives: is one of them always right? (20-minute run)

The CO-125 probe, repeated on `main`: Lightning, invulnerable, seeds 1–3. Once
the active slots are full, every pick goes into one named passive. The bot
reached the boss at levels 32–58, against 11–16 on the 5-minute run.

| Policy | TTK (seeds 1–3) | Mean TTK |
|---|---|---|
| Spread (the tuning order) | 113 · 150 · 83 s | **115 s** |
| Power only | 569 · 124 · 169 s | 287 s |
| Expanse only | 590 · 195 · 260 s | 348 s |
| Persistence only | 471 · 123 · 474 s | 356 s |
| Ward only | 716 · 290 · 129 s | 378 s |
| Haste only | 237 · 587 · 1053 s | 626 s |
| Vitality only | 731 · 430 · 871 s | 677 s |

- **No passive is an always-pick.** Every single-passive stack lost to
  spreading, by 2.5x or more on the mean. Haste, the strongest stack at 5
  minutes, is second worst here; its runs took only 6–9 ranks of it.
- **Uncapped stacks do not trivialise the boss.** The fastest single-passive
  run took 123 s.
- The times are long because the loadout spread above applies here too. The
  bot's actives differ from run to run, so compare the policies with each
  other, not with the 45–90 s window.

## Final values versus the #127 starting values

None changed. The wave table, `BOSS.hp` (7200), the XP curve and the passive
table ship as #127 and #126 left them. No candidate beat `main` by more than
the noise, and the gap that is left is set by the loadout, which no config in
this pass reaches.

## Follow-ups

- **[#301](https://github.com/danhquach/crimsononslaught/issues/301) (CO-181):** loadouts with little reach stall the run and drag the boss
  fight past 4 minutes. The candidate fixes and their numbers are above.
- **Lightning is now the lowest element.** It reached the boss 5/10 and was
  never in the window. Most of its slow fights took Lightning Sword.
- **Recycling is ready if a later pass wants it.** It removed the far-behind cap
  lock. It was not shipped because the stalls that remain are the loadout case.
- **The Embers economy** is still out of scope, as #210 said.

# Lightning Sword rework (#305, 2026-09-28)

Ticket: [#305](https://github.com/danhquach/crimsononslaught/issues/305) · Spec: `docs/superpowers/specs/2026-09-18-phase2-spells.md` §9.4

**Question.** Lightning Sword was one blade, 70 px out, turning 3.2 rad/s. It
sat in the slowest Lightning runs of the 20-minute pass (boss fights of 25, 184,
353 and 2032 s). Do more blades and a faster orbit make it earn its slot?

**Answer: the base block ships with 3 blades at 4.5 rad/s; the data cannot tell
that from the old block.** The invulnerable bot kills the boss just as fast with
one blade as with three, so this pass shows no regression and no gain there.
The pooled mortal re-measure the ticket asks for is still owed.

**Method.** The #210 bot and method: Lightning, `timeScale=8`, a fresh Vite
server per arm, no config edits mid-sweep. The loadout hook equips Lightning
Sword and Lightning Companion at the start; the bot's level-up picks then
filled the other two slots, so **every run also ended with Tornado and Chain
Lightning**. This time one run at a time, not two. The decision rule (10
seeds, median 45–90 s) was cut to 5 seeds after the machine strained. Arms A
and B are the only ones run.

| Arm | Blades | Orbit speed | Orbit radius | Mode | Seeds |
|---|---|---|---|---|---|
| A (`main`) | 1 | 3.2 rad/s | 70 | invulnerable | 1–10 |
| B | 3 | 4.5 rad/s | 70 | invulnerable | 1–5 |
| B | 3 | 4.5 rad/s | 70 | mortal | 1–3 |

Three blades turn 2.09 rad apart. At 4.5 rad/s the next blade reaches an enemy
0.47 s after the last, longer than the 0.35 s per-enemy `hitCooldown` they
share, so no blade's cut is swallowed by another's window. A unit test holds
that gap.

## Results

Boss TTK by seed (invulnerable), wins only:

| Arm | Wins | TTK per seed | Median | In 45–90 s | Longest | Level at 20:00 | Most alive |
|---|---|---|---|---|---|---|---|
| A, seeds 1–10 | 10 / 10 | 27 · 23 · 39 · 22 · 74 · 66 · 50 · 27 · 28 · 31 s | 29.5 s | 3 / 10 | 74 s | 44–59 | 59–115 |
| A, seeds 1–5 | 5 / 5 | 27 · 23 · 39 · 22 · 74 s | 27 s | 1 / 5 | 74 s | 47–59 | 59–101 |
| B, seeds 1–5 | 5 / 5 | 19 · 33 · 33 · 22 · 31 s | 31 s | 0 / 5 | 33 s | 47–54 | 61–77 |

Mortal, arm B, seeds 1–3: seed 1 won (boss TTK 39 s), seed 3 won (38 s), seed 2
died at 19:19 with the level stuck at 31 from 14:31 on and 39–59 enemies alive
(not at the 300 cap). On `main` in #210, the same seeds 1 and 3 with a Lightning
Sword build took 353 s and 184 s. Seed 2 is a hard seed on `main` too (Lightning
died there in #210's rounds 1 and 4).

## What the runs say

- **Invulnerable runs do not separate the arms.** `main`'s block already
  killed the boss in a median 29.5 s on 10 seeds, under the window, with no
  stall (at most 115 alive, never near the 300 cap). Three blades gave 31 s
  on 5 seeds, in the same range as A's own seeds 1–5 (27 s).
- **Neither arm meets the 45–90 s rule.** Both are too fast, and A is too fast
  by the same margin, so "too strong" cannot be blamed on the rework. The
  count-2 and wider-orbit arms would have been measured on the same
  non-discriminating harness, so they were not run.
- **The stalls the ticket describes came from mortal runs.** The mortal
  baseline on these seeds is the #210 data above (a
  different loadout mix), so the two mortal wins are a hint, not a measurement.
- **Cuts in the e2e window rose 2.5x.** `e2e/lightningRoster.spec.ts`, 3:00–6:00,
  standing still: 360–449 sword cuts over three runs, against 173 on `main`
  (one run). The same runs read 106–122 Tornado ticks, against 583 on `main`;
  the cause of that drop was not isolated.

## Limits

- **The sample is small and noisy.** 5 seeds and one config per arm, and #210
  showed identical configs swinging 17/20 to 12/20. The pooled 40-run re-measure
  is still owed.
- **No mortal baseline was run** in this pass, so the mortal comparison leans on
  #210's `main` numbers.
- **The bot ends with four Lightning spells**, so a Lightning Sword build in
  this harness is never the sword alone. What the sword adds is diluted by
  Tornado and Chain Lightning.
- **Not tried:** a wider orbit, two blades, blades that grow with a spell level
  (spells have no levels), a lunge or a thrown arc.

# Frost Nova Bomb rework (CO-182, 2026-09-28)

Ticket: [#303](https://github.com/danhquach/crimsononslaught/issues/303) · Spec: `docs/superpowers/specs/2026-09-28-frost-nova-bomb-rework-design.md`

**Question.** Does the reworked bomb land its bursts on groups, and does its
spray land at all?

**Method.**
- The 20-minute bot: mortal, kiting, Ice with `?loadout=ice_nova_bomb`.
- `timeScale=8`, one Vite server on its own port, runs one at a time.
- Each run stopped at 10:00 of run time and read the bomb's test hook
  (`iceReport`) for the enemies each burst caught and the icicle hits.

**Burst trigger.** The first cut burst once 3 enemies stood within 50 px, with no
arming distance. In a crowd round the player, 9 of 11 bombs burst on their first
frame: 0 throws after 0.02 s. The bomb then acted like the old nova at the
player's feet and never sprayed. The rule now arms after 120 px and then bursts
once its 110 px ring would catch 3.

| Seed | Bursts | On ≥3 enemies | On none | Icicle hits | Burst hits |
|---|---|---|---|---|---|
| 1 | 219 | 120 (55%) | 66 | 700 | 656 |
| 2 | 187 | 119 (64%) | 37 | 685 | 715 |
| 3 | 205 | 136 (66%) | 42 | 775 | 705 |

- **Result:**
  - Most bursts land on a group: 55–66% catch 3 or more.
  - The spray lands about 3.5 hits a bomb: about 60% of the damage the bursts deal
    (14 per icicle hit against 24 per burst hit).
  - A fifth to a third of the bursts catch nobody. These are mostly bombs that roll
    their full range through a thin field.

## Ice Storm alone vs Ice Storm + Frost Nova Bomb (the ticket's check)

**Method.**
- The same bot, mortal, full 20-minute runs.
- Seeds 1–40 for each arm: 80 runs in all, the arms interleaved, two at a time,
  `timeScale=8`, one fresh Vite server serving this branch's code before its rebase onto #307.
- **What each arm carries:**
  - Ice Storm alone: `?loadout=ice_blizzard`.
  - Storm + Bomb: `?loadout=ice_blizzard,ice_nova_bomb`.
  - Ice Arrow is the default in both.
  - The bot filtered the other Ice actives out of the level-up offers in the page.
  - Every logged build was exactly its arm's spells. Passives were picked the usual
    way.
- **Why the filter is in the page:** a level-up offers only spells while a slot is
  open, so a pick score alone could not keep Shield and Companion out. The first
  launch had them in both arms and was thrown away.
- **Ice Storm is the one from before #304**, radius 80 for 6 s, not what `main` ships
  now (120 for 4 s, #307): the PM asked for the sweep before that change merged.

| Arm | Wins | Reached boss | Boss TTK min / median / max | TTK in 45–90 s | Median level | Median survival of losses |
|---|---|---|---|---|---|---|
| Arrow + Storm | 13 / 40 | 13 | 37 / 57 / 112 s | 7 of 13 | 27 | 10:04 |
| Arrow + Storm + Bomb | 30 / 40 | 31 | 21 / 31 / 63 s | 3 of 30 | 46 | 13:43 |

- **Result:**
  - The bomb clearly adds to Ice Storm: 17 more wins out of 40, more than three times
    the roughly 5-win noise the #210 rounds measured.
  - The boss falls in about half the time.
  - Over full 20-minute runs, 16,392 of 20,289 bursts (81%) caught 3 or more enemies.
- **The Storm + Bomb arm is fast on the boss:**
  - Its median time-to-kill is 31 s, below the 45–90 s window, and only 3 of its 30
    wins land inside it.
  - This arm carries one active more than the control, and the comparison measures
    the bomb added, not the bomb against another spell. A full five-active Ice build
    still has to be read against the window.

## Two boss bars (#387)

The boss's HP doubles from 7200 to 14400, drawn as two bars of 7200 on the one HUD
boss bar. The fight-length window doubles with it, from 45–90 s to 90–180 s. The
ticket asked for 3×; the PM chose 2× for now, and the bar code takes its count from
`BOSS.bars`, so a third bar is a config change.

- **Method:** the scratch bot of the earlier sections, `timeScale=8`, one run at a
  time on a fresh Vite server serving `main` (915185d) at 7200 HP. Time-to-kill is
  the survival time past 20:00.
- **The 14400 HP arm was not swept.** The PM chose to record the baseline and the
  expected fight length instead. One smoke run (Lightning, seed 1) took 127 s against
  107 s at 7200 HP; one seed is no measure given the spread below.

| Arm (7200 HP) | Wins | Boss TTK min / median / max | TTK in 45–90 s |
|---|---|---|---|
| Lightning, invulnerable | 5 / 5 | 35 / 107 / 248 s | 1 of 5 |
| Fire, invulnerable | 5 / 5 | 34 / 45 / 245 s | 1 of 5 |
| Ice, invulnerable | 5 / 5 | 21 / 33 / 73 s | 2 of 5 |
| Earth, invulnerable | 5 / 5 | 46 / 103 / 1165 s | 2 of 5 |
| Lightning, mortal | 5 / 5 | 50 / 72 / 244 s | 3 of 5 |

- **Expected at 14400 HP:** the boss takes no damage scaled by its max HP, so the
  fight should take about twice as long: medians of roughly 210 s for Lightning and
  Earth and roughly 65–90 s for Ice and Fire. Fire and Ice would land on the window's floor,
  Lightning and Earth past its ceiling.
- **The spread is wide:** the same element varies up to 7× across seeds (Earth's
  1165 s is one seed whose build stalled). Five seeds per arm do not settle a median;
  a pooled 40-run sweep would, before any damage is retuned against the new window.
- **No survival pressure:** every mortal run won, so a fight twice as long is not
  yet expected to cost runs. A longer fight means twice the contact time with the
  boss, which the next sweep should watch.

# Spell and boss rebalance (#406, 2026-10-03)

Measured with `npm run sweep` (#407): 4 seeds per element, one sweep, 16 runs a
round, one run at a time at `timeScale=8`, mortal, no dash. Each round changes
values, so the same seed draws different level-up offers: rounds compare as pools,
not seed by seed.

| Round | Fire | Ice | Lightning | Earth | Wins | Median boss kill | Wins hit by volley |
|---|---|---|---|---|---|---|---|
| Baseline (`main`, fb4c768) | 4/4 | 3/4 | 0/4 | 3/4 | 10/16 | 61 s | 1 of 10 |
| 1: boss 19000 HP, volley, weak actives up, Fire down | 2/4 | 2/4 | 1/4 | 1/4 | 6/16 | 67 s | 1 of 6 |
| 2: companions ×1.5, Sword reach, boss 24000 HP | 4/4 | 1/4 | 3/4 | 4/4 | 12/16 | 65 s | 3 of 12 |
| 3: damage cap, 21000 HP, orbit cycle, Frost Nova rework | 2/4 | 4/4 | 3/4 | 3/4 | 12/16 | 100 s | 3 of 12 |
| 4: Earth Shield 20, Ice Shield 10/45 (reverted to 12/50 below), Chain Lightning 14/180 | 2/4 | 3/4 | 2/4 | 3/4 | 10/16 | 103 s | 5 of 10 |

Two checks on the round-4 values, Ice and Lightning only, seeds 5–12:

- **Chain Lightning** (damage 12 → 14, `targetRange` 150 → 180): 4 of 7 runs it was
  offered in, pooled with round 4 (was 1 of 6 over rounds 1–3).
- **Ice Shield** at damage 10 / absorb 45 won 1 of 4; its only win took 289 s at the
  boss. Partly reverted to damage 12 / absorb 50 and re-run on the same seeds: 3 of 5,
  boss kills 95 / 145 / 188 s. Ice overall 4 of 8 in that 12/50 re-run; Ice Companion was in all
  four Ice deaths.

What moved the numbers:

- **Boss HP alone could not fix kill time.** At 19000 and 24000 HP the burst builds
  (Meteor, Fire Dragon, Tornado) still killed in 33–57 s while Earth ran 135–214 s:
  HP moves both together (as the #387 section predicted). The per-second damage cap
  (`BOSS_DAMAGE_CAP`: 200 dps in full, 10 % above it, on the run clock) brought the
  burst builds to 87–124 s without slowing Earth, whose damage is many small hits.
- **Orbit shields on a 5 s / 3 s cycle cost Earth at the boss** (191 s and 401 s in
  round 3). Earth Shield damage 16 → 20 brought Earth to 112–152 s in round 4.
- **Reach decides survival.** The bot holds the boss at 200–330 px and backs away from
  crowds inside 320 px, so short-reach builds die early or stall; every stall was
  flagged `suspectBot`.

Limits: n = 4 per element per round; per-active win rates rest on 2–7 runs each. A
pooled 40-run sweep on the final values is still owed before the next balance pass.
The shipped Ice Shield values (12/50) were checked on Ice seeds 5–12 only, not in a
full 16-run round. Final values are in `src/config/` and the Phase 2 spec tables.

# Cap the four scaling passives (#410, 2026-10-03)

Power, Haste, Expanse and Persistence now cap at 8, 8, 6 and 6 ranks (×2.14 damage,
×0.51 cooldown, ×1.97 area, ×2.31 duration), near the median rank a winning run
reached before. Every passive now has a `maxRank`.

Measured with `npm run sweep`: 4 elements × seeds 1–5, `timeScale=8`, mortal, no
dash, one run at a time. The baseline is `main` (b37f6a5), two sweeps (40 runs),
which is also the pooled re-measure #406 owed. The capped run was stopped after its
first sweep at the PM's request (20 runs), so the comparison below is sweep 1 against
sweep 1: the same 20 element-seed jobs.

| | Baseline, 40 runs | Baseline, sweep 1 | Caps, sweep 1 |
|---|---|---|---|
| Wins | 28/40 | 15/20 | 15/20 |
| Fire · Ice · Lightning · Earth | 5 · 9 · 5 · 9 | 4 · 5 · 2 · 4 | 3 · 5 · 3 · 4 |
| Median boss kill | 105 s | 105 s | 110 s |
| Boss kills inside 90–180 s | 23 of 28 | 13 of 15 | 10 of 15 |
| Power · Haste · Expanse · Persistence share of win ranks | 20 · 19 · 17 · 12 % | 19 · 19 · 18 · 13 % | 18 · 17 · 13 · 13 % |
| The four together | 68 % | 70 % | 61 % |
| Highest single passive | Power 20 % | Power 19 % | Power 18 % |
| Passive ranks per win | 39.4 | 38.4 | 39.7 |

- **The ranks moved to the other ten.** With the four capped, a win still takes
  about 40 passive ranks; Regeneration, Ward, Precision, Vitality and Avarice each
  roughly doubled their share (2–3 % to 4–5 %). No passive is above 25 %.
- **Win rate held:** 15/20 both sides. Fire lost one win (seed 3 died at 7:00,
  level 11, before any cap can be reached, so that run diverged by offer draws, not by
  the caps) and Lightning gained one.
- **Boss kill time held overall** (110 s median) **but not for Earth.** Three of
  Earth's four capped wins took 317–338 s at the boss, all with Earthquake; on
  baseline Earth's Earthquake wins took 129–171 s, and 2 of its 9 wins ran past
  180 s (290 and 400 s). Earth's many small hits sit under the boss damage cap, so
  losing late Power, Expanse and Persistence ranks slows it where the burst builds,
  already held near 100 s by the cap, do not slow. The other two kills outside the
  window are fast Ice ones (81 and 89 s, Frost Nova Bomb). Boss HP 21000 and the cap
  are unchanged here.
- **The cooldown floor is now out of a passive's reach:** Haste at 8 is ×0.51,
  above the 0.35 clamp. Relics can still reach it.

Limits: 20 runs a side, n = 5 per element; the ticket asked for a pooled 40. The
Earth boss-kill signal rests on 3 runs, but every one was slow; it needs its own
check (Earth seeds 6–15 with the caps) before Earth is tuned: [#417](https://github.com/danhquach/crimsononslaught/issues/417).

# Boss chase speed (CO-230, 2026-10-03)

The boss chased at 70 px/s (91 enraged) against the hero's 180, so walking away
kept it off. Chase speed 70 → 140 (182 enraged); the charge (400) and every skill
are unchanged. Measured with `npm run sweep`: seeds 1–5 per element, one sweep, 20
runs a side, one run at a time at `timeScale=8`, mortal, no dash. Baseline is `main`
at 6dc3684.

| Arm | Fire | Ice | Lightning | Earth | Wins | Boss fights won | Median boss kill (range) | Wins hit by slam · volley |
|---|---|---|---|---|---|---|---|---|
| 70 px/s (`main`) | 2/5 | 3/5 | 3/5 | 4/5 | 12/20 | 12 of 12 | 106 s (94–712) | 0 · 3 of 12 |
| **140 px/s** | 2/5 | 5/5 | 1/5 | 3/5 | 11/20 | 11 of 12 | **101 s (84–262)** | 0 · 0 of 11 |

- **Boss kill time held:** 101 s median, inside 90–180 s. One Earth kill took 262 s
  (main had one at 712 s).
- **Win rate held:** 16 of the 17 deaths came before 20:00, where the boss is not
  yet up, so the per-element moves are offer-draw noise. One run (Lightning, seed 5)
  died in the boss fight at 140; none did at 70.
- **The slam still never lands on the bot, at either speed.** The boss stands still
  through the slam's 1 s ring, and the bot steps out of any ring it sees (0.4 s at
  180 px/s), so chase speed does not reach the slam. The PM accepted this: reading
  the ring is a fair answer. A hero who ignores the ring still takes it.
- **The volley stopped landing** (0 of 11 wins hit, 3 of 12 on `main`). The hero now
  spends more time near the boss, where the volley is weighted down; not broken out
  further.

Limits: 20 runs a side, n = 5 per element; slam damage is measured on a bot that
always dodges the ring, so it says nothing about a human player.

# Boss Leap (CO-232, 2026-10-04)

A gap closer for a far hero: staying beyond 280 px was safe from everything but the
volley and the charge. From the second bar the boss can crouch and land on the hero's
spot. Starting values, not yet swept (`npm run sweep` was not run for this ticket):

| Value | Setting |
|---|---|
| Wind-up | 0.9 s: still 0.55 s, airborne the last 0.35 s, lands as it ends |
| Landing circle | 90 px, locked at the wind-up's start (the hero can walk out of it) |
| Damage | 30, 45 enraged (the slam's), through the immunity window |
| Cooldown | 12 s from the wind-up's start, on the boss clock |
| Weights (near / mid / far) | 0 / 1 / 3; a weight of 0 drops the skill from the roll, so it is never drawn within 160 px |
| Far odds, all four skills ready | slam 1, volley 3, summon 2, leap 3 (of 9) |

A hero at the circle's centre needs 90 / 180 = 0.5 s to clear it (the hit test is
centre distance only, `blastReaches`), inside the 0.9 s warning. Like the slam, a bot that steps out of rings will not be hit by it.

# Siphon (CO-235, 2026-10-04)

Siphon heals 0.5% of the spell damage that lands per rank (4 ranks, 2%), capped at
3 HP/s (Regeneration's full stack). Pierce is withheld from offers (`offered: false`)
until Exploit ([#415](https://github.com/danhquach/crimsononslaught/issues/415)). Same-seed sweep with
`npm run sweep -- --seeds 1-5`, baseline `main` at 2f8c4b3, one run at a time,
mortal, no dash, 20 runs a side. Wins per element, of 5:

| Arm | Fire | Ice | Lightning | Earth | Wins | Deaths (fire / ice / lightning / earth) | Median boss kill (range) | Top passive's share of win ranks |
|---|---|---|---|---|---|---|---|---|
| Baseline (`main`) | 1 | 4 | 5 | 3 | 13 / 20 | 4 / 1 / 0 / 2 | 98 s (81-170) | Haste 18.8% |
| **Siphon** | 2 | 3 | 5 | 3 | 13 / 20 | 3 / 2 / 0 / 2 | 106 s (90-147) | Power 16.7% |

- Win rate: the same, 13 of 20.
- Median boss kill: 106 s, inside 90-180 s.
- No passive is above 25% of win ranks. Siphon has 2.6% (14 ranks) and Regeneration
  2.8% (15 ranks); both were taken in winning runs, so neither is a dead pick.
  Across all runs Regeneration fell from 31 ranks to 16, the two sharing the filler
  slots the bot leaves after Power, Haste, Expanse and Persistence.
- Median HP lost in a win fell from 121 to 93. The bot reads net HP, so Siphon's
  healing counts against that figure.
- Pierce took 2 of 522 win ranks in the baseline (0.4%), so taking it out of the
  offers barely moves the comparison.

Limits: 20 runs a side, n = 5 per element. A one-win swing per element is noise
([#210](https://github.com/danhquach/crimsononslaught/issues/210)), and the bot only
takes Siphon as filler, so this shows Siphon breaks nothing, not what it is worth to
a player who builds around it. The baseline log flagged 2 suspect-bot runs; the
Siphon arm flagged none.
