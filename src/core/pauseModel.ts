import { CURRENCY_NAME } from '../config/meta';
import { passiveById, type PassiveId } from '../config/passives';
import { relicBuffById, type RelicBuffId } from '../config/relics';
import { formatTimer } from './hudModel';

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
}

/** What the pause screen shows, fixed at the moment Game paused. */
export interface PauseView {
  /** The run's level; spells have no level of their own. */
  level: number;
  /** The equipped spells in equip order; the id picks the icon art, the colour its fallback disc. */
  spells: readonly PauseSpell[];
  /** Passives in the order taken. */
  passives: readonly PauseItem[];
  /** Relic buffs in the order picked. */
  relics: readonly PauseItem[];
  stats: { kills: number; embers: number; elapsedMs: number };
}

/** An equipped spell; the info line reads its name and description (CO-179). */
export interface PauseSpell {
  id: string;
  name: string;
  color: number;
  description: string;
}

export interface PauseBuild {
  level: number;
  /** The result screen's build (#290) carries no descriptions; it has no info line. */
  spells: readonly (Omit<PauseSpell, 'description'> & { description?: string })[];
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

function item(id: string, name: string, description: string, count: number): PauseItem {
  return { id, name, abbr: abbreviate(name), description, count };
}

/**
 * The build Game hands the pause screen. Map order is pick order; an id this
 * build has no name for shows as the id.
 */
export function pauseView(build: PauseBuild): PauseView {
  return {
    level: build.level,
    spells: build.spells.map(({ id, name, color, description = '' }) => ({
      id,
      name,
      color,
      description,
    })),
    passives: [...build.passives].map(([id, rank]) => {
      const passive = passiveById(id);
      return item(id, passive?.name ?? id, passive?.description ?? '', rank);
    }),
    relics: [...build.relics].map(([id, stacks]) => {
      const buff = relicBuffById(id);
      return item(id, buff?.name ?? id, buff?.description ?? '', stacks);
    }),
    stats: { kills: build.kills, embers: build.embers, elapsedMs: build.elapsedMs },
  };
}

/** Placeholder for a strip with nothing in it yet. */
export const EMPTY_STRIP_TEXT = 'None yet';

/** The line under the strips: `Kills 312  ·  Embers 48  ·  4:12`. */
export function statsLine(view: Readonly<PauseView>): string {
  const { kills, embers, elapsedMs } = view.stats;
  return `Kills ${kills}  ·  ${CURRENCY_NAME} ${embers}  ·  ${formatTimer(elapsedMs)}`;
}

/**
 * The info line for a pointed-at or selected tile: `Power ×2  —  Every spell
 * deals 10% more damage.` A spell has no count of its own, so it reads its
 * name and description alone.
 */
export function itemInfo(tile: Readonly<PauseItem | PauseSpell>): string {
  const head = 'count' in tile ? `${tile.name} ×${tile.count}` : tile.name;
  return tile.description ? `${head}  —  ${tile.description}` : head;
}

/** The pause menu's buttons, in display order; Resume is first so a reflex Enter is safe. */
export const PAUSE_ACTIONS = ['resume', 'restart', 'end', 'menu'] as const;
export type PauseAction = (typeof PAUSE_ACTIONS)[number];

/** Every action that throws the run away (or ends it) asks first. */
export type ConfirmAction = Exclude<PauseAction, 'resume'>;

export function needsConfirm(action: PauseAction): action is ConfirmAction {
  return action !== 'resume';
}

export function isPauseAction(value: unknown): value is PauseAction {
  return typeof value === 'string' && (PAUSE_ACTIONS as readonly string[]).includes(value);
}

export const PAUSE_LABELS: Readonly<Record<PauseAction, string>> = {
  resume: 'Resume',
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

/** A confirmed choice; Resume never travels, the pause screen resumes Game itself. */
export interface PauseChoosePayload {
  action: ConfirmAction;
}

const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function isPauseItem(v: unknown): boolean {
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.abbr === 'string' &&
    typeof v.description === 'string' &&
    isCount(v.count)
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
        typeof s.description === 'string',
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
