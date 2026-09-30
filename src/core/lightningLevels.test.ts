import { describe, expect, it } from 'vitest';
import { BASE_COMPANION_STATS } from '../config/companions';
import {
  COMPANION_ARC,
  FORK,
  STORM_CELL,
  SWORD_ARC,
  THUNDERBOLT,
  THUNDERCLAP,
  TWIN_TORNADO,
} from '../config/lightningLevels';
import {
  BASE_CHAIN_LIGHTNING_STATS,
  BASE_SWORD_STATS,
  BASE_TORNADO_STATS,
} from '../config/lightningRoster';
import { PROFILE_CLAMPS } from '../config/passives';
import { rosterBaseStats } from '../config/rosterBaseStats';
import { SPELL_LEVEL_STATS } from '../config/spellLevels';
import type { SpellLevel } from '../config/spellLevels';
import { BASE_SPELL_STATS } from '../config/spells';
import { NO_BOSS_CC, applyBossCc, type BossCcKind, type BossCcState } from './bossCrowdControl';
import { applyStun, resolveCast, tickStun } from './chainLightning';
import {
  arcTargets,
  forkCast,
  forkPaths,
  frenzyCooldown,
  hasCompanionArc,
  hasFork,
  hasStormCell,
  hasSwordArc,
  hasThunderclap,
  isThunderboltCast,
  nextThunderboltCount,
  skyStrikeTargets,
  stormBoltDamage,
  stormBoltsDue,
  stormCellTarget,
  stunStream,
  swordArcPath,
  thunderboltDamage,
  thunderclapPath,
  tornadoesPerCast,
  twinHeadings,
} from './lightningLevels';
import { createRng } from './rng';
import { applyLevelStats, levelStatAdds } from './spellLevelStats';
import { applyStagger, tickStagger } from './status';
import type { ChainLightningStats } from './spellStats';

/** #329: the level 2 and 3 rules of the Lightning spells, checked without an engine. */

const LEVELS: readonly SpellLevel[] = [1, 2, 3];
const DEG = Math.PI / 180;

type Body = { x: number; y: number; bodyRadius: number };
const body = (x: number, y: number, bodyRadius = 10): Body => ({ x, y, bodyRadius });

describe('level gates', () => {
  it('turns each behaviour on at its own level and keeps it on', () => {
    expect(LEVELS.map(hasFork)).toEqual([false, false, true]);
    expect(LEVELS.map(hasStormCell)).toEqual([false, false, true]);
    expect(LEVELS.map(hasCompanionArc)).toEqual([false, true, true]);
    expect(LEVELS.map(hasThunderclap)).toEqual([false, false, true]);
    expect(LEVELS.map(hasSwordArc)).toEqual([false, false, true]);
    expect(LEVELS.map(tornadoesPerCast)).toEqual([1, TWIN_TORNADO.count, TWIN_TORNADO.count]);
  });

  it('rolls level 1 on the run stream and every level after on the levels stream', () => {
    expect(LEVELS.map((level) => stunStream(level, 'run', 'levels'))).toEqual([
      'run',
      'levels',
      'levels',
    ]);
  });
});

describe('level 2 and 3 stat adds, as the Spellbook applies them', () => {
  const at = (id: 'lightning' | 'lightning_chain' | 'lightning_sword', level: SpellLevel) =>
    applyLevelStats(rosterBaseStats(id)!, levelStatAdds(SPELL_LEVEL_STATS, id, level));

  it('Lightning Bolt strikes 1 -> 2 targets from level 2', () => {
    expect(LEVELS.map((level) => at('lightning', level).strikes)).toEqual([1, 2, 2]);
  });

  it('Chain Lightning chains 2 -> 4 from level 2', () => {
    expect(LEVELS.map((level) => at('lightning_chain', level).chains)).toEqual([2, 4, 4]);
  });

  it('Lightning Sword turns 3 -> 4 -> 5 blades', () => {
    expect(LEVELS.map((level) => at('lightning_sword', level).count)).toEqual([3, 4, 5]);
  });

  it('adds nothing to Tornado or the Lightning Companion: their levels are behaviour', () => {
    expect(SPELL_LEVEL_STATS).not.toHaveProperty('lightning_tornado');
    expect(SPELL_LEVEL_STATS).not.toHaveProperty('lightning_companion');
  });
});

