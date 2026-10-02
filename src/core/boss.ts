import {
  BOSS,
  BOSS_ENRAGE,
  BOSS_SKILL_RANGE,
  BOSS_SKILL_ROTATION,
  BOSS_SKILL_WEIGHTS,
  type BossRangeBand,
  BOSS_SKILLS,
  BOSS_SLAM,
  BOSS_VOLLEY,
  type BossSkillId,
} from '../config/boss';
import type { Vec2 } from './enemy';

/**
 * Boss rules that do not need an engine (spec §5 "Boss"): the charge cycle —
 * chase, 0.8 s telegraph, 0.6 s charge, every 4 s — and the movement each frame
 * of it asks for. Between charges the boss uses one skill (CO-222): a windup
 * with a warning, then the skill landing; the legs alternate charge, skill. The
 * skill is drawn at random, weighted by how far the hero stands (CO-223).
 *
 * `entities/Boss.ts` is the Phaser side; everything decidable without Phaser
 * lives here so it is Vitest-covered.
 *
 * Pure TS, no Phaser import.
 */

export type BossPhase = 'chase' | 'telegraph' | 'charge' | 'windup' | 'skill';

/**
 * Emitter event names for the boss -> Game direction, namespaced like `run:*`.
 * `died` fires once the death animation has played out, not on the killing
 * blow (CO-081): the win waits for it. `phase` fires with `{ phase }` each
 * time the charge cycle moves on (CO-102: the telegraph and charge cues).
 * `barBreak` fires with `{ left }` when a hit takes a bar off the boss and some
 * are left (#387); the killing blow fires none, `died` is its cue. `enrage`
 * fires once, when a hit takes the boss to its enrage threshold (#388). `immune`
 * fires with `{ x, y }` over the boss when a stun or freeze is shrugged off
 * (CO-221), throttled by the entity. `skill` fires once with a
 * `BossSkillPayload` when a skill lands (CO-222), at the boss's spot then.
 */
export const BOSS_EVENT = {
  died: 'boss:died',
  phase: 'boss:phase',
  barBreak: 'boss:barBreak',
  enrage: 'boss:enrage',
  immune: 'boss:immune',
  skill: 'boss:skill',
} as const;

export interface BossPhasePayload {
  readonly phase: BossPhase;
}

export interface BossBarBreakPayload {
  /** Bars still alive after the hit. */
  readonly left: number;
}

export interface BossImmunePayload {
  /** Where to show the pop: just above the boss's body. */
  readonly x: number;
  readonly y: number;
}

interface BossSkillPayloadBase {
  /** Where the boss stood as the skill landed. */
  readonly x: number;
  readonly y: number;
  /** Damage to a player in reach, enrage included. */
  readonly damage: number;
  /** Boss clock when the skill landed, exact whatever the frame's length (CO-223). */
  readonly atS: number;
}

/** Ground slam (CO-222): a ring of `radius` px round (x, y). */
export interface BossSlamPayload extends BossSkillPayloadBase {
  readonly skill: 'slam';
  readonly radius: number;
}

/** Bolt volley (CO-223): bolts fly from (x, y), slot 0 along `aimRad`, locked as the wind-up began. */
export interface BossVolleyPayload extends BossSkillPayloadBase {
  readonly skill: 'volley';
  readonly aimRad: number;
}

export type BossSkillPayload = BossSlamPayload | BossVolleyPayload;

export interface BossCycle {
  readonly phase: BossPhase;
  /** Seconds left in `phase`. */
  readonly remainingS: number;
  /**
   * Unit vector of the charge, locked as the telegraph ends toward where the
   * player stood (spec §5). Zero outside a charge, and zero when the player
   * stood on the boss at that instant — nowhere to charge.
   */
  readonly chargeDir: Vec2;
  /** Which attack leg the next chase ends in (CO-222): the charge or a skill. */
  readonly next: 'charge' | 'skill';
  /** The skill in its windup or landing; null outside both. */
  readonly skill: BossSkillId | null;
  /** Unit vector toward the target, locked as a skill's windup began; zero when the target stood on the boss. */
  readonly skillDir: Vec2;
  /** Seconds of frames fed to the cycle so far: the clock the cooldowns run on (CO-223). */
  readonly clockS: number;
  /** Boss clock each skill is next allowed to start a windup at; absent = ready. */
  readonly readyAtS: Readonly<Partial<Record<BossSkillId, number>>>;
}

