import type { Enemy } from '../entities/Enemy';

/**
 * Where spell damage goes. What a hit costs the run — the kill tally, the gem
 * drop — is `GameScene`'s business, so a spell reports the damage it dealt and
 * the scene applies it. Shared by every spell (Epic D); it names an entity, so
 * it lives here rather than in `core/`.
 */
export type DamageSink = (enemy: Enemy, amount: number) => void;