describe('Lightning Bolt level 3, Thunderbolt', () => {
  it('counts casts from the pick of level 3, so the first sky strike is the 5th cast after it', () => {
    // Twelve casts at level 1, three at level 2, then level 3 from cast 16 on.
    const levels: SpellLevel[] = [
      ...Array.from({ length: 12 }, () => 1 as const),
      ...Array.from({ length: 3 }, () => 2 as const),
      ...Array.from({ length: 11 }, () => 3 as const),
    ];
    let count = 0;
    const strikes: number[] = [];
    levels.forEach((level, i) => {
      count = nextThunderboltCount(count, level);
      if (isThunderboltCast(count, level)) strikes.push(i + 1);
    });
    // Casts 16..26 are level 3: its 5th and 10th are casts 20 and 25.
    expect(strikes).toEqual([20, 25]);
    expect(nextThunderboltCount(7, 1)).toBe(0);
    expect(nextThunderboltCount(7, 2)).toBe(0);
    expect(nextThunderboltCount(0, 3)).toBe(1);
  });

  it('calls a sky strike on every 5th cast from level 3 only', () => {
    const casts = Array.from({ length: 15 }, (_, i) => i + 1);
    expect(casts.filter((n) => isThunderboltCast(n, 3))).toEqual([5, 10, 15]);
    expect(casts.some((n) => isThunderboltCast(n, 2))).toBe(false);
    expect(casts.some((n) => isThunderboltCast(n, 1))).toBe(false);
    expect(isThunderboltCast(0, 3)).toBe(false);
    expect(isThunderboltCast(-5, 3)).toBe(false);
  });

  it('catches every enemy whose body reaches into the radius, inclusive, and nothing further', () => {
    const r = THUNDERBOLT.radius;
    const centre = body(0, 0);
    const edge = body(r + 10, 0, 10);
    const past = body(r + 10.5, 0, 10);
    const big = body(0, r + 30, 30);
    expect(skyStrikeTargets(centre, [centre, edge, past, big])).toEqual([centre, edge, big]);
  });

  it('pays a multiple of the bolt', () => {
    expect(thunderboltDamage(14)).toBeCloseTo(14 * THUNDERBOLT.damageFactor, 9);
    expect(thunderboltDamage(10, 2)).toBe(20);
  });
});