/** What one frame came to: the cycle after it, and the movement it asks for. */
export interface BossStep {
  readonly cycle: BossCycle;
  /**
   * Velocity to hold for the whole frame, px/s: everything the frame's phases
   * move the boss, spread evenly over its length.
   *
   * A frame is one velocity, but a frame can span several phases — at a scaled
   * clock (`?timeScale=`) one frame covers seconds of run time, several times
   * the 0.6 s charge. Charging at 400 px/s for such a frame threw the boss
   * thousands of px out of a 3000 px arena and left it walking back at 70 px/s
   * for most of the fight, out of reach of Earth's 80 px ring (#89). Averaging
   * keeps the distance each phase covers exactly what the spec says, whatever
   * the frame length, at the cost of the telegraph's stop reading as a slow
   * drift on a frame that also charges.
   */
  readonly velocity: Vec2;
  /** One per windup that ended this frame, so a long frame lands each skill exactly once. */
  readonly impacts: readonly {
    readonly skill: BossSkillId;
    readonly aim: Vec2;
    readonly atS: number;
  }[];
}

const NO_DIRECTION: Vec2 = { x: 0, y: 0 };

/** Seconds of plain chase between a charge ending and the next telegraph. */
const CHASE_S = BOSS.cycleS - BOSS.telegraphS - BOSS.chargeS;

/** Seconds of chase once enraged: the cycle's period scaled by `attackGapMul`, the telegraph and charge kept (#388). */
const ENRAGED_CHASE_S = BOSS.cycleS * BOSS_ENRAGE.attackGapMul - BOSS.telegraphS - BOSS.chargeS;

/**
 * How long `phase` lasts (#388). Enrage shortens only the chase: the telegraph
 * is the player's warning and the charge is a fixed length. A skill's windup
 * and landing (CO-222) are its own timings, enraged or not.
 */
export function phaseLengthS(
  phase: BossPhase,
  enraged = false,
  skill?: BossSkillId | null,
): number {
  switch (phase) {
    case 'chase':
      return enraged ? ENRAGED_CHASE_S : CHASE_S;
    case 'telegraph':
      return BOSS.telegraphS;
    case 'charge':
      return BOSS.chargeS;
    case 'windup':
      return BOSS_SKILLS[skill ?? 'slam'].windupS;
    case 'skill':
      return BOSS_SKILLS[skill ?? 'slam'].activeS;
  }
}

/** HP at or under which the boss is enraged (#388): half the last bar. */
export function enrageThresholdHp(): number {
  return (BOSS.hp / BOSS.bars) * BOSS_ENRAGE.atLastBarFraction;
}

/**
 * Whether `hp` is in the enrage range: above 0 and at or under the threshold.
 * The one rule the boss's latch and the HUD both read, so they cannot disagree;
 * a dead boss (0) is not enraged.
 */
export function bossEnraged(hp: number): boolean {
  return hp > 0 && hp <= enrageThresholdHp();
}

/** Whether a hit leaving the boss at `hp` turns it enraged now: not already, and in range. */
export function shouldEnrage(already: boolean, hp: number): boolean {
  return !already && bossEnraged(hp);
}

/** What enrage changes about the boss's stats; calm is all ones. */
export function bossMods(enraged: boolean): { damage: number; speed: number; damageTaken: number } {
  return enraged
    ? {
        damage: BOSS_ENRAGE.damageMul,
        speed: BOSS_ENRAGE.speedMul,
        damageTaken: BOSS_ENRAGE.damageTakenMul,
      }
    : { damage: 1, speed: 1, damageTaken: 1 };
}

/**
 * Enraging mid-chase (#388): a chase already running longer than the enraged
 * one is cut to it, so the next telegraph comes at the new pace. A telegraph or
 * charge under way is left alone, never cut short.
 */
export function enterEnrage(cycle: BossCycle): BossCycle {
  if (cycle.phase !== 'chase') return cycle;
  return { ...cycle, remainingS: Math.min(cycle.remainingS, ENRAGED_CHASE_S) };
}

/** The band a hero `distancePx` from the boss stands in (CO-223). */
export function bossRangeBand(distancePx: number): BossRangeBand {
  if (distancePx < BOSS_SKILL_RANGE.nearPx) return 'near';
  if (distancePx > BOSS_SKILL_RANGE.farPx) return 'far';
  return 'mid';
}

