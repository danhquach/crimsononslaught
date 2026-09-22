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