describe('Chain Lightning level 2 and 3, Fork', () => {
  /** A star of enemies round a hub: two arms of `n` along +x and -x, `gap` apart. */
  function arms(n: number, gap = 80): { hub: Body; left: Body[]; right: Body[] } {
    const hub = body(0, 0);
    const right = Array.from({ length: n }, (_, i) => body(gap * (i + 1), 0));
    const left = Array.from({ length: n }, (_, i) => body(-gap * (i + 1) - 1, 0));
    return { hub, left, right };
  }

  it('level 2 chains four times where level 1 chained twice', () => {
    const { hub, right } = arms(6);
    const stats = (chains: number): ChainLightningStats => ({
      ...BASE_CHAIN_LIGHTNING_STATS,
      chains,
      targetRange: 1000,
    });
    const level1 = resolveCast({ x: 0, y: 0 }, [hub, ...right], stats(2));
    const level2 = resolveCast({ x: 0, y: 0 }, [hub, ...right], stats(4));
    expect(level1[0]?.length).toBe(3);
    expect(level2[0]?.length).toBe(5);
  });

  it('splits at the first target: the two branches take turns and head their own ways', () => {
    const { hub, left, right } = arms(4);
    const [a, b] = forkPaths(hub, [hub, ...right, ...left], 4, 120, new Set(), 99);
    expect(a).toEqual(right);
    expect(b).toEqual(left);
  });

  it('jumps each branch up to `chains` times, never the same enemy twice', () => {
    const { hub, left, right } = arms(6);
    const [a, b] = forkPaths(hub, [hub, ...right, ...left], 4, 120, new Set(), 99);
    expect(a).toHaveLength(4);
    expect(b).toHaveLength(4);
    const all = [hub, ...a, ...b];
    expect(new Set(all).size).toBe(all.length);
  });

  it('caps the whole bolt at maxHits, the first target included', () => {
    const { hub, left, right } = arms(6);
    const [a, b] = forkPaths(hub, [hub, ...right, ...left], 4, 120);
    expect(1 + a.length + b.length).toBe(FORK.maxHits);
    // Turns alternate, so the cap cuts the second branch's last jump, not a whole branch.
    expect(a.length - b.length).toBeLessThanOrEqual(1);
    for (const bad of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      const [x, y] = forkPaths(hub, [hub, ...right], 4, 120, new Set(), bad);
      expect(x.length + y.length, String(bad)).toBe(0);
    }
  });

  it('gives a lone neighbour to the first branch and leaves the second empty', () => {
    const hub = body(0, 0);
    const one = body(50, 0);
    expect(forkPaths(hub, [hub, one], 4, 120)).toEqual([[one], []]);
    expect(forkPaths(hub, [hub], 4, 120)).toEqual([[], []]);
  });

  it('never jumps to an enemy already struck by the cast, nor past chainRange', () => {
    const hub = body(0, 0);
    const struck = body(40, 0);
    const far = body(-200, 0);
    expect(forkPaths(hub, [hub, struck, far], 4, 120, new Set([struck]))).toEqual([[], []]);
  });

  it('forkCast strikes the nearest first at full damage, every branch hit at the falloff, each from the one before', () => {
    const { hub, left, right } = arms(3);
    const stats: ChainLightningStats = { ...BASE_CHAIN_LIGHTNING_STATS, chains: 4 };
    const [bolt, ...rest] = forkCast({ x: -10, y: 30 }, [...right, hub, ...left], stats);
    expect(rest).toEqual([]);
    expect(bolt?.[0]).toEqual({ target: hub, damage: stats.damage, from: null, branch: null });
    const chained = bolt?.slice(1) ?? [];
    expect(chained).toHaveLength(6);
    for (const hit of chained) expect(hit.damage).toBeCloseTo(stats.damage * stats.chainFalloff, 9);
    for (const branch of [0, 1] as const) {
      const hits = chained.filter((h) => h.branch === branch);
      expect(hits[0]?.from).toBe(hub);
      for (let i = 1; i < hits.length; i += 1) expect(hits[i]?.from).toBe(hits[i - 1]?.target);
    }
  });

  it('forkCast spreads extra strikes over unhit enemies, and a lone enemy is struck by each', () => {
    const near = body(20, 0);
    const other = body(0, 140);
    const stats: ChainLightningStats = { ...BASE_CHAIN_LIGHTNING_STATS, strikes: 2, chains: 0 };
    const bolts = forkCast({ x: 0, y: 0 }, [other, near], stats);
    expect(bolts.map((b) => b[0]?.target)).toEqual([near, other]);
    const lone = forkCast({ x: 0, y: 0 }, [near], stats);
    expect(lone.map((b) => b.length)).toEqual([1, 1]);
    expect(forkCast({ x: 0, y: 0 }, [], stats)).toEqual([]);
    expect(forkCast({ x: 0, y: 0 }, [body(999, 0)], stats)).toEqual([]);
  });
});

describe('Tornado level 2 and 3, Storm cell', () => {
  it('sends a lone tornado on the aim itself and two fanned symmetric about it', () => {
    const aim = { x: 0.6, y: 0.8 };
    expect(twinHeadings(aim, 1)).toEqual([aim]);
    const [a, b] = twinHeadings(aim, 2);
    const angle = Math.atan2(aim.y, aim.x);
    expect(Math.atan2(a!.y, a!.x)).toBeCloseTo(angle - (TWIN_TORNADO.spreadDeg / 2) * DEG, 9);
    expect(Math.atan2(b!.y, b!.x)).toBeCloseTo(angle + (TWIN_TORNADO.spreadDeg / 2) * DEG, 9);
    for (const h of [a!, b!]) expect(Math.hypot(h.x, h.y)).toBeCloseTo(1, 9);
    expect(twinHeadings(aim, 0)).toEqual([]);
  });

  it('throws a bolt every 0.5 s of a funnel life, however the frames split it', () => {
    const rng = createRng(329);
    for (let run = 0; run < 20; run += 1) {
      let life = 0;
      let bolts = 0;
      while (life < BASE_TORNADO_STATS.duration) {
        const next = Math.min(BASE_TORNADO_STATS.duration, life + rng.next() * 0.1);
        bolts += stormBoltsDue(life, next);
        life = next;
      }
      expect(bolts).toBe(Math.floor(BASE_TORNADO_STATS.duration / STORM_CELL.everyS));
    }
    expect(stormBoltsDue(0, 0.49)).toBe(0);
    expect(stormBoltsDue(0.49, 0.5)).toBe(1);
    expect(stormBoltsDue(0, 1.2)).toBe(2);
  });

  it('throws nothing for a bad or backwards frame', () => {
    expect(stormBoltsDue(1, 1)).toBe(0);
    expect(stormBoltsDue(1, 0.5)).toBe(0);
    expect(stormBoltsDue(0, Number.NaN)).toBe(0);
    expect(stormBoltsDue(0, Number.POSITIVE_INFINITY)).toBe(0);
    expect(stormBoltsDue(0, 1, 0)).toBe(0);
  });

  it('picks the nearest enemy outside the eye, else the nearest inside, within range', () => {
    const centre = { x: 0, y: 0 };
    const inside = { x: 10, y: 0 };
    const outside = { x: 100, y: 0 };
    const far = { x: STORM_CELL.range + 1, y: 0 };
    expect(stormCellTarget(centre, [inside, outside, far], 60)).toBe(outside);
    expect(stormCellTarget(centre, [inside, far], 60)).toBe(inside);
    expect(stormCellTarget(centre, [far], 60)).toBeUndefined();
  });

  it("pays a multiple of the tornado's tick", () => {
    expect(stormBoltDamage(BASE_TORNADO_STATS.tickDamage)).toBeCloseTo(
      BASE_TORNADO_STATS.tickDamage * STORM_CELL.damageFactor,
      9,
    );
  });
});