/**
 * The skill a list gives next (CO-222, CO-223): at random from those whose
 * cooldown is over at `nowS`, each weighted by `BOSS_SKILL_WEIGHTS` for the
 * band of `distancePx`. `rand` is drawn from once, and not at all when none is
 * ready (or the list is empty): the leg is a charge instead, so null.
 */
export function pickBossSkill(
  list: readonly BossSkillId[],
  readyAtS: Readonly<Partial<Record<BossSkillId, number>>>,
  nowS: number,
  distancePx: number,
  rand: () => number,
): BossSkillId | null {
  const ready = list.filter((skill) => (readyAtS[skill] ?? -Infinity) <= nowS);
  if (ready.length === 0) return null;
  const band = bossRangeBand(distancePx);
  const weights = ready.map((skill) => BOSS_SKILL_WEIGHTS[skill][band]);
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = rand() * total;
  for (let i = 0; i < ready.length; i += 1) {
    roll -= weights[i] as number;
    if (roll < 0) return ready[i] as BossSkillId;
  }
  return ready[ready.length - 1] as BossSkillId;
}

/** The skills the boss draws from after `barsBroken` bars: the list for that bar, the last past the end. */
export function bossSkillsFor(barsBroken: number): readonly BossSkillId[] {
  const last = BOSS_SKILL_ROTATION.length - 1;
  return BOSS_SKILL_ROTATION[Math.min(Math.max(0, barsBroken), last)] ?? [];
}

/** Ground slam damage to a player in reach (CO-222), enrage included. */
export function slamDamage(enraged: boolean): number {
  return BOSS_SLAM.damage * bossMods(enraged).damage;
}

/** Bolt volley damage per bolt to a player it reaches (CO-223), enrage included. */
export function volleyDamage(enraged: boolean): number {
  return BOSS_VOLLEY.damage * bossMods(enraged).damage;
}

/**
 * The unit direction of every bolt of a volley aimed along `aimRad` (CO-223):
 * `slots` evenly round the circle from the aim, less the empty `gapSlots`.
 */
export function volleyBoltDirections(aimRad: number): Vec2[] {
  const { slots, gapSlots } = BOSS_VOLLEY;
  const out: Vec2[] = [];
  for (let slot = 0; slot < slots; slot += 1) {
    if ((gapSlots as readonly number[]).includes(slot)) continue;
    const angle = aimRad + (slot * 2 * Math.PI) / slots;
    out.push({ x: Math.cos(angle), y: Math.sin(angle) });
  }
  return out;
}

/** Scale that makes a warning sprite `artW` px wide span the slam's diameter (CO-222). */
export function slamArtScale(artW: number): number {
  return (2 * BOSS_SLAM.radius) / artW;
}

/** A fresh boss opens with a chase; the first telegraph comes `cycleS - telegraphS - chargeS` s in. */
export function startBossCycle(): BossCycle {
  return {
    phase: 'chase',
    remainingS: CHASE_S,
    chargeDir: NO_DIRECTION,
    next: 'charge',
    skill: null,
    skillDir: NO_DIRECTION,
    clockS: 0,
    readyAtS: {},
  };
}

/**
 * The cycle in the wind-up of `skill` as of boss clock `nowS` (CO-223): the aim
 * locked toward `target` as seen from `from`, the skill's next start held off
 * by its cooldown. The one way a wind-up begins, in `stepBossCycle` and the test hook.
 */
export function beginWindup(
  cycle: BossCycle,
  skill: BossSkillId,
  nowS: number,
  from: Readonly<Vec2>,
  target: Readonly<Vec2>,
): BossCycle {
  const { cooldownS } = BOSS_SKILLS[skill] as { cooldownS?: number };
  return {
    ...cycle,
    phase: 'windup',
    remainingS: phaseLengthS('windup', false, skill),
    skill,
    skillDir: unitToward(from, target),
    readyAtS:
      cooldownS === undefined ? cycle.readyAtS : { ...cycle.readyAtS, [skill]: nowS + cooldownS },
  };
}

