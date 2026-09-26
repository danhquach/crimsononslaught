import { isSpellId, type SpellId } from '../config/spells';
import { MAX_OFFER_SIZE, isOfferCard, type OfferCard } from './levelUp';
import { isPauseAction, isPauseView, type ConfirmAction, type PauseView } from './pauseModel';

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
  intro: 'Intro',
  settings: 'Settings',
  profile: 'Profile',
  spellSelect: 'SpellSelect',
  game: 'Game',
  hud: 'Hud',
  levelUp: 'LevelUp',
  pause: 'Pause',
  result: 'Result',
  upgrades: 'Upgrades',
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

/** `?startAt=` in ms (#127), resolved in Boot; Game starts its run clock there. */
export const START_AT_REGISTRY_KEY = 'startAt';

/**
 * Registry key under which Boot stores the extra actives of the `?loadout=`
 * test hook (default none). Like `?timeScale=` it is a hook, not part of the
 * run, so it travels in the registry rather than the `Game` payload.
 */
export const LOADOUT_REGISTRY_KEY = 'loadout';

/**
 * Registry key under which Boot stores the parsed `Save` (CO-101). Game reads
 * the upgrades from it at `create`; Result writes the finished run back; the
 * Upgrades screen spends from it. Always a valid `Save`, never raw JSON.
 */
export const SAVE_REGISTRY_KEY = 'save';

/** Registry flag Boot sets when the stored save was unreadable and reset, so Intro can say so once. */
export const SAVE_RESET_REGISTRY_KEY = 'saveReset';

/** Registry key under which Boot stores the game's `Audio` (CO-102); scenes reach it through `render/audio.ts#audioOf`. */
export const AUDIO_REGISTRY_KEY = 'audio';

/** `SpellSelect -> Game` */
export interface GamePayload {
  spellId: SpellId;
  seed: number;
}

/** `Game -> LevelUp` (launched over the paused Game). Never empty: Game handles the empty-offer path itself. */
export interface LevelUpPayload {
  offer: readonly OfferCard[];
}

/**
 * `Game -> Pause` (launched over the paused Game, #252). With `confirm` the
 * screen asks about that action instead of showing the menu; it restarts
 * itself with it rather than swapping its menu in place.
 */
export interface PausePayload {
  view: PauseView;
  confirm?: ConfirmAction;
}

/** `ended`: the player ended the run from the pause screen (#252), keeping what it earned. */
export type Outcome = 'win' | 'lose' | 'ended';

const OUTCOMES: readonly string[] = ['win', 'lose', 'ended'] satisfies Outcome[];

/** Summary shown on the result screen (see `core/resultModel.ts`). CO-030's RunState supplies real values. */
export interface RunStats {
  timeSurvivedMs: number;
  level: number;
  kills: number;
  spellId: SpellId;
  /** Display names of the perks taken, in pick order; a perk taken at several ranks repeats. */
  perks: readonly string[];
  /** Embers collected (#195): what the run banks, win or lose. */
  embers: number;
  /** Consumables and relics picked up (#195); their effects are later tickets'. */
  consumables: number;
  relics: number;
}

/** `Game -> Result` */
export interface ResultPayload {
  outcome: Outcome;
  stats: RunStats;
  /** Currency this run paid out (CO-101), already added to the save: its `stats.embers` (#195). */
  earned: number;
  /** The save's balance after `earned` was added. */
  balance: number;
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
    data.offer.every(isOfferCard)
  );
}

export function isPausePayload(data: unknown): data is PausePayload {
  return (
    isRecord(data) &&
    isPauseView(data.view) &&
    (data.confirm === undefined || (isPauseAction(data.confirm) && data.confirm !== 'resume'))
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
    data.perks.every((p) => typeof p === 'string') &&
    isFiniteNumber(data.embers) &&
    isFiniteNumber(data.consumables) &&
    isFiniteNumber(data.relics)
  );
}

export function isResultPayload(data: unknown): data is ResultPayload {
  return (
    isRecord(data) &&
    typeof data.outcome === 'string' &&
    OUTCOMES.includes(data.outcome) &&
    isRunStats(data.stats) &&
    isFiniteNumber(data.earned) &&
    isFiniteNumber(data.balance)
  );
}