describe('Lightning Companion level 2 arc and level 3 Thunderclap', () => {
  it('attacks twice as fast from level 2', () => {
    const base = BASE_COMPANION_STATS.lightning_companion.attackCooldown;
    expect(LEVELS.map((level) => frenzyCooldown(base, level))).toEqual([base, base / 2, base / 2]);
  });

  it('strikes the enemies in front of it, within reach and the half angle, never the target or behind', () => {
    const from = { x: 0, y: 0 };
    const target = body(20, 0);
    const front = body(50, 10);
    const edge = body(COMPANION_ARC.radius + 10, 0, 10);
    const tooFar = body(COMPANION_ARC.radius + 11, 0, 10);
    const side = body(0, 30);
    const behind = body(-30, 0);
    const wideOk = body(
      Math.cos((COMPANION_ARC.halfAngleDeg - 1) * DEG) * 40,
      Math.sin((COMPANION_ARC.halfAngleDeg - 1) * DEG) * 40,
    );
    const got = arcTargets(from, target, [target, front, edge, tooFar, side, behind, wideOk]);
    expect(new Set(got)).toEqual(new Set([front, edge, wideOk]));
    // Nearest first.
    expect(got[0]).toBe(wideOk);
  });

  it('strikes at most maxTargets, nearest first', () => {
    const from = { x: 0, y: 0 };
    const target = body(15, 0);
    const crowd = Array.from({ length: 10 }, (_, i) => body(20 + i * 3, 0));
    const got = arcTargets(from, target, [target, ...crowd]);
    expect(got).toEqual(crowd.slice(0, COMPANION_ARC.maxTargets));
  });

  it('has no front for a target on its own spot', () => {
    const from = { x: 5, y: 5 };
    expect(arcTargets(from, body(5, 5), [body(5, 5), body(20, 5)])).toEqual([]);
  });

  it("never chains a Thunderclap into an enemy the swing's arc already struck", () => {
    const from = { x: 0, y: 0 };
    const target = body(20, 0);
    // In front of the ally, inside the arc, and 20 px from the target: inside the chain's reach too.
    const bystander = body(40, 5);
    const beyond = body(120, 0);
    const live = [target, bystander, beyond];
    const arc = arcTargets(from, target, live);
    expect(arc).toContain(bystander);
    // Without the arc's victims the chain's first jump would be the bystander.
    expect(thunderclapPath(target, live)[0]).toBe(bystander);
    const chain = thunderclapPath(target, live, THUNDERCLAP, new Set(arc));
    expect(chain).not.toContain(bystander);
    expect(chain).toEqual([beyond]);
  });

  it('chains a Thunderclap to three enemies from the one struck, each jump within range', () => {
    const hit = body(0, 0);
    const line = Array.from({ length: 5 }, (_, i) => body((i + 1) * 100, 0));
    const path = thunderclapPath(hit, [hit, ...line]);
    expect(path).toEqual(line.slice(0, THUNDERCLAP.chains));
    expect(path).not.toContain(hit);
    // Past chainRange the chain stops.
    const gap = body(THUNDERCLAP.chainRange + 1, 0);
    expect(thunderclapPath(hit, [hit, gap])).toEqual([]);
  });
});

