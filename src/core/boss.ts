import {
  BOSS,
  BOSS_CHAIN,
  BOSS_ENRAGE,
  BOSS_LEAP,
  BOSS_SKILL_RANGE,
  BOSS_SKILL_ROTATION,
  BOSS_SKILL_WEIGHTS,
  type BossRangeBand,
  BOSS_SKILLS,
  BOSS_SLAM,
  BOSS_SUMMON,
  BOSS_VOLLEY,
  type BossSkillId,
} from '../config/boss';
import type { EnemyType } from '../config/enemies';
import type { Vec2 } from './enemy';
import type { Rng } from './rng';

/**
 * Boss rules that do not need an engine (spec §5 "Boss"): the charge cycle —
 * chase, 0.8 s telegraph, 0.6 s charge, every 4 s — and the movement each frame
 * of it asks for. An enraged boss chains 2 charges in a leg (CO-225): each
 * after the first is warned for 0.4 s and re-locks toward the hero. Between
 * charges the boss uses one skill (CO-222): a windup with a warning, then the
 * skill landing; the legs alternate charge, skill. The skill is drawn at random,
 * weighted by how far the hero stands (CO-223).
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
 * `BossSkillPayload` when a skill lands (CO-222), at the boss's spot then (a
 * leap's, where it lands).
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
  /** CO-225: whether a telegraph or charge is a chained one (the second or later of its chain). */
  readonly chained: boolean;
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

/**
 * Summon (CO-224): a Swarm enemy at each of `points`, the ring locked as the
 * wind-up began so the circles showed where the pack lands. How many of them
 * spawn is the scene's call when it lands (`summonCount`).
 */
export interface BossSummonPayload extends BossSkillPayloadBase {
  readonly skill: 'summon';
  readonly points: readonly Vec2[];
}

/** Leap (CO-232): a ring of `radius` px round the landing (x, y), the point locked as the wind-up began. */
export interface BossLeapPayload extends BossSkillPayloadBase {
  readonly skill: 'leap';
  readonly radius: number;
  /** Where the boss took off, as the wind-up began. */
  readonly from: Vec2;
}

export type BossSkillPayload =
  BossSlamPayload | BossVolleyPayload | BossSummonPayload | BossLeapPayload;

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
  /** Where the boss stood as a skill's windup began (CO-232: a leap's take-off). */
  readonly skillFrom: Vec2;
  /** Where the target stood as it began, locked (CO-232: a leap's landing point). */
  readonly skillTarget: Vec2;
  /** Seconds of frames fed to the cycle so far: the clock the cooldowns run on (CO-223). */
  readonly clockS: number;
  /** Boss clock each skill is next allowed to start a windup at; absent = ready. */
  readonly readyAtS: Readonly<Partial<Record<BossSkillId, number>>>;
  /** CO-225: charges in the current leg's chain; 1 when calm or outside a chain. */
  readonly chainLength: number;
  /** CO-225: which charge of the chain the telegraph or charge now is, 0-based; chained = link > 0. */
  readonly link: number;
  /** CO-225: boss clock at which the current (or last) telegraph began, exact whatever the frame's length. */
  readonly telegraphAtS: number;
}

/** One telegraph that ended in a frame, when the charge direction locked (CO-225). */
export interface BossLock {
  /** Boss clock the telegraph ended and the direction locked at. */
  readonly atS: number;
  /** Boss clock the telegraph began at. */
  readonly telegraphAtS: number;
  /** The locked unit direction; zero when the target stood on the boss. */
  readonly dir: Vec2;
  /** Whether it was a chained telegraph (`link` > 0). */
  readonly chained: boolean;
  readonly link: number;
  readonly chainLength: number;
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
    /** The target locked as the wind-up began (CO-232: where a leap lands). */
    readonly target: Vec2;
    readonly atS: number;
  }[];
  /** CO-225: one per telegraph that ended this frame, so a long frame reports each lock exactly once. */
  readonly locks: readonly BossLock[];
}

const NO_DIRECTION: Vec2 = { x: 0, y: 0 };
/** No skill blocked (CO-224): the default for `pickBossSkill` and `stepBossCycle`. */
export const NO_SKILLS: ReadonlySet<BossSkillId> = new Set();

/** Seconds of plain chase between a charge ending and the next telegraph. */
const CHASE_S = BOSS.cycleS - BOSS.telegraphS - BOSS.chargeS;

/** Seconds of chase once enraged: the cycle's period scaled by `attackGapMul`, the telegraph and charge kept (#388). */
const ENRAGED_CHASE_S = BOSS.cycleS * BOSS_ENRAGE.attackGapMul - BOSS.telegraphS - BOSS.chargeS;

/**
 * How long `phase` lasts (#388). Enrage shortens only the chase: the telegraph
 * is the player's warning and the charge is a fixed length. A skill's windup
 * and landing (CO-222) are its own timings, enraged or not. A `chained`
 * telegraph (CO-225) is the shorter warning before the second or later charge
 * of an enraged chain.
 */
