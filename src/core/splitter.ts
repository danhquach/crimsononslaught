import type { EnemyType } from '../config/enemies';
import type { Vec2, WaveScale } from './enemy';

/**
 * The splitter's split (#126), apart from the engine: where its children land
 * and what happens to a split the arena has no room for.
 *
 * No RNG: the children always ring the death spot the same way, so a seed that
 * kills the same splitter replays the same children.
 *
 * Pure TS, no Phaser import. The tunables live in `config/enemies.ts`.
 */

/** A split owed: the children to spawn, where, and at the dead splitter's wave scale. */
export interface Split {
  readonly type: EnemyType;
  readonly at: Readonly<Vec2>;
  readonly count: number;
  readonly spread: number;
  readonly scale: Readonly<WaveScale>;
  /** CO-231: the splitter was a boss's pack member, so its children join the pack. */
  readonly summoned?: boolean;
}

/**
 * Where `count` children land round `at`: evenly on a ring of `spread` px,
 * the first straight up. One child lands on the spot itself.
 */
export function splitSpawns(at: Readonly<Vec2>, count: number, spread: number): Vec2[] {
  if (count <= 0) return [];
  if (count === 1) return [{ x: at.x, y: at.y }];
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (i / count) * Math.PI * 2;
    return { x: at.x + Math.cos(angle) * spread, y: at.y + Math.sin(angle) * spread };
  });
}

/**
 * Spawn every child the queued splits owe, in order, through `spawn`, which
 * answers whether the child landed. One that does not (the live cap, or the
 * boss's pack cap for a summoned splitter's, is reached) is dropped, not
 * retried: a crowd at the cap cannot be made bigger by killing splitters in
 * it. The queue is emptied either way.
 */
export function flushSplits(
  queue: Split[],
  spawn: (
    type: EnemyType,
    at: Readonly<Vec2>,
    scale: Readonly<WaveScale>,
    summoned: boolean,
  ) => boolean,
): { spawned: number; dropped: number } {
  let spawned = 0;
  let dropped = 0;
  for (const split of queue.splice(0)) {
    for (const at of splitSpawns(split.at, split.count, split.spread)) {
      if (spawn(split.type, at, split.scale, split.summoned ?? false)) spawned++;
      else dropped++;
    }
  }
  return { spawned, dropped };
}