describe('Lightning Sword level 3 arc', () => {
  it('leaves the blade for the nearest other enemy within range, then one more from it', () => {
    const blade = { x: 0, y: 0 };
    const cut = body(5, 0);
    const a = body(40, 0);
    const b = body(95, 0);
    const c = body(150, 0);
    expect(swordArcPath(blade, cut, [cut, a, b, c])).toEqual([a, b]);
  });

  it('measures the first hop from the blade, not from the enemy it cut', () => {
    const blade = { x: 0, y: 0 };
    const cut = body(-50, 0);
    // 55 px from the blade but 105 px from the cut enemy: in reach of the blade.
    const nearBlade = body(55, 0);
    expect(swordArcPath(blade, cut, [cut, nearBlade])).toEqual([nearBlade]);
    // Measured to the enemy's edge: a 10 px body reaches 10 px past the range, no further.
    expect(swordArcPath(blade, cut, [cut, body(SWORD_ARC.range + 10, 0, 10)])).toHaveLength(1);
    expect(swordArcPath(blade, cut, [cut, body(SWORD_ARC.range + 10.5, 0, 10)])).toEqual([]);
  });

  it('never strikes an enemy twice, and stops at maxTargets', () => {
    const blade = { x: 0, y: 0 };
    const cut = body(5, 0);
    const crowd = Array.from({ length: 6 }, (_, i) => body(20 + i * 15, 0));
    const path = swordArcPath(blade, cut, [cut, ...crowd]);
    expect(path).toEqual(crowd.slice(0, SWORD_ARC.maxTargets));
    expect(new Set(path).size).toBe(path.length);
  });

  it('never arcs back into the cut enemy, and strikes one when only one is near', () => {
    const blade = { x: 0, y: 0 };
    const cut = body(10, 0);
    const lone = body(30, 0);
    expect(swordArcPath(blade, cut, [cut, lone])).toEqual([lone]);
    expect(swordArcPath(blade, cut, [cut])).toEqual([]);
  });
});

/**
 * The boss's worst case (#315, #329): every Lightning stun and stagger source
 * lands on a lone boss at the Haste clamp's cadence, each through the very
 * functions `Boss.applyStun` and `Boss.applyStagger` run (`applyBossCc`, then
 * `applyStun` / `applyStagger`, then `tickStun` / `tickStagger` each frame).
 * Every stun roll is taken to come up, the strongest reading of its chance.
 * The boss is held while it is stunned or staggered.
 */
