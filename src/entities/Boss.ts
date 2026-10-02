import Phaser from 'phaser';
import { ARENA_SIZE } from '../config/arena';
import { BOSS, BOSS_SLAM, BOSS_SUMMON, type BossSkillId } from '../config/boss';
import {
  bossAnimation,
  facingFromVector,
  type Clip,
  type EnemyPhase,
  type Facing,
} from '../core/animation';
import {
  BOSS_EVENT,
  beginWindup,
  bossMods,
  bossSkillsFor,
  enterEnrage,
  shouldEnrage,
  slamDamage,
  startBossCycle,
  NO_SKILLS,
  stepBossCycle,
  summonPoints,
  volleyDamage,
  type BossBarBreakPayload,
  type BossCycle,
  type BossImmunePayload,
  type BossPhase,
  type BossPhasePayload,
  type BossSkillPayload,
} from '../core/boss';
import {
  NO_BOSS_CC,
  bossFrost,
  immunePopDue,
  resistBossCc,
  type BossCcKind,
  type BossCcState,
} from '../core/bossCrowdControl';
import type { Vec2 } from '../core/enemy';
import type { FrostHit } from '../core/frostNova';
import { bossBarBroke, bossBarLayers } from '../core/hudModel';
import { createRng, type Rng } from '../core/rng';
import { emitRunEvent } from '../core/runEvents';
import { Enemy } from './Enemy';

/**
 * The telegraph flash for the placeholder ring: it fills white for the wind-up
 * so the charge reads before it lands; a skill's windup flashes the same way
 * (CO-222). With the atlas the clip is the warning (CO-081) and the tint stays off.
 */
const TELEGRAPH_TINT = 0xffffff;

/** CO-224: the summon ring's size and the arena it is kept inside, as `summonPoints` takes them. */
const SUMMON_RING = [
  BOSS_SUMMON.packSize,
  BOSS_SUMMON.ringRadius,
  ARENA_SIZE,
  BOSS_SUMMON.circleRadius,
] as const;

/** #388: the red an enraged placeholder ring is multiplied by; with the atlas the aura says it instead. */
const ENRAGE_TINT = 0xff6a6a;

/**
 * The boss (spec §5 "Boss"): an enemy with its own stats and a charge cycle.
 * Between charges it chases like any enemy, at 70 px/s. Every 4 s it stops and
 * flashes for 0.8 s, then charges for 0.6 s at 400 px/s along a line locked
 * toward where the player stood as the flash ended.
 *
 * It lives in the enemy pool's group (`EnemyPool.spawnBoss`), so every spell's
 * targeting and overlap wiring reaches it unchanged, and burns, slows and stuns
 * apply as they do to any enemy — a slow scales the charge too — save for the
 * crowd-control rules below. One of a kind: never recycled as a regular
 * enemy; the pool drops it when it dies.
 *
 * Its HP is published as `run:bossHp` on the scene emitter (CO-051), on spawn
 * and after every hit, the way `Player` publishes `run:hp`; the HUD boss bar
 * (CO-012) renders from those events alone.
 *
 * Its clips follow the cycle (CO-081): `walk`, `telegraph` and `charge` per
 * facing, `hurt` between them, and `death` played out before `BOSS_EVENT.died`
 * tells the run it has won — `Enemy` keeps the sprite for the clip's length.
 * It faces its last velocity: the player while it chases, so the telegraph
 * that follows the stop faces them too, and the locked line while it charges.
 *
 * Its crowd control is resisted (CO-221): a stun does nothing, a freeze is a
 * short slow, and a stagger or slow lasts a quarter as long. A stun or freeze
 * shrugged off shows an "Immune" pop (`BOSS_EVENT.immune`), throttled. It also
 * diminishes (#315): every stagger and slow repeated within a few seconds lasts
 * a fraction of the last (`core/bossCrowdControl.ts`), so Persistence can
 * interrupt the boss but never lock it down.
 *
 * Between charges it uses a skill (CO-222): a 1 s windup standing still, then
 * the skill lands once (`BOSS_EVENT.skill`, at the boss's spot) and plays out
 * 0.4 s; which skill comes from the list for the bars broken so far.
 *
 * Enrage (#388): a hit that leaves it at or under half its last bar latches
 * it enraged for the rest of the fight (`BOSS_ENRAGE`): harder contact, faster,
 * a shorter chase between charges, and it takes more damage. It tells the run
 * once through `BOSS_EVENT.enrage`; the crossing hit itself is not amplified.
 *
 * All the decisions live in `core/boss.ts`; this class only moves the sprite.
 */
