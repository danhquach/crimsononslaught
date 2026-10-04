import type { HitKind } from '../core/hitFeedback';
import type { Vec2 } from '../core/input';
import type { Enemy } from '../entities/Enemy';

/**
 * Where spell damage goes. What a hit costs the run — the kill tally, the gem
 * drop — is `GameScene`'s business, so a spell reports the damage it dealt and
 * the scene applies it. Shared by every spell (Epic D); it names an entity, so
 * it lives here rather than in `core/`.
 *
 * `kind` says how the damage arrived (#125): a spell's own hit is a `hit`,
 * which may crit; a periodic pulse passes `tick`, which never does.
 *
 * `from` says where the hit came from (#126), which a shielded enemy's front
 * blocks: a shot's or a body's own position, a blast's or an area's centre, the
 * previous link of a chain, the player for what leaves the player. A hit with
 * no `from` has no direction and is never blocked.
 *
 * `afflicted` (CO-234) is whether the enemy was under a status before this hit.
 * Exploit reads it; a spell that applies its own status before it deals the
 * damage snapshots `enemy.isAfflicted` first and passes it, so a hit never
 * earns the bonus off the status it applies itself. Absent, it is read live.
 */
export type DamageSink = (
  enemy: Enemy,
  amount: number,
  kind?: HitKind,
  from?: Readonly<Vec2>,
  afflicted?: boolean,
) => void;