/**
 * Advance the cycle by one frame of `deltaS` seconds and say how to move over
 * it. A frame that outruns the current phase carries the remainder into the
 * next, so a long frame (a scaled run) keeps the 4 s period exact and moves the
 * boss by what each phase it crossed asks for — no more. The frame that ends
 * the telegraph locks the charge toward `target` as seen from `from`; nothing
 * later turns it. A bad frame leaves the cycle alone and moves nothing.
 *
 * Slows and stuns scale the movement through `speedFactor`, the charge
 * included; the cycle keeps time regardless, so a frozen boss simply charges
 * nowhere. The chase legs all aim where the target stood at the start of the
 * frame, as a regular enemy's chase does (`chaseVelocity`).
 *
 * `enraged` (#388) speeds the chase and charge and shortens the chase leg.
 *
 * `skills` (CO-222) is the list the current bar draws from. Empty, the boss
 * only charges. A chase that ends with a skill due enters a windup that picks
 * the skill at random from the ready ones, weighted by how far `target` is
 * (`pickBossSkill`), drawing from `rand` once per pick (CO-223; the entity owns
 * a seeded stream, so a seed repeats its picks), and keeps it if the list
 * changes mid-windup; the windup's end is
 * the impact, reported once in `impacts` whatever the frame's length. The boss
 * stands still in both.
 */
export function stepBossCycle(
  cycle: BossCycle,
  deltaS: number,
  from: Readonly<Vec2>,
  target: Readonly<Vec2>,
  speedFactor = 1,
  enraged = false,
  skills: readonly BossSkillId[] = [],
  rand: () => number = () => 0,
): BossStep {
  if (!(deltaS > 0) || !Number.isFinite(deltaS))
    return { cycle, velocity: NO_DIRECTION, impacts: [] };
  let { phase, remainingS, chargeDir, next, skill, skillDir, readyAtS } = cycle;
  const impacts: { skill: BossSkillId; aim: Vec2; atS: number }[] = [];
  const chaseDir = unitToward(from, target);
  const distance = Math.hypot(target.x - from.x, target.y - from.y);
  let moveX = 0;
  let moveY = 0;
  let left = deltaS;
  const travel = (seconds: number): void => {
    const step = phaseSpeed(phase, enraged) * seconds;
    const direction = phase === 'charge' ? chargeDir : chaseDir;
    moveX += direction.x * step;
    moveY += direction.y * step;
  };
  while (left >= remainingS) {
    travel(remainingS);
    left -= remainingS;
    if (phase === 'telegraph') chargeDir = unitToward(from, target);
    if (phase === 'chase') {
      // A skill leg whose skills are all cooling down is a charge instead (CO-223).
      const picked =
        next === 'skill'
          ? pickBossSkill(skills, readyAtS, cycle.clockS + deltaS - left, distance, rand)
          : null;
      if (picked) {
        const begun = beginWindup(
          { ...cycle, readyAtS },
          picked,
          cycle.clockS + deltaS - left,
          from,
          target,
        );
        phase = 'windup';
        skill = picked;
        skillDir = begun.skillDir;
        readyAtS = begun.readyAtS;
      } else phase = 'telegraph';
    } else if (phase === 'telegraph') {
      phase = 'charge';
    } else if (phase === 'charge') {
      phase = 'chase';
      next = 'skill';
    } else if (phase === 'windup') {
      phase = 'skill';
      if (skill) impacts.push({ skill, aim: skillDir, atS: cycle.clockS + deltaS - left });
    } else {
      phase = 'chase';
      next = 'charge';
      skill = null;
    }
    remainingS = phaseLengthS(phase, enraged, skill);
  }
  travel(left);
  const scale = speedFactor / deltaS;
  return {
    cycle: {
      phase,
      remainingS: remainingS - left,
      chargeDir,
      next,
      skill,
      skillDir,
      clockS: cycle.clockS + deltaS,
      readyAtS,
    },
    velocity: { x: moveX * scale, y: moveY * scale },
    impacts,
  };
}

/** How fast the boss moves in `phase`, px/s: it stands still to telegraph (spec §5) and in a skill (CO-222). */
function phaseSpeed(phase: BossPhase, enraged: boolean): number {
  const { speed } = bossMods(enraged);
  switch (phase) {
    case 'chase':
      return BOSS.speed * speed;
    case 'telegraph':
    case 'windup':
    case 'skill':
      return 0;
    case 'charge':
      return BOSS.chargeSpeed * speed;
  }
}

function unitToward(from: Readonly<Vec2>, to: Readonly<Vec2>): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return NO_DIRECTION;
  return { x: dx / distance, y: dy / distance };
}