export class Boss extends Enemy {
  private cycle: BossCycle = startBossCycle();
  /** The stream the skill rolls draw from (CO-223); the run hands one in at spawn. */
  private skillRng: Rng = createRng(0);
  /** CO-224: the skills the pick leaves out right now (summon at the pack cap); asked each leg. */
  private blockedSkills: () => ReadonlySet<BossSkillId> = () => NO_SKILLS;
  /** CO-224: where a summon's pack will land, locked as its wind-up began; null outside one. */
  private summonSpots: Vec2[] | null = null;
  /** Whether the atlas is drawing the telegraph, so the tint fallback can stand down. */
  private animated = false;
  /** Seconds this boss has been alive, run time; the clock its crowd-control windows are read on (#315). */
  private clockS = 0;
  private cc: BossCcState = NO_BOSS_CC;
  /** Boss clock of the last "Immune" pop, so a stream of stuns shows one now and then (CO-221). */
  private lastImmuneS = -Infinity;
  /** #387: bars still alive as of the last hit, so a hit that takes one off can be told. */
  private barsLeft = BOSS.bars;
  /** #388: latched once the boss has crossed its enrage threshold; reset on spawn. */
  private enraged = false;
  /** Test hook (CO-222): charges begun since spawn. */
  private charges = 0;
  /** Test hook (CO-223): a wind-up to begin at the top of the next step. */
  private forcedSkill: { skill: BossSkillId; target: Vec2 } | null = null;

  constructor(scene: Phaser.Scene, x = 0, y = 0) {
    super(scene, x, y);
  }

  override get contactDamage(): number {
    return BOSS.contactDamage * bossMods(this.enraged).damage;
  }

  /** #388: an enraged boss takes `BOSS_ENRAGE.damageTakenMul` times the damage. */
  override get damageTakenFactor(): number {
    return bossMods(this.enraged).damageTaken;
  }

  /** #388: whether the boss has enraged. */
  get isEnraged(): boolean {
    return this.enraged;
  }

  /** Where the boss is in its cycle: chasing, telegraphing, charging, or winding up or landing a skill. */
  get phase(): BossPhase {
    return this.cycle.phase;
  }

  /** CO-222: the skill in its windup or landing, or null. */
  get skill(): BossSkillId | null {
    return this.cycle.skill;
  }

  /** CO-222: seconds of the wind-up left on the boss clock, 0 outside one. */
  get windupLeftS(): number {
    return this.cycle.phase === 'windup' ? this.cycle.remainingS : 0;
  }

  /** Test hook (CO-222): charges begun since spawn. */
  get chargesForTest(): number {
    return this.charges;
  }

  /** CO-223: seconds until `skill` may begin its wind-up, on the boss clock; 0 when ready. */
  readyInS(skill: BossSkillId): number {
    return Math.max(0, (this.cycle.readyAtS[skill] ?? 0) - this.cycle.clockS);
  }

  /** CO-223: seconds until a volley may begin its wind-up, on the boss clock; 0 when ready. */
  get volleyReadyInS(): number {
    return this.readyInS('volley');
  }

  /** CO-224: where the pack of a summon in its wind-up will land; empty outside one. */
  get lockedSummonPoints(): readonly Vec2[] {
    return this.cycle.phase === 'windup' && this.cycle.skill === 'summon'
      ? (this.summonSpots ?? [])
      : [];
  }

  /**
   * Test hook (CO-222, CO-223): the boss starts `skill`'s wind-up now, aimed at
   * `target`, whatever its list and cooldown say; the skill's cooldown starts as
   * it would for a real wind-up.
   */
  skipToSkillForTest(skill: BossSkillId, target: Readonly<Vec2>): void {
    // Begun at the top of the next step, not here, so the clip, tint and warning
    // all change on the same frame as the phase, as for a real wind-up.
    this.forcedSkill = { skill, target: { x: target.x, y: target.y } };
  }

  /** CO-223: the angle a skill's wind-up locked its aim at, radians; 0 when nothing locked it. */
  get skillAimRad(): number {
    return Math.atan2(this.cycle.skillDir.y, this.cycle.skillDir.x);
  }

