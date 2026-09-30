import { CURRENCY_NAME } from '../config/meta';
import { passiveById, type PassiveId } from '../config/passives';
import { relicBuffById, type RelicBuffId } from '../config/relics';
import { MAX_SPELL_LEVEL, isSpellLevel } from '../config/spellLevels';
import { formatTimer } from './hudModel';
import { isMaxed, levelFraction, rankFraction } from './maxRank';

/**
 * View-model behind the pause screen (#252): the run's build as it stands, and
 * the actions the screen offers. Pure TS, unit-tested; `PauseScene` only lays
 * it out, as the hero on a stand beside framed strips of spell icons, passive
 * tiles and relic gems. The build is this run's alone — the permanent upgrades
 * bought in the shop are left out on purpose.
 */

/** A passive or relic buff as a tile: `count` is a passive's rank, a relic's stacks. */
export interface PauseItem {
  /** Picks the tile's icon art (CO-179). */
  id: string;
  name: string;
  /** Two letters for the tile face when its icon art is missing. Spells use their own glyph. */
  abbr: string;
  description: string;
  count: number;
  /** CO-197: the rank cap of a capped passive; absent on an uncapped one and on every relic. */
  maxRank?: number;
  /** At its cap, so its badge reads MAX in gold. */
  maxed: boolean;
}

/** What the pause screen shows, fixed at the moment Game paused. */
export interface PauseView {
  /** The run's level; each spell in `spells` has a level of its own (#326). */
  level: number;
  /** The equipped spells in equip order; the id picks the icon art, the colour its fallback disc. */
  spells: readonly PauseSpell[];
  /** Passives in the order taken. */
  passives: readonly PauseItem[];
  /** Relic buffs in the order picked. */
  relics: readonly PauseItem[];
  stats: { kills: number; embers: number; elapsedMs: number };
}

/**
 * An equipped spell; the info line reads its name, level and description
 * (CO-179, #326). `maxed` is the level at `maxLevel`, so its badge reads MAX in gold.
 */
export interface PauseSpell {
  id: string;
  name: string;
  color: number;
  description: string;
  level: number;
  maxLevel: number;
  maxed: boolean;
}

export interface PauseBuild {
  level: number;
  /** The result screen's build (#290) carries no descriptions; `resultView` looks them up (CO-198). */
  spells: readonly (Pick<PauseSpell, 'id' | 'name' | 'color' | 'level'> & {
    description?: string;
  })[];
  passives: ReadonlyMap<PassiveId, number>;
  relics: ReadonlyMap<RelicBuffId, number>;
  kills: number;
  embers: number;
  elapsedMs: number;
}

/** A tile's face: the initials of a name of two words or more, else its first two letters. */
export function abbreviate(name: string): string {
  const [first = '', second] = name.split(/\s+/).filter((word) => word.length > 0);
  if (second) return (first.charAt(0) + second.charAt(0)).toUpperCase();
  return first.charAt(0).toUpperCase() + first.charAt(1).toLowerCase();
}

function item(
  id: string,
  name: string,
  description: string,
  count: number,
  maxRank?: number,
): PauseItem {
  const tile: PauseItem = {
    id,
    name,
    abbr: abbreviate(name),
    description,
    count,
    maxed: isMaxed(count, maxRank),
  };
  if (maxRank !== undefined) tile.maxRank = maxRank;
  return tile;
}

/**
 * The build Game hands the pause screen. Map order is pick order; an id this
 * build has no name for shows as the id.
 */
export function pauseView(build: PauseBuild): PauseView {
  return {
    level: build.level,
    spells: build.spells.map(({ id, name, color, level, description = '' }) => ({
      id,
      name,
      color,
      description,
      level,
      maxLevel: MAX_SPELL_LEVEL,
      maxed: isMaxed(level, MAX_SPELL_LEVEL),
    })),
    passives: [...build.passives].map(([id, rank]) => {
      const passive = passiveById(id);
      return item(id, passive?.name ?? id, passive?.description ?? '', rank, passive?.maxRank);
    }),
    relics: [...build.relics].map(([id, stacks]) => {
      const buff = relicBuffById(id);
      return item(id, buff?.name ?? id, buff?.description ?? '', stacks);
    }),
    stats: { kills: build.kills, embers: build.embers, elapsedMs: build.elapsedMs },
  };
}

/** The info line while nothing is pointed at or selected; the result screen reads it too (CO-198). */
export const INFO_HINT = 'Point at a spell, passive or relic, or reach it with the arrows or a pad';

/** Placeholder for a strip with nothing in it yet. */
export const EMPTY_STRIP_TEXT = 'None yet';

