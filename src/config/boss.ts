import type { TextureKey } from './colors';
import type { FrameName } from './frames';
import { WAVES } from './waves';

/**
 * The boss (spec §5 "Boss"): its stats and the timings of its charge cycle.
 * Regular enemies are rows in `enemies.ts`; the boss is one of a kind, so it
 * gets its own table.
 *
 * Pure data, no Phaser import, so the numbers are unit-tested against the spec.
 * `entities/Boss.ts` reads it on spawn; `core/boss.ts` reads the timings.
 */
export interface BossConfig {
  /** Total HP across every bar. */
  hp: number;
  /** #387: how many equal bars `hp` is drawn as; the HUD peels one off at a time. */
  bars: number;
  /** Chase speed in px/s between charges. */
  speed: number;
  /** Damage dealt to the player on contact, at most once per 0.5 s. */
  contactDamage: number;
  /** Body radius in px; the hitbox, independent of the placeholder art's size. */
  radius: number;
  texture: TextureKey;
  /** Seconds from one telegraph's start to the next. */
  cycleS: number;
  /** Seconds the boss stands and flashes before a charge. */
  telegraphS: number;
  /** Seconds the charge lasts. */
  chargeS: number;
  /** Charge speed in px/s. */
  chargeSpeed: number;
}

export const BOSS: Readonly<BossConfig> = {
  // #127: sized for a 20-minute build; a starting value, tuned later.
  // #387: doubled, shown as two bars of 7200 so the fight reads as two rounds.
  hp: 14400,
  bars: 2,
  speed: 70,
  contactDamage: 30,
  radius: 40,
  texture: 'boss',
  cycleS: 4,
  telegraphS: 0.8,
  chargeS: 0.6,
  chargeSpeed: 400,
};

/**
 * How the boss shrugs off crowd control (CO-221), on top of `BOSS_CC_DR`. A
 * stun does nothing to it (the damage still lands). A freeze does not hold it:
 * it becomes a `freezeSlowPct` slow lasting `freezeSlowPerFreezeS` times the
 * freeze's length, before the cut below, so a base 1 s freeze is a 0.5 s slow
 * on the boss, costing it about a quarter of the travel the stop would have.
 * Stagger and slow last `durationFactor` of their length, measured from the
 * Persistence-stretched value (Persistence is in the duration before it gets
 * here), and the repeat-halving still applies after. Knockback and Aftershock's
 * throw are unchanged. `immunePopGapS` is the least boss-clock time between two
 * "Immune" pops, so a build that stuns every frame does not paint a wall of them.
 */
export interface BossCcResist {
  durationFactor: number;
  freezeSlowPct: number;
  freezeSlowPerFreezeS: number;
  immunePopGapS: number;
}

export const BOSS_CC_RESIST: Readonly<BossCcResist> = {
  durationFactor: 0.25,
  freezeSlowPct: 0.5,
  freezeSlowPerFreezeS: 2,
  immunePopGapS: 1.5,
};

/** The shield frame the "Immune" pop draws (CO-221), over the boss when a stun or freeze is shrugged off. */
export const BOSS_IMMUNE_FRAME: FrameName = 'status.immune.0';

/**
 * Diminishing returns on the boss's crowd control (#315). A default the lead
 * chose, no spec value: Persistence stretches every stagger and slow
 * without a cap, so a sword build re-staggered the boss before each stop ended
 * and it never moved or charged again. Each repeat of a kind within `resetS`
 * lasts `factor` times the one before; a kind that goes `resetS` s without an
 * application starts over at full length. Stagger and slow count separately;
 * the boss takes no stun and no freeze (`BOSS_CC_RESIST`, CO-221). Regular enemies take none of it.
 *
 * Slows fall off too, by design: the boss is meant to be harder to affect by
 * every status, so a standing-area slow fades on it the longer it stands in.
 */
export interface BossCcDr {
  /** Each repeat's duration is this fraction of the last one's. */
  factor: number;
  /** Seconds without an application of a kind before its count starts over. */
  resetS: number;
}

export const BOSS_CC_DR: Readonly<BossCcDr> = {
  factor: 0.5,
  resetS: 4,
};

/**
 * Boss enrage (#388): once the boss is down to the last `atLastBarFraction` of
 * its final bar it turns on the player for good. Values are the ticket's, a
 * starting point to tune.
 *
 * "Time between attacks 30% shorter" is read as the charge cycle's period, 4 s
 * to 2.8 s (`attackGapMul` 0.7), got by shortening only the chase leg (2.6 s to
 * 1.4 s). The telegraph (0.8 s) is the player's warning and the clip is paced to
 * it, and the charge (0.6 s) is its length, so both stay. The charge's speed
 * grows with `speedMul`, so it reaches 312 px against 240.
 */
export interface BossEnrage {
  /** Enrages at or under this fraction of one bar's HP (of the last bar: the HP total less the others). */
  atLastBarFraction: number;
  /** Contact damage multiplier. */
  damageMul: number;
  /** Chase and charge speed multiplier. */
  speedMul: number;
  /** Multiplier on the cycle's period, taken off the chase leg alone. */
  attackGapMul: number;
  /** Multiplier on the damage the boss takes, so the last stretch is a race. */
  damageTakenMul: number;
}

export const BOSS_ENRAGE: Readonly<BossEnrage> = {
  atLastBarFraction: 0.5,
  damageMul: 1.5,
  speedMul: 1.3,
  attackGapMul: 0.7,
  damageTakenMul: 1.5,
};