export function phaseLengthS(
  phase: BossPhase,
  enraged = false,
  skill?: BossSkillId | null,
  chained = false,
): number {
  switch (phase) {
    case 'chase':
      return enraged ? ENRAGED_CHASE_S : CHASE_S;
    case 'telegraph':
      return chained ? BOSS_CHAIN.telegraphS : BOSS.telegraphS;
    case 'charge':
      return BOSS.chargeS;
    case 'windup':
      return BOSS_SKILLS[skill ?? 'slam'].windupS;
    case 'skill':
      return BOSS_SKILLS[skill ?? 'slam'].activeS;
  }
}

/**
 * How many charges an enraged chain has (CO-225): `minCharges` to `maxCharges`,
 * drawn with exactly one call of `rand` (clamped in case it returns 1).
 */
export function chainChargeCount(rand: () => number): number {
  const { minCharges, maxCharges } = BOSS_CHAIN;
  return Math.min(maxCharges, minCharges + Math.floor(rand() * (maxCharges - minCharges + 1)));
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
 * band of `distancePx`; a skill weighted 0 there is left out. `rand` is drawn
 * from once, and not at all when none is ready (or the list is empty): the leg
 * is a charge instead, so null. A skill in
 * `blocked` is out of the roll whatever its cooldown (CO-224: summon while the
 * pack is at its cap), so a capped boss slams or volleys instead.
 */
export function pickBossSkill(
  list: readonly BossSkillId[],
  readyAtS: Readonly<Partial<Record<BossSkillId, number>>>,
  nowS: number,
  distancePx: number,
  rand: () => number,
  blocked: ReadonlySet<BossSkillId> = NO_SKILLS,
): BossSkillId | null {
  const band = bossRangeBand(distancePx);
  // A zero weight is out of the roll (CO-232: no leap up close), not a skill that merely rarely comes.
  const ready = list.filter(
    (skill) =>
      !blocked.has(skill) &&
      (readyAtS[skill] ?? -Infinity) <= nowS &&
      BOSS_SKILL_WEIGHTS[skill][band] > 0,
  );
  if (ready.length === 0) return null;
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

/** Leap damage to a player under the landing (CO-232), enrage included. */
export function leapDamage(enraged: boolean): number {
  return BOSS_LEAP.damage * bossMods(enraged).damage;
}

/**
 * Where a boss in a leap is (CO-232), or null when it is not leaping. The
 * wind-up is a crouch on the spot until `airS` s are left, then a straight
 * flight from `skillFrom` to the locked `skillTarget`, arriving exactly as the
 * wind-up ends; the landing's recovery stays on the target. A function of the
 * time left alone, so a frame's length never changes the path. The core's
 * velocity stays 0 for a leap: the entity places the boss at this point.
 */
export function leapPoint(cycle: Readonly<BossCycle>): Vec2 | null {
  if (cycle.skill !== 'leap') return null;
  if (cycle.phase === 'skill') return { x: cycle.skillTarget.x, y: cycle.skillTarget.y };
  if (cycle.phase !== 'windup') return null;
  const { airS } = BOSS_LEAP;
  const t = Math.min(1, Math.max(0, (airS - cycle.remainingS) / airS));
  const { skillFrom: a, skillTarget: b } = cycle;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
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

/**
 * Where a summon's pack lands (CO-224): `count` points evenly round `center` at
 * `radius` px, the first along `aimRad`, each pulled inside `bounds` by `margin`
 * px so a circle never sits on the arena wall. No RNG.
 */
export function summonPoints(
  center: Readonly<Vec2>,
  aimRad: number,
  count = BOSS_SUMMON.packSize,
  radius = BOSS_SUMMON.ringRadius,
  bounds: { readonly width: number; readonly height: number } = {
    width: Infinity,
    height: Infinity,
  },
  margin = BOSS_SUMMON.circleRadius,
): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = aimRad + (i * 2 * Math.PI) / count;
    out.push({
      x: Math.min(bounds.width - margin, Math.max(margin, center.x + Math.cos(angle) * radius)),
      y: Math.min(bounds.height - margin, Math.max(margin, center.y + Math.sin(angle) * radius)),
    });
  }
  return out;
}

/**
 * How many of a summon's pack spawn as it lands (CO-224): the pack size, less
 * what the cap leaves (`maxLive` minus those alive) and what the enemy pool has
 * room for. Read at landing, not at the wind-up, so kills during the warning count.
 */
export function summonCount(liveSummoned: number, poolRoom: number): number {
  return Math.max(0, Math.min(BOSS_SUMMON.packSize, BOSS_SUMMON.maxLive - liveSummoned, poolRoom));
}

/**
 * The types of a summon's `count` pack members, in ring order (CO-231): each an
 * equal-weight pick from `BOSS_SUMMON.types`, the heavy ones left out once
 * `maxHeavy` of them are in. One draw on `rng` a member, so a seed replays it.
 */
export function summonPack(rng: Rng, count: number): EnemyType[] {
  const { types, heavy, maxHeavy } = BOSS_SUMMON;
  const isHeavy = (type: EnemyType): boolean => (heavy as readonly EnemyType[]).includes(type);
  const light = types.filter((type) => !isHeavy(type));
  const out: EnemyType[] = [];
  let heavies = 0;
  for (let i = 0; i < count; i += 1) {
    const type = rng.pick(heavies < maxHeavy ? types : light);
    if (isHeavy(type)) heavies += 1;
    out.push(type);
  }
  return out;
}

/** Scale that makes a warning sprite `artW` px wide span a ring of `radius` px (CO-222: the slam's; CO-232: the leap's). */
export function slamArtScale(artW: number, radius: number = BOSS_SLAM.radius): number {
  return (2 * radius) / artW;
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
    skillFrom: NO_DIRECTION,
    skillTarget: NO_DIRECTION,
    clockS: 0,
    readyAtS: {},
    chainLength: 1,
    link: 0,
    telegraphAtS: 0,
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
    // A forced skill (test hook) can cut a chain short: nothing of it survives.
    chainLength: 1,
    link: 0,
    skill,
    skillDir: unitToward(from, target),
    skillFrom: { x: from.x, y: from.y },
    skillTarget: { x: target.x, y: target.y },
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
 * `enraged` (#388) speeds the chase and charge and shortens the chase leg. It
 * also chains the charge leg (CO-225): as the chase ends in a charge, one draw
 * from `rand` (after the skill pick's draw, when the leg was a skill leg that
 * fell back to a charge) gives the chain's length; the second and later are warned
 * for `BOSS_CHAIN.telegraphS` and each locks toward `target` as seen from
 * `from` when its telegraph ends. A calm boss draws nothing for it. Every lock
 * is reported once in `locks`, whatever the frame's length. A frame that spans
 * several locks aims all of them from its start-of-frame `from` and `target`,
 * the same limit as the single charge's (#89 averaging); in game, frames are
 * about 1/60 s, so this only matters for a scaled test clock.
 *
 * `skills` (CO-222) is the list the current bar draws from. Empty, the boss
 * only charges. A chase that ends with a skill due enters a windup that picks
 * the skill at random from the ready ones (not those in `blocked`, CO-224), weighted by how far `target` is
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
  blocked: ReadonlySet<BossSkillId> = NO_SKILLS,
): BossStep {
  if (!(deltaS > 0) || !Number.isFinite(deltaS))
    return { cycle, velocity: NO_DIRECTION, impacts: [], locks: [] };
  let { phase, remainingS, chargeDir, next, skill, skillDir, skillFrom, skillTarget, readyAtS } =
    cycle;
  let { chainLength, link, telegraphAtS } = cycle;
  const impacts: { skill: BossSkillId; aim: Vec2; target: Vec2; atS: number }[] = [];
  const locks: BossLock[] = [];
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
    if (phase === 'telegraph') {
      chargeDir = unitToward(from, target);
      locks.push({
        atS: cycle.clockS + deltaS - left,
        telegraphAtS,
        dir: chargeDir,
        chained: link > 0,
        link,
        chainLength,
      });
    }
    if (phase === 'chase') {
      // A skill leg whose skills are all cooling down is a charge instead (CO-223).
      const picked =
        next === 'skill'
          ? pickBossSkill(skills, readyAtS, cycle.clockS + deltaS - left, distance, rand, blocked)
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
        skillFrom = begun.skillFrom;
        skillTarget = begun.skillTarget;
        readyAtS = begun.readyAtS;
      } else {
        phase = 'telegraph';
        chainLength = enraged ? chainChargeCount(rand) : 1;
        link = 0;
        telegraphAtS = cycle.clockS + deltaS - left;
      }
    } else if (phase === 'telegraph') {
      phase = 'charge';
    } else if (phase === 'charge') {
      if (link < chainLength - 1) {
        phase = 'telegraph';
        link += 1;
        telegraphAtS = cycle.clockS + deltaS - left;
      } else {
        phase = 'chase';
        next = 'skill';
        chainLength = 1;
        link = 0;
      }
    } else if (phase === 'windup') {
      phase = 'skill';
      if (skill)
        impacts.push({
          skill,
          aim: skillDir,
          target: skillTarget,
          atS: cycle.clockS + deltaS - left,
        });
    } else {
      phase = 'chase';
      next = 'charge';
      skill = null;
    }
    remainingS = phaseLengthS(phase, enraged, skill, link > 0);
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
      skillFrom,
      skillTarget,
      clockS: cycle.clockS + deltaS,
      readyAtS,
      chainLength,
      link,
      telegraphAtS,
    },
    velocity: { x: moveX * scale, y: moveY * scale },
    impacts,
    locks,
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
