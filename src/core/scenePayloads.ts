import { ROSTER_SPELL_IDS, isRosterSpellId, type RosterSpellId } from '../config/loadout';
import { PASSIVES, isPassiveId, type PassiveId } from '../config/passives';
import { RELIC_BUFFS, isRelicBuffId, type RelicBuffId } from '../config/relics';
import { isSpellLevel, type SpellLevel } from '../config/spellLevels';
import { isSpellId, type SpellId } from '../config/spells';
import { MAX_OFFER_SIZE, isOfferCard, type OfferCard } from './levelUp';
import type { OfferActionCounts } from './offerActions';
import {
  isPauseAction,
  isPauseView,
  needsConfirm,
  type ConfirmAction,
  type PauseView,
} from './pauseModel';

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
  help: 'Help',
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

/** `?enemies=` (#126), resolved in Boot: the only types Game lets spawn; empty is all. */
export const ENEMIES_REGISTRY_KEY = 'enemies';

/**
 * Registry key under which Boot stores the extra actives of the `?loadout=`
 * test hook (default none). Like `?timeScale=` it is a hook, not part of the
 * run, so it travels in the registry rather than the `Game` payload.
 */
export const LOADOUT_REGISTRY_KEY = 'loadout';

/**
 * Registry key under which Boot stores the spell levels of the `?loadout=` test
 * hook (#326) as `[spell id, level]` pairs (default none). A key of its own, so
 * `LOADOUT_REGISTRY_KEY` keeps its plain list of ids.
 */
export const LOADOUT_LEVELS_REGISTRY_KEY = 'loadoutLevels';

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

/**
 * `Game -> LevelUp` (launched over the paused Game). Never empty: Game handles
 * the empty-offer path itself. `actions` is a level-up's Reroll and Ban counts
 * (#228), which put the Reroll, Skip and Ban buttons on the overlay; a relic's
 * offer has none.
 */
export interface LevelUpPayload {
  offer: readonly OfferCard[];
  actions?: OfferActionCounts;
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

/**
 * `Pause -> Settings` (CO-192): the pause view Settings hands back to Pause on
 * Back, so the run's build reads the same as before. Left out, as from the
 * main menu, Back returns to Intro.
 */
export interface SettingsPayload {
  pause: PausePayload;
}

/** What the Help screen shows (#226): a tab, or the About tab's feedback form. */
export const HELP_VIEWS = ['pickups', 'spells', 'about', 'feedback'] as const;

export type HelpView = (typeof HELP_VIEWS)[number];

/** `Intro -> Help`, and Help restarting itself on another view. Left out, Help opens on Pickups. */
export interface HelpPayload {
  view: HelpView;
  /** Which Spells page (#328), 0-based; left out, the first. The scene clamps it to the pages there are. */
  spellPage?: number;
}

/** No table has anywhere near this many Spells pages; a larger `spellPage` is not one the scene sent. */
export const MAX_SPELL_PAGE = 64;

/** `ended`: the player ended the run from the pause screen (#252), keeping what it earned. */
export type Outcome = 'win' | 'lose' | 'ended';

const OUTCOMES: readonly string[] = ['win', 'lose', 'ended'] satisfies Outcome[];

/** Summary shown on the result screen (see `core/resultModel.ts`). CO-030's RunState supplies real values. */
export interface RunStats {
  timeSurvivedMs: number;
  level: number;
  kills: number;
  spellId: SpellId;
  /** Embers collected (#195): what the run banks, win or lose. */
  embers: number;
  /** Consumables and relics picked up (#195); their effects are later tickets'. */
  consumables: number;
  relics: number;
}

/** An equipped spell as the result screen draws it: the id picks the icon art, the colour its fallback disc. */
export interface BuildSpell {
  id: RosterSpellId;
  name: string;
  color: number;
  /** #326: the spell's level, 1 to 3, for the badge on its icon and the info line. */
  level: SpellLevel;
}

/**
 * The run's build at its end (#290), the same one the pause screen shows:
 * equipped spells in equip order, and `[id, count]` pairs in the order taken,
 * where count is a passive's rank or a relic buff's stacks.
 */
export interface RunBuild {
  spells: readonly BuildSpell[];
  passives: readonly (readonly [PassiveId, number])[];
  relics: readonly (readonly [RelicBuffId, number])[];
}

/** `Game -> Result` */
export interface ResultPayload {
  outcome: Outcome;
  stats: RunStats;
  build: RunBuild;
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
    data.offer.every(isOfferCard) &&
    (data.actions === undefined || isActionCounts(data.actions))
  );
}