describe('boss crowd control, every Lightning level 3 stun and stagger at once', () => {
  const HASTE = PROFILE_CLAMPS.cooldownMul?.min ?? 1;
  const DT = 1 / 60;
  const EPS = 2 * DT;
  const bolt = BASE_SPELL_STATS.lightning;
  const chain = BASE_CHAIN_LIGHTNING_STATS;
  const companion = BASE_COMPANION_STATS.lightning_companion;

  interface Source {
    name: string;
    kind: 'stun' | 'stagger';
    period: number;
    /** Applications per firing: a two-bolt cast on a lone boss strikes it twice. */
    hits: number;
    durationS: number;
  }
  const sources: Source[] = [
    {
      name: 'bolt stun',
      kind: 'stun',
      period: bolt.cooldown * HASTE,
      hits: 2,
      durationS: bolt.stunDuration,
    },
    {
      name: 'bolt stagger',
      kind: 'stagger',
      period: bolt.cooldown * HASTE,
      hits: 2,
      durationS: bolt.staggerDuration,
    },
    {
      name: 'thunderbolt',
      kind: 'stun',
      period: THUNDERBOLT.every * bolt.cooldown * HASTE,
      hits: 1,
      durationS: THUNDERBOLT.stunS,
    },
    // A fork strikes each enemy once, so a lone boss takes one hit a cast.
    {
      name: 'chain stun',
      kind: 'stun',
      period: chain.cooldown * HASTE,
      hits: 1,
      durationS: chain.stunDuration,
    },
    {
      name: 'chain stagger',
      kind: 'stagger',
      period: chain.cooldown * HASTE,
      hits: 1,
      durationS: chain.staggerDuration,
    },
    {
      name: 'companion swing',
      kind: 'stagger',
      period: frenzyCooldown(companion.attackCooldown, 3) * HASTE,
      hits: 1,
      durationS: companion.staggerDuration ?? 0,
    },
    {
      name: 'sword cut',
      kind: 'stagger',
      period: BASE_SWORD_STATS.hitCooldown,
      hits: 1,
      durationS: BASE_SWORD_STATS.staggerDuration,
    },
    {
      name: 'storm cell bolt',
      kind: 'stagger',
      period: STORM_CELL.everyS / 4,
      hits: 1,
      durationS: STORM_CELL.staggerS,
    },
  ];

  /** `list` firing at `first + k * period` on a boss for `totalS` s: the longest hold and the total held. */
  function heldRun(
    list: readonly Source[],
    firsts: readonly number[],
    totalS = 60,
    kinds: readonly BossCcKind[] = ['stun', 'stagger'],
  ): { longestS: number; heldS: number } {
    let cc: BossCcState = NO_BOSS_CC;
    let stunS = 0;
    let staggerS = 0;
    const next = [...firsts];
    let longestS = 0;
    let runS = 0;
    let heldS = 0;
    for (let frame = 0; frame < Math.round(totalS / DT); frame += 1) {
      const nowS = frame * DT;
      list.forEach((source, i) => {
        while (nowS >= next[i]! - 1e-9) {
          for (let h = 0; h < source.hits; h += 1) {
            const landed = applyBossCc(cc, source.kind, source.durationS, nowS);
            cc = landed.state;
            if (source.kind === 'stun') stunS = applyStun(stunS, landed.durationS);
            else staggerS = applyStagger(staggerS, landed.durationS);
          }
          next[i]! += source.period;
        }
      });
      stunS = tickStun(stunS, DT).remainingS;
      staggerS = tickStagger(staggerS, DT).remainingS;
      const held =
        (kinds.includes('stun') && stunS > 0) || (kinds.includes('stagger') && staggerS > 0);
      if (held) {
        runS += DT;
        heldS += DT;
        longestS = Math.max(longestS, runS);
      } else {
        runS = 0;
      }
    }
    return { longestS, heldS };
  }

  it('stuns the boss no longer at a stretch than the longest single stun, and barely more in a minute', () => {
    const stuns = sources.filter((s) => s.kind === 'stun');
    const phases = [0, 0.25, 0.5, 0.75];
    let longest = 0;
    let total = 0;
    for (const a of phases) {
      for (const b of phases) {
        for (const c of phases) {
          const p = [a, b, c];
          const run = heldRun(
            stuns,
            stuns.map((s, i) => s.period * p[i]!),
            60,
            ['stun'],
          );
          longest = Math.max(longest, run.longestS);
          total = Math.max(total, run.heldS);
        }
      }
    }
    // Every stun after the first inside the 4 s window is halved again, and a
    // stun never cuts a running one short, so the first 2 s stop is the longest.
    expect(longest).toBeLessThanOrEqual(bolt.stunDuration + EPS);
    // Hits every 0.3 s keep the window open all minute: the halvings sum to a vanishing tail.
    expect(total).toBeLessThanOrEqual(bolt.stunDuration + 0.5);
  });

  it('never holds the boss in place: stun and stagger together stop it under 3 s at a stretch, 4 s in a minute', () => {
    const phases = [0, 0.5];
    let longest = 0;
    let total = 0;
    const n = sources.length;
    for (let mask = 0; mask < 2 ** n; mask += 1) {
      const firsts = sources.map((s, i) => s.period * phases[(mask >> i) & 1]!);
      const run = heldRun(sources, firsts);
      longest = Math.max(longest, run.longestS);
      total = Math.max(total, run.heldS);
    }
    expect(longest).toBeLessThan(3);
    expect(total).toBeLessThan(4);
  });

  it('lets a Thunderbolt alone stun a boss for no more than its share of the casts', () => {
    const thunder = sources.find((s) => s.name === 'thunderbolt')!;
    // 1.575 s between strikes is inside the 4 s window, so each is halved again.
    const run = heldRun([thunder], [thunder.period], 600, ['stun']);
    expect(run.longestS).toBeLessThanOrEqual(THUNDERBOLT.stunS + EPS);
    expect(run.heldS).toBeLessThan(2 * THUNDERBOLT.stunS + 0.1);
  });
});
