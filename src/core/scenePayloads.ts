import { isSpellId, type SpellId } from '../config/spells';

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
  result: 'Result',
  textureDebug: 'TextureDebug',
} as const;

/** Registry key under which Boot stores the run seed (from `?seed=` or the clock). */
export const SEED_REGISTRY_KEY = 'seed';

/** `SpellSelect -> Game` */
export interface GamePayload {
  spellId: SpellId;
  seed: number;
}

export type Outcome = 'win' | 'lose';

/** Summary shown on the result screen (CO-014 fills in real values). */
export interface RunStats {
  timeSurvivedMs: number;
  level: number;
  kills: number;
  spellId: SpellId;
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
