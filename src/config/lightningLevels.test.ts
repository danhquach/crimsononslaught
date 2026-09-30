import { describe, expect, it } from 'vitest';
import { MAX_SEGMENTS } from '../core/chainLightning';
import { CHAIN_CYCLE_MS } from '../core/fx';
import { MAX_LIVE_BOLTS } from '../core/lightningBolt';
import { levelStatAdds } from '../core/spellLevelStats';
import { ANIMATIONS } from './animations';
import { BASE_COMPANION_STATS } from './companions';
import { ENEMY_ARCHETYPES } from './enemies';
import { MAX_LIVE_AREAS } from './fx';
import {
  COMPANION_SWEEP,
  FORK,
  MAX_LIVE_COMPANION_STRIPS,
  MAX_LIVE_STORM_BOLTS,
  MAX_LIVE_SWORD_ARC_STRIPS,
  STORM_CELL,
  SWORD_ARC,
  SWORD_HIT_WINDOW_S,
  THUNDERBOLT,
  THUNDERCLAP,
  TORNADO_SPLIT,
} from './lightningLevels';
import {
  BASE_CHAIN_LIGHTNING_STATS,
  BASE_SWORD_STATS,
  BASE_TORNADO_STATS,
} from './lightningRoster';
import { PROFILE_CLAMPS } from './passives';
import { SPELL_LEVEL_STATS } from './spellLevels';
import { BASE_SPELL_STATS } from './spells';

const HASTE = PROFILE_CLAMPS.cooldownMul?.min ?? 1;
const CYCLE_S = CHAIN_CYCLE_MS / 1000;
const clips = new Set(ANIMATIONS.map((anim) => anim.name));
/** The fastest enemy chases at this, which bounds how long a homing bolt can be kept flying. */
const FASTEST_ENEMY = Math.max(...Object.values(ENEMY_ARCHETYPES).map((enemy) => enemy.speed));

