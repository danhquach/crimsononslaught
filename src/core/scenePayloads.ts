import { isSpellId, type SpellId } from '../config/spells';
import { MAX_OFFER_SIZE, isPerkCard, type PerkCard } from './levelUp';

/**
 * Typed payloads carried across scene transitions (spec §7: transitions always
 * carry a full payload; `Result` falls back to `SpellSelect` when it is missing).
 *
 * Phaser hands `scene.start(key, data)` to `init(data)` untyped, so each scene
 * validates with the guard here before trusting the shape. Pure TS, no Phaser.
 */

/** Scene keys, so transitions never rely on string literals scattered across scenes. */
export const SCENE = {
  boot: 'Boot',
  spellSelect: 'SpellSelect',
  game: 'Game',
  hud: 'Hud',
  levelUp: 'LevelUp',
  result: 'Result',
  textureDebug: 'TextureDebug',
  collisionDebug: 'CollisionDebug',
} as const;

/** Registry key under which Boot stores the run seed (from `?seed=` or the clock). */
export const SEED_REGISTRY_KEY = 'seed';

/**
 * Registry key under which Boot stores the run clock multiplier (from
 * `?timeScale=`, default 1). It is a test hook rather than part of the run, so
 * it travels in the registry instead of the `Game` payload.
 */
export const TIME_SCALE_REGISTRY_KEY = 'timeScale';

/** Registry key under which Boot stores the `?invulnerable=1` test hook (default false). */
export const INVULNERABLE_REGISTRY_KEY = 'invulnerable';

/** `SpellSelect -> Game` */
export interface GamePayload {
  spellId: SpellId;
  seed: number;
}

/** `Game -> LevelUp` (launched over the paused Game). Never empty: Game handles the zero-perk path itself. */
export interface LevelUpPayload {
  offer: readonly PerkCard[];
}

export type Outcome = 'win' | 'lose';

/** Summary shown on the result screen (see `core/resultModel.ts`). CO-030's RunState supplies real values. */
export interface RunStats {
  timeSurvivedMs: number;
  level: number;
  kills: number;
  spellId: SpellId;
  /** Display names of the perks taken, in pick order; a perk taken at several ranks repeats. */
  perks: readonly string[];
}

/** `Game -> Result` */
export interface ResultPayload {
  outcome: Outcome;
  stats: RunStats;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function isGamePayload(data: unknown): data is GamePayload {
  return isRecord(data) && isSpellId(data.spellId) && Number.isInteger(data.seed);
}

export function isLevelUpPayload(data: unknown): data is LevelUpPayload {
  return (
    isRecord(data) &&
    Array.isArray(data.offer) &&
    data.offer.length >= 1 &&
    data.offer.length <= MAX_OFFER_SIZE &&
    data.offer.every(isPerkCard)
  );
}

export function isRunStats(data: unknown): data is RunStats {
  return (
    isRecord(data) &&
    isFiniteNumber(data.timeSurvivedMs) &&
    isFiniteNumber(data.level) &&
    isFiniteNumber(data.kills) &&
    isSpellId(data.spellId) &&
    Array.isArray(data.perks) &&
    data.perks.every((p) => typeof p === 'string')
  );
}

export function isResultPayload(data: unknown): data is ResultPayload {
  return (
    isRecord(data) && (data.outcome === 'win' || data.outcome === 'lose') && isRunStats(data.stats)
  );
}