/** A boss skill (CO-222): its wind-up warning and the beat it lands in. Later skills append here. */
export type BossSkillId = 'slam' | 'volley' | 'summon';

export interface BossSkillTiming {
  /** Seconds the boss stands and the warning shows before the skill lands. */
  windupS: number;
  /** Seconds the skill's clip plays out after it lands. */
  activeS: number;
  /**
   * Seconds from a wind-up starting to the next one of this skill being allowed
   * (CO-223); absent = no cooldown. It runs on the boss clock, so a scaled run keeps it.
   */
  cooldownS?: number;
}

/**
 * Ground slam (CO-222): the boss stops, a ring of `radius` px shows for
 * `windupS`, then the ground hits everything in it for `damage`, times the
 * enrage damage multiplier. Radius 120 (140 read as too big in game): a hero at
 * 180 px/s clears the ring from the boss's side in about 0.4 s of the 1 s
 * warning, and a dash clears it at once.
 */
export const BOSS_SLAM = { windupS: 1.0, activeS: 0.4, radius: 120, damage: 30 } as const;

/**
 * Bolt volley (CO-223): the boss stops and turns toward the hero for `windupS`,
 * then fires `slots` bolts at even angles round it, slot 0 along the aim locked
 * as the wind-up began. The slots in `gapSlots` (±90° of the aim) are left
 * empty, so two 45° gaps open to the sides: 14 bolts, each flying `boltSpeed`
 * px/s for `boltRange` px, hitting a hero for `damage` times the enrage
 * multiplier. A hero 120 px out stands in a gap if they sidestep within the 1.2 s
 * warning. No RNG. `cooldownS` keeps the next volley 15 s from the wind-up's start.
 */
export const BOSS_VOLLEY = {
  windupS: 1.2,
  activeS: 0.5,
  cooldownS: 15,
  slots: 16,
  gapSlots: [4, 12],
  boltSpeed: 110,
  boltRange: 520,
  damage: 20,
  boltRadius: 8,
} as const;

/**
 * The volley bolt (CO-223): the flight clip, drawn heading right and turned to
 * its flight, and the clip a bolt bursts in where it hits or fades; `maxLive`
 * caps the pool (14 bolts a volley, so two volleys' worth in flight at most).
 */
export const BOSS_BOLT = { clip: 'boss.bolt', hitClip: 'boss.boltHit', maxLive: 32 } as const;

/** The last wave row that spawns anything: the pack's HP and damage are this row's (CO-224). */
const LAST_FIGHT_WAVE = [...WAVES].reverse().find((wave) => wave.types.length > 0) ?? WAVES[0];

/**
 * Summon (CO-224): the boss stops for `windupS`, and `circleRadius`-px circles
 * show on the floor in a ring of `ringRadius` px round it, `packSize` of them,
 * the first along the aim locked as the wind-up began. As it lands a Swarm
 * enemy spawns at each circle. The pack is capped: at most `maxLive` summoned
 * enemies alive at once, so a landing tops the pack up to the cap rather than
 * past it, and while the cap is full the boss draws another skill. Summoned
 * enemies drop XP gems only, no Embers or consumables. They are scaled as the
 * last wave row of the schedule scales its enemies (`scale`), read from
 * `WAVES` so the pack keeps pace with the table. No RNG. `cooldownS` keeps the
 * next summon 14 s from the wind-up's start.
 */
export const BOSS_SUMMON = {
  windupS: 1.0,
  activeS: 0.6,
  cooldownS: 14,
  packSize: 5,
  maxLive: 10,
  ringRadius: 110,
  circleRadius: 22,
  type: 'swarm',
  scale: { hpMul: LAST_FIGHT_WAVE.hpMul, damageMul: LAST_FIGHT_WAVE.damageMul },
} as const;

export const BOSS_SKILLS: Readonly<Record<BossSkillId, BossSkillTiming>> = {
  slam: BOSS_SLAM,
  volley: BOSS_VOLLEY,
  summon: BOSS_SUMMON,
};

/**
 * Which skills the boss draws from, by bars broken (index 0 = first bar; past
 * the end, the last list). One skill leg runs between charges, picked at random
 * from the ready ones, weighted by how far the hero is (`BOSS_SKILL_WEIGHTS`).
 */
export const BOSS_SKILL_ROTATION: readonly (readonly BossSkillId[])[] = [
  ['slam'],
  ['slam', 'volley', 'summon'],
];

/**
 * How far the hero stands from the boss, banded (CO-223): under `nearPx` is
 * near, over `farPx` is far, between is mid. Roughly the slam's ring (120 px)
 * and the edge of a hero's sidestep room, a starting point to tune.
 */
export const BOSS_SKILL_RANGE = { nearPx: 160, farPx: 280 } as const;

export type BossRangeBand = 'near' | 'mid' | 'far';

/**
 * The weight each skill carries in a roll, by the hero's band (CO-223): near,
 * the slam is picked 3 times in 4 against the volley; far, the volley is. Only
 * ready skills of the bar's list enter the roll; a skill's row is its own, so a
 * later skill adds a row here.
 */
export const BOSS_SKILL_WEIGHTS: Readonly<
  Record<BossSkillId, Readonly<Record<BossRangeBand, number>>>
> = {
  slam: { near: 3, mid: 1, far: 1 },
  volley: { near: 1, mid: 1, far: 3 },
  summon: { near: 1, mid: 2, far: 2 },
};