describe('Lightning level tunables (#329)', () => {
  it('keeps a positive number in every rule', () => {
    for (const rule of [
      THUNDERBOLT,
      FORK,
      TORNADO_SPLIT,
      STORM_CELL,
      COMPANION_SWEEP,
      THUNDERCLAP,
      SWORD_ARC,
      SWORD_HIT_WINDOW_S,
    ]) {
      for (const value of Object.values(rule)) {
        if (typeof value === 'number') expect(value).toBeGreaterThan(0);
      }
    }
    for (const pool of [
      MAX_LIVE_STORM_BOLTS,
      MAX_LIVE_COMPANION_STRIPS,
      MAX_LIVE_SWORD_ARC_STRIPS,
    ]) {
      expect(pool).toBeGreaterThan(0);
    }
  });

  it('reads the Haste clamp it sizes the pools against', () => {
    expect(HASTE).toBe(0.35);
  });

  it('draws every level look with a clip the atlas defines', () => {
    for (const clip of [THUNDERBOLT.strikeClip, THUNDERBOLT.impactClip, STORM_CELL.clip]) {
      expect(clips, clip).toContain(clip);
    }
  });

  it('gives whole counts to the things that are counted', () => {
    for (const n of [
      THUNDERBOLT.every,
      FORK.maxHits,
      TORNADO_SPLIT.count,
      COMPANION_SWEEP.maxTargets,
      THUNDERCLAP.jumps,
      SWORD_ARC.jumps,
    ]) {
      expect(Number.isInteger(n)).toBe(true);
    }
    expect(THUNDERBOLT.every).toBeGreaterThanOrEqual(2);
    expect(TORNADO_SPLIT.count).toBeGreaterThanOrEqual(2);
  });

  it('never lets the one fixed stun outrun the 1 s the boss can be held for', () => {
    expect(THUNDERBOLT.stunS).toBeLessThanOrEqual(1);
  });

  it('lets a fork reach past what one branch does, and no further than two full branches', () => {
    const chains =
      BASE_CHAIN_LIGHTNING_STATS.chains +
      (levelStatAdds(SPELL_LEVEL_STATS, 'lightning_chain', 3).chains ?? 0);
    expect(FORK.maxHits).toBeGreaterThan(chains + 1);
    expect(FORK.maxHits).toBeLessThanOrEqual(1 + 2 * chains);
  });

  it('gives each level 2 and 3 sword window a cut inside the gap its extra blades leave', () => {
    // 2 pi / (blades x rad/s): how often some blade passes one point of the ring.
    for (const level of [2, 3] as const) {
      const blades =
        BASE_SWORD_STATS.count +
        (levelStatAdds(SPELL_LEVEL_STATS, 'lightning_sword', level).count ?? 0);
      const gap = (2 * Math.PI) / (blades * BASE_SWORD_STATS.orbitSpeed);
      expect(SWORD_HIT_WINDOW_S[level], `level ${level}`).toBeLessThan(gap);
      expect(SWORD_HIT_WINDOW_S[level], `level ${level}`).toBeLessThan(
        BASE_SWORD_STATS.hitCooldown,
      );
    }
    // The base window already swallowed the fourth blade's cut, which is why a shorter one is needed.
    const four = (2 * Math.PI) / (4 * BASE_SWORD_STATS.orbitSpeed);
    expect(BASE_SWORD_STATS.hitCooldown).toBeGreaterThan(four);
  });

  it('pools four times the storm bolts level 3 keeps in the air at the Haste clamp', () => {
    // Funnels alive at once: a cast sends 2 every cooldown, each lasts `duration`.
    const funnels =
      TORNADO_SPLIT.count *
      Math.ceil(BASE_TORNADO_STATS.duration / (BASE_TORNADO_STATS.cooldown * HASTE));
    // A bolt is in the air at most range / (speed - the fastest enemy running away).
    const life = STORM_CELL.range / (STORM_CELL.speed - FASTEST_ENEMY);
    const perFunnel = life / STORM_CELL.everyS;
    expect(MAX_LIVE_STORM_BOLTS).toBeGreaterThanOrEqual(funnels * perFunnel * 4);
    // And with the shared area pool full of them, nothing more than the cap.
    expect(MAX_LIVE_STORM_BOLTS).toBeGreaterThanOrEqual(MAX_LIVE_AREAS * perFunnel);
  });

  it('pools four times the companion strips level 3 keeps up at the Haste clamp', () => {
    const cadence =
      BASE_COMPANION_STATS.lightning_companion.attackCooldown *
      HASTE *
      COMPANION_SWEEP.cooldownFactor;
    // A swing draws the sweep's chord and up to `jumps` Thunderclap links.
    const strips = 1 + THUNDERCLAP.jumps;
    expect(MAX_LIVE_COMPANION_STRIPS).toBeGreaterThanOrEqual(((strips * CYCLE_S) / cadence) * 4);
  });

  it('pools four times the sword arc strips level 3 keeps up, five blades at their cooldown', () => {
    const blades =
      BASE_SWORD_STATS.count + (levelStatAdds(SPELL_LEVEL_STATS, 'lightning_sword', 3).count ?? 0);
    const arcsPerS = blades / SWORD_ARC.perBladeCooldownS;
    // An arc draws blade -> first -> second: one strip a jump.
    expect(MAX_LIVE_SWORD_ARC_STRIPS).toBeGreaterThanOrEqual(
      arcsPerS * SWORD_ARC.jumps * CYCLE_S * 4,
    );
  });

  it('keeps the chain segment pool four times a forked cast at the Haste clamp', () => {
    // The lead-in plus a link per further hit is one strip a hit, `maxHits` a cast.
    const cadence = BASE_CHAIN_LIGHTNING_STATS.cooldown * HASTE;
    expect(MAX_SEGMENTS).toBeGreaterThanOrEqual(((FORK.maxHits * CYCLE_S) / cadence) * 4);
  });

  it('keeps the bolt pool four times what two bolts a cast hold in the air at the Haste clamp', () => {
    // Level 2 and 3 launch 2; a bolt flies at most 400 px (the widest `targetRange`) at 1000 px/s.
    const cadence = BASE_SPELL_STATS.lightning.cooldown * HASTE;
    const bolts =
      BASE_SPELL_STATS.lightning.strikes +
      (levelStatAdds(SPELL_LEVEL_STATS, 'lightning', 3).strikes ?? 0);
    expect(MAX_LIVE_BOLTS).toBeGreaterThanOrEqual(((bolts * 0.4) / cadence) * 4);
  });

  it('keeps the area pool four times what two tornadoes a cast keep up at the Haste clamp', () => {
    const cadence = BASE_TORNADO_STATS.cooldown * HASTE;
    const steady = (TORNADO_SPLIT.count * BASE_TORNADO_STATS.duration) / cadence;
    expect(MAX_LIVE_AREAS).toBeGreaterThanOrEqual(steady * 4);
  });
});