function isActionCounts(data: unknown): data is OfferActionCounts {
  const isCount = (v: unknown): boolean => Number.isInteger(v) && (v as number) >= 0;
  return isRecord(data) && isCount(data.rerolls) && isCount(data.bans);
}

export function isPausePayload(data: unknown): data is PausePayload {
  return (
    isRecord(data) &&
    isPauseView(data.view) &&
    (data.confirm === undefined || (isPauseAction(data.confirm) && needsConfirm(data.confirm)))
  );
}

/** `pause` must be the plain menu view: a confirmation is never what Settings returns to. */
export function isSettingsPayload(data: unknown): data is SettingsPayload {
  return isRecord(data) && isPausePayload(data.pause) && data.pause.confirm === undefined;
}

export function isHelpPayload(data: unknown): data is HelpPayload {
  return (
    isRecord(data) &&
    (HELP_VIEWS as readonly unknown[]).includes(data.view) &&
    (data.spellPage === undefined ||
      (Number.isInteger(data.spellPage) &&
        (data.spellPage as number) >= 0 &&
        (data.spellPage as number) <= MAX_SPELL_PAGE))
  );
}

export function isRunStats(data: unknown): data is RunStats {
  return (
    isRecord(data) &&
    isFiniteNumber(data.timeSurvivedMs) &&
    isFiniteNumber(data.level) &&
    isFiniteNumber(data.kills) &&
    isSpellId(data.spellId) &&
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
    isRunBuild(data.build) &&
    isFiniteNumber(data.earned) &&
    isFiniteNumber(data.balance)
  );
}

/** A rank or a stack count the result screen will draw: a whole number from 1 up to this. */
export const MAX_BUILD_COUNT = 999;
/**
 * A spell name is a card's, or its id when Game has no card for it: ASCII
 * letters, digits, spaces, apostrophes, hyphens and underscores, nothing else.
 */
const SPELL_NAME = /^[A-Za-z0-9 '_-]{1,40}$/;

function isBuildSpell(data: unknown): data is BuildSpell {
  return (
    isRecord(data) &&
    isRosterSpellId(data.id) &&
    typeof data.name === 'string' &&
    SPELL_NAME.test(data.name) &&
    Number.isInteger(data.color) &&
    (data.color as number) >= 0 &&
    (data.color as number) <= 0xffffff &&
    isSpellLevel(data.level)
  );
}

/**
 * `[id, count]` pairs whose ids pass `isId`, each id once, with a whole-number
 * count from 1 to `MAX_BUILD_COUNT`. The length check comes first, so a huge
 * array is turned away before any of it is read.
 */
function isCountPairs(data: unknown, isId: (v: unknown) => boolean, maxLength: number): boolean {
  if (!Array.isArray(data) || data.length > maxLength) return false;
  const seen = new Set<unknown>();
  return data.every((pair) => {
    if (!Array.isArray(pair) || pair.length !== 2) return false;
    const [id, count] = pair as unknown[];
    if (!isId(id) || seen.has(id)) return false;
    seen.add(id);
    return (
      Number.isInteger(count) && (count as number) >= 1 && (count as number) <= MAX_BUILD_COUNT
    );
  });
}

/** An allow-list check: every id is one this build knows, and nothing repeats. */
export function isRunBuild(data: unknown): data is RunBuild {
  if (!isRecord(data)) return false;
  const { spells } = data;
  if (!Array.isArray(spells) || spells.length > ROSTER_SPELL_IDS.length) return false;
  const spellIds = new Set<unknown>();
  for (const spell of spells) {
    if (!isBuildSpell(spell) || spellIds.has(spell.id)) return false;
    spellIds.add(spell.id);
  }
  return (
    isCountPairs(data.passives, isPassiveId, PASSIVES.length) &&
    isCountPairs(data.relics, isRelicBuffId, RELIC_BUFFS.length)
  );
}