/** The line under the strips: `Kills 312  ·  Embers 48  ·  4:12`. */
export function statsLine(view: Readonly<PauseView>): string {
  const { kills, embers, elapsedMs } = view.stats;
  return `Kills ${kills}  ·  ${CURRENCY_NAME} ${embers}  ·  ${formatTimer(elapsedMs)}`;
}

/**
 * The info line for a pointed-at or selected tile: `Power ×2  —  Every spell
 * deals 10% more damage.` A capped passive shows its cap, `Swift  3/5` and
 * `Swift  5/5 (max)` (CO-197). A spell reads its level the same way, `Lightning
 * Sword  Lv 2/3  —  …` (#326).
 */
export function itemInfo(
  tile: Readonly<Pick<PauseItem, 'name' | 'description' | 'count' | 'maxRank'> | PauseSpell>,
): string {
  let head = tile.name;
  if ('level' in tile) head += `  ${levelFraction(tile.level, tile.maxLevel)}`;
  else if ('count' in tile) {
    head += tile.maxRank === undefined ? ' ' : '  ';
    head += rankFraction(tile.count, tile.maxRank);
  }
  return tile.description ? `${head}  —  ${tile.description}` : head;
}

/** The pause menu's buttons, in display order; Resume is first so a reflex Enter is safe. */
export const PAUSE_ACTIONS = ['resume', 'settings', 'restart', 'end', 'menu'] as const;
export type PauseAction = (typeof PAUSE_ACTIONS)[number];

/**
 * Every action that throws the run away (or ends it) asks first. Resume and
 * Settings keep the run, so they do not (CO-192).
 */
export type ConfirmAction = Exclude<PauseAction, 'resume' | 'settings'>;

export function needsConfirm(action: PauseAction): action is ConfirmAction {
  return action !== 'resume' && action !== 'settings';
}

export function isPauseAction(value: unknown): value is PauseAction {
  return typeof value === 'string' && (PAUSE_ACTIONS as readonly string[]).includes(value);
}

export const PAUSE_LABELS: Readonly<Record<PauseAction, string>> = {
  resume: 'Resume',
  settings: 'Settings',
  restart: 'Restart',
  end: 'End run',
  menu: 'Main menu',
};

/**
 * The question each confirmation asks. Restart and Main menu abandon the run:
 * no Result screen and nothing banked, which is what End run is for.
 */
export const CONFIRM_PROMPTS: Readonly<
  Record<ConfirmAction, { question: string; detail: string }>
> = {
  restart: {
    question: 'Restart the run?',
    detail: `This run is abandoned: its progress and ${CURRENCY_NAME} are lost.`,
  },
  end: {
    question: 'End the run now?',
    detail: `Go to the results and bank the ${CURRENCY_NAME} collected so far.`,
  },
  menu: {
    question: 'Leave for the main menu?',
    detail: `This run is abandoned: its progress and ${CURRENCY_NAME} are lost.`,
  },
};

/** Emitter event names for the pause screen -> Game direction, namespaced like `levelup:*`. */
export const PAUSE_EVENT = {
  choose: 'pause:choose',
} as const;

/** A confirmed choice; Resume and Settings never travel, the pause screen handles them itself. */
export interface PauseChoosePayload {
  action: ConfirmAction;
}

const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** A rank cap of one or more that `count` has not passed. */
const isCapFor = (cap: unknown, count: number): boolean =>
  Number.isInteger(cap) && (cap as number) >= 1 && count <= (cap as number);

function isPauseItem(v: unknown): boolean {
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.abbr === 'string' &&
    typeof v.description === 'string' &&
    isCount(v.count) &&
    (v.maxRank === undefined || isCapFor(v.maxRank, v.count)) &&
    v.maxed === isMaxed(v.count, v.maxRank as number | undefined)
  );
}

export function isPauseView(data: unknown): data is PauseView {
  if (!isRecord(data)) return false;
  const { stats } = data;
  return (
    isCount(data.level) &&
    Array.isArray(data.spells) &&
    data.spells.every(
      (s) =>
        isRecord(s) &&
        typeof s.id === 'string' &&
        typeof s.name === 'string' &&
        typeof s.color === 'number' &&
        typeof s.description === 'string' &&
        isSpellLevel(s.level) &&
        s.maxLevel === MAX_SPELL_LEVEL &&
        s.maxed === s.level >= MAX_SPELL_LEVEL,
    ) &&
    Array.isArray(data.passives) &&
    data.passives.every(isPauseItem) &&
    Array.isArray(data.relics) &&
    data.relics.every(isPauseItem) &&
    isRecord(stats) &&
    isCount(stats.kills) &&
    isCount(stats.embers) &&
    typeof stats.elapsedMs === 'number' &&
    Number.isFinite(stats.elapsedMs)
  );
}