  /** CO-223: a skill's aim faces the boss through its wind-up and landing; otherwise its last move. */
  protected override get facingDir(): Facing {
    const { phase, skill, skillDir } = this.cycle;
    if (skill !== null && (phase === 'windup' || phase === 'skill'))
      return facingFromVector(skillDir, super.facingDir);
    return super.facingDir;
  }

  /** Test hook (CO-221): the boss clock, which advances only as the boss steers. */
  get clockForTest(): number {
    return this.clockS;
  }

  /** Come alive at (x, y) at full HP with the cycle at its start. */
  spawnBoss(
    x: number,
    y: number,
    skillRng: Rng,
    blockedSkills: () => ReadonlySet<BossSkillId> = () => NO_SKILLS,
  ): void {
    this.cycle = startBossCycle();
    this.skillRng = skillRng;
    this.blockedSkills = blockedSkills;
    this.summonSpots = null;
    this.charges = 0;
    this.forcedSkill = null;
    this.clockS = 0;
    this.cc = NO_BOSS_CC;
    this.lastImmuneS = -Infinity;
    this.barsLeft = BOSS.bars;
    this.enraged = false;
    this.arise(BOSS, x, y);
    this.emitHp();
  }

  /** CO-221: a stun does nothing to the boss; the damage that came with it still lands. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- keeps the base signature; the length is ignored
  override applyStun(_stunS: number): void {
    this.shrug();
  }

  /** CO-221: a quarter of the length, then diminishing returns (#315). */
  override applyStagger(staggerS: number): void {
    super.applyStagger(this.resist('stagger', staggerS));
  }

  /**
   * CO-221: a freeze is shrugged off and becomes a short slow; any slow is cut
   * and diminished in length, not in strength (`bossFrost`).
   */
  override applyFrost(hit: Readonly<FrostHit>): void {
    const applied = bossFrost(this.cc, hit, this.clockS);
    this.cc = applied.state;
    if (applied.shrugged) this.shrug();
    super.applyFrost(applied.hit);
  }

  /** The length `durationS` of `kind` takes on this boss now, counting it as an application. */
  private resist(kind: BossCcKind, durationS: number): number {
    const applied = resistBossCc(this.cc, kind, durationS, this.clockS);
    this.cc = applied.state;
    return applied.durationS;
  }

  /** A stun or freeze did nothing: say so over the boss, at most once per `immunePopGapS`. */
  private shrug(): void {
    if (!immunePopDue(this.lastImmuneS, this.clockS)) return;
    this.lastImmuneS = this.clockS;
    const payload: BossImmunePayload = { x: this.x, y: this.y - this.bodyRadius };
    this.scene.events.emit(BOSS_EVENT.immune, payload);
  }

  /**
   * Every hit redraws the boss bar; the killing blow shows it empty. A hit that
   * takes a bar off and leaves some tells the run (#387), once however many
   * bars it skips; the killing blow does not, the death cue is its own.
   */
  override takeDamage(amount: number): boolean {
    const died = super.takeDamage(amount);
    this.emitHp();
    const { left } = bossBarLayers(this.remainingHp, BOSS.hp, BOSS.bars);
    if (bossBarBroke(this.barsLeft, left)) {
      const payload: BossBarBreakPayload = { left };
      this.scene.events.emit(BOSS_EVENT.barBreak, payload);
    }
    this.barsLeft = left;
    if (!died && shouldEnrage(this.enraged, this.remainingHp)) this.enrage();
    return died;
  }

  /** Latch the enrage: a running chase is cut to the enraged pace, then the run is told (#388). */
  private enrage(): void {
    this.enraged = true;
    this.cycle = enterEnrage(this.cycle);
    this.refreshTint();
    this.scene.events.emit(BOSS_EVENT.enrage);
  }

  /** The end of the death clip is the win (spec §4 step 4), not the killing blow. */
  override despawn(): void {
    const finished = this.isDying;
    super.despawn();
    if (finished) this.scene.events.emit(BOSS_EVENT.died);
  }

  private emitHp(): void {
    emitRunEvent(this.scene.events, 'bossHp', { hp: this.remainingHp, maxHp: BOSS.hp });
  }

