import type { HitKind } from '../core/hitFeedback';
import type { Enemy } from '../entities/Enemy';

/**
 * Where spell damage goes. What a hit costs the run — the kill tally, the gem
 * drop — is `GameScene`'s business, so a spell reports the damage it dealt and
 * the scene applies it. Shared by every spell (Epic D); it names an entity, so
 * it lives here rather than in `core/`.
 *
 * `kind` says how the damage arrived (#125): a spell's own hit is a `hit`,
 * which may crit; a periodic pulse passes `tick`, which never does.
 */
export type DamageSink = (enemy: Enemy, amount: number, kind?: HitKind) => void;
