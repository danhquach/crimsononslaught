/**
 * Every animation in the atlas, as pure data (spec §6, CO-080).
 *
 * No Phaser import, so this is unit-tested against the generated `frames.ts`
 * and the sheet manifest. `BootScene` walks this list once and registers each
 * entry with the animation manager; nothing else needs to know frame names.
 *
 * Frame order is explicit rather than a column range because a sheet's drawing
 * order is not always its playing order — the swarm's spawn has the hole it
 * climbs out of drawn in the last cell.
 */

import type { TextureKey } from './colors';
import type { FrameName } from './frames';

export interface AnimationSpec {
  /** Animation key, matching the frame prefix, e.g. `hero.walk.down`. */
  name: string;
  /** Atlas frames in play order. */
  frames: FrameName[];
  frameRate: number;
  /** -1 loops forever, 0 plays once and stops on the last frame. */
  repeat: number;
}

/**
 * `count` frames of `name`, numbered from 0, in drawn order. `order` overrides
 * that with explicit frame indices where the sheet was drawn out of sequence.
 */
function spec(
  name: string,
  count: number,
  frameRate: number,
  repeat: number,
  order?: number[],
): AnimationSpec {
  const indices = order ?? Array.from({ length: count }, (_, i) => i);
  return {
    name,
    frames: indices.map((i) => `${name}.${i}` as FrameName),
    frameRate,
    repeat,
  };
}

const LOOP = -1;
const ONCE = 0;

const FACINGS = ['down', 'up', 'left', 'right'] as const;

/** The same animation in all four facings, which every character sheet has. */
function facings(
  prefix: string,
  count: number,
  frameRate: number,
  repeat: number,
): AnimationSpec[] {
  return FACINGS.map((f) => spec(`${prefix}.${f}`, count, frameRate, repeat));
}

export const ANIMATIONS: readonly AnimationSpec[] = [
  // Hero (CO-070). Every facing is drawn, including right: the prompts asked
  // for it explicitly so the staff stays in the same hand, which a mirrored
  // frame would not do.
  ...facings('hero.idle', 2, 4, LOOP),
  ...facings('hero.walk', 4, 8, LOOP),
  ...facings('hero.hurt', 1, 10, ONCE),
  spec('hero.death', 6, 8, ONCE),

  // Swarm enemy (CO-071). Spawn is drawn hole-last, so it plays 3, 0, 1, 2.
  spec('swarm.move', 4, 8, LOOP),
  spec('swarm.hurt', 1, 10, ONCE),
  spec('swarm.death', 4, 12, ONCE),
  spec('swarm.spawn', 4, 10, ONCE, [3, 0, 1, 2]),

  // Fast enemy (CO-072), authored facing up; the engine rotates it.
  spec('fast.move', 4, 12, LOOP),
  spec('fast.hurt', 1, 10, ONCE),
  spec('fast.death', 4, 12, ONCE),
  spec('fast.spawn', 4, 12, ONCE),

  // Tank enemy (CO-073).
  ...facings('tank.walk', 4, 6, LOOP),
  ...facings('tank.hurt', 1, 10, ONCE),
  spec('tank.death', 6, 8, ONCE),
  spec('tank.spawn', 4, 8, ONCE),

  // Boss (CO-074). Telegraph and charge are paced to the 0.8 s / 0.6 s phases
  // in `boss.ts`, so the art lands with the state change rather than drifting.
  ...facings('boss.walk', 4, 6, LOOP),
  ...facings('boss.telegraph', 2, 2.5, LOOP),
  ...facings('boss.charge', 2, 3.3, LOOP),
  ...facings('boss.hurt', 1, 10, ONCE),
  spec('boss.death', 8, 8, ONCE),

  // XP gem (CO-075).
  spec('gem.idle', 4, 6, LOOP),
  spec('gem.drift', 2, 8, LOOP),
  spec('gem.pickup', 4, 15, ONCE),

  // Fire spell (CO-076).
  spec('fire.fly', 4, 12, LOOP),
  spec('fire.spawn', 4, 15, ONCE),
  spec('fire.explode', 6, 15, ONCE),
  spec('fire.burn', 4, 8, LOOP),
  spec('fire.burnBig', 4, 8, LOOP),

  // Ice spell (CO-077).
  spec('ice.nova', 6, 15, ONCE),
  spec('ice.slow', 4, 6, LOOP),
  spec('ice.freeze', 3, 6, ONCE),
  spec('ice.shatter', 5, 12, ONCE),

  // Lightning spell (CO-078).
  spec('lightning.strike', 4, 20, ONCE),
  spec('lightning.impact', 4, 20, ONCE),
  spec('lightning.chain', 4, 20, LOOP),
  spec('lightning.stun', 4, 10, LOOP),

  // Earth spell (CO-079).
  spec('earth.spin', 6, 12, LOOP),
  spec('earth.impact', 5, 15, ONCE),
  spec('earth.dust', 5, 12, ONCE),
];

/**
 * The still frame each existing texture key now resolves to.
 *
 * Entities ask for a `TextureKey` and anything that draws a static image keeps
 * working unchanged (spec §6): the key maps to the first idle or move frame of
 * the matching object instead of to a generated placeholder.
 */
export const STATIC_FRAMES: Readonly<Record<TextureKey, FrameName>> = {
  player: 'hero.idle.down.0',
  enemy_swarm: 'swarm.move.0',
  enemy_fast: 'fast.move.0',
  enemy_tank: 'tank.walk.down.0',
  boss: 'boss.walk.down.0',
  gem: 'gem.idle.0',
  proj_fire: 'fire.fly.0',
  fx_nova: 'ice.nova.0',
  // The chain segment, not the strike: this is the piece the engine stretches
  // between two enemies.
  fx_bolt: 'lightning.chain.0',
  boulder: 'earth.spin.0',
};