  /** Advance the cycle by the frame and move as the current phase asks. */
  protected override steer(deltaS: number, target: Readonly<Vec2>, speedFactor: number): Vec2 {
    this.clockS += deltaS;
    const wasFlashing = this.flashing;
    const before = this.cycle.phase;
    const from = { x: this.x, y: this.y };
    if (this.forcedSkill) {
      const { skill, target: aim } = this.forcedSkill;
      this.forcedSkill = null;
      this.cycle = beginWindup(this.cycle, skill, this.cycle.clockS, from, aim);
      this.lockSummonSpots(from);
    }
    const skills = bossSkillsFor(BOSS.bars - this.barsLeft);
    const step = stepBossCycle(
      this.cycle,
      deltaS,
      this,
      target,
      speedFactor,
      this.enraged,
      skills,
      () => this.skillRng.next(),
      this.blockedSkills(),
    );
    const windupBegan = before !== 'windup' && step.cycle.phase === 'windup';
    this.cycle = step.cycle;
    if (windupBegan) this.lockSummonSpots(from);
    if (this.cycle.phase === 'charge' && before !== 'charge') this.charges += 1;
    if (this.flashing !== wasFlashing) this.refreshTint();
    if (this.cycle.phase !== before) {
      const payload: BossPhasePayload = { phase: this.cycle.phase };
      this.scene.events.emit(BOSS_EVENT.phase, payload);
    }
    // The slam lands where the boss stood at the frame's start: it holds still
    // through a wind-up, so only a frame long enough to also span the chase
    // before it (a scaled clock) lands it short of where the boss ends up.
    for (const { skill, aim, atS } of step.impacts) {
      const base = { x: from.x, y: from.y, atS };
      const aimRad = Math.atan2(aim.y, aim.x);
      let payload: BossSkillPayload;
      if (skill === 'volley')
        payload = { ...base, skill, aimRad, damage: volleyDamage(this.enraged) };
      else if (skill === 'summon') {
        // A frame that spanned the whole wind-up never saw it begin: the ring is made now.
        const points = this.summonSpots ?? summonPoints(from, aimRad, ...SUMMON_RING);
        payload = { ...base, skill, points, damage: 0 };
      } else
        payload = { ...base, skill, radius: BOSS_SLAM.radius, damage: slamDamage(this.enraged) };
      this.scene.events.emit(BOSS_EVENT.skill, payload);
    }
    return step.velocity;
  }

  /** CO-224: lock the pack's landing ring if a summon's wind-up is the one that just began. */
  private lockSummonSpots(from: Readonly<Vec2>): void {
    const { phase, skill, skillDir } = this.cycle;
    this.summonSpots =
      phase === 'windup' && skill === 'summon'
        ? summonPoints(from, Math.atan2(skillDir.y, skillDir.x), ...SUMMON_RING)
        : null;
  }

  override get bodyRadius(): number {
    return BOSS.radius;
  }

  /** The boss sheet has no spawn: it walks in, and nothing holds it on arrival. */
  protected override show(phase: EnemyPhase, velocity: Readonly<Vec2>): number {
    // One clip stands for the whole sheet: `installAtlas` registers every
    // animation or none, so the telegraph clip is there whenever the walk is.
    this.animated = this.scene.anims.exists(`boss.walk.${this.facingDir}`);
    if (phase === 'spawn') {
      super.show('move', velocity);
      return 0;
    }
    return super.show(phase, velocity);
  }

  /** `Enemy`'s phases map onto the boss sheet through the cycle: moving is whatever the cycle is doing. */
  protected override clip(phase: EnemyPhase): Clip {
    const name = bossAnimation({
      phase: this.cycle.phase,
      facing: this.facingDir,
      hurt: phase === 'hurt',
      dead: phase === 'death',
      skill: this.cycle.skill,
    });
    return { name, flipX: false };
  }

  /** The telegraph or a skill's windup: the placeholder ring's white flash (CO-222). */
  private get flashing(): boolean {
    return this.cycle.phase === 'telegraph' || this.cycle.phase === 'windup';
  }

  /** The telegraph flash outranks the status tints: the warning must always show. */
  protected override refreshTint(): void {
    if (this.flashing && !this.animated) this.setTintFill(TELEGRAPH_TINT);
    else {
      super.refreshTint();
      // #388: the ring's enrage red, under any status tint; the atlas has its aura instead.
      if (this.enraged && !this.animated && !this.isTinted) this.setTint(ENRAGE_TINT);
    }
  }
}
