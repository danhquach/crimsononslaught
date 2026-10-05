import type { TextureKey } from '../config/colors';
import type { ChangelogEntry } from '../config/changelog';
import { ARENA_SIZE } from '../config/arena';
import type { ControlAction } from '../config/controls';
import { BASE_DASH, type DashStats } from '../config/dash';
import type { EnemyType } from '../config/enemies';
import { GEM_XP_VALUE } from '../config/gems';
import { CURRENCY_NAME } from '../config/meta';
import {
  BOMB_DAMAGE,
  BOSS_EMBERS,
  CHEST_EMBERS,
  CONSUMABLE_TEXTURES,
  ELITE_CHEST_CHANCE,
  EMBER_DROPS,
  HEAL_AMOUNT,
  MAGNET_DURATION_MS,
  PICKUP_TEXTURES,
} from '../config/pickups';
import {
  ELEMENTS,
  ROSTER_SPELL_IDS,
  elementOf,
  type ElementId,
  type RosterSpellId,
} from '../config/loadout';
import { rosterCards } from '../config/rosterCards';
import { SPELL_LEVELS, spellLevelText, type SpellLevelTable } from '../config/spellLevels';
import { bindingLabel, defaultControls, moveLabel, type Controls } from './controls';
import { MAX_OFFER_SIZE } from './levelUp';
import { PASSIVES, type Passive } from '../config/passives';
import { relicCountFor } from './pickups';
import type { HelpView } from './scenePayloads';

/**
 * View-model behind the Help screen's Pickups tab (#226): one row per thing on
 * the floor, in the order the ticket lists them. Every number is read from the
 * config the pickups themselves use, so a retune changes the Help text too.
 * Pure TS, unit-tested; the scene only lays the strings out.
 */

export interface PickupHelpRow {
  /** Idle clip the row's icon plays (`config/animations.ts`). */
  clip: string;
  /** Placeholder texture the icon shows when the atlas did not load. */
  texture: TextureKey;
  name: string;
  /** Where it comes from. */
  source: string;
  /** What it does. */
  effect: string;
}

const RARE_DROP = 'rare drop from a regular kill';

/**
 * "every tank kill (worth 3); some other kills; 100 from the boss", from
 * `EMBER_DROPS`. The types that only sometimes drop one are not named: #126
 * made them five, more than one line of the screen holds.
 */
function emberSource(): string {
  const types = Object.keys(EMBER_DROPS) as EnemyType[];
  const worth = (type: EnemyType): string => {
    const { value } = EMBER_DROPS[type];
    return value > 1 ? ` (worth ${value})` : '';
  };
  const parts = types
    .filter((t) => EMBER_DROPS[t].chance >= 1)
    .map((type) => `every ${type} kill${worth(type)}`);
  const some = types.some((t) => EMBER_DROPS[t].chance > 0 && EMBER_DROPS[t].chance < 1);
  if (some) parts.push(parts.length > 0 ? 'some other kills' : 'some kills');
  parts.push(`${BOSS_EMBERS} from the boss`);
  return parts.join('; ');
}

export function pickupHelpRows(): PickupHelpRow[] {
  const embers = CURRENCY_NAME;
  return [
    {
      clip: 'gem.idle',
      texture: 'gem',
      name: 'XP gem',
      source: 'every kill',
      effect: `${GEM_XP_VALUE} XP; drifts to you once it is inside your pickup range`,
    },
    {
      clip: 'pickupEmber.idle',
      texture: PICKUP_TEXTURES.ember,
      name: 'Ember',
      source: emberSource(),
      effect: `${embers} are kept when the run ends, win or lose, and spent on upgrades`,
    },
    {
      clip: 'pickupHealth.idle',
      texture: CONSUMABLE_TEXTURES.health,
      name: 'Health',
      source: RARE_DROP,
      effect: `restores ${HEAL_AMOUNT} HP, up to your max HP`,
    },
    {
      clip: 'pickupMagnet.idle',
      texture: CONSUMABLE_TEXTURES.magnet,
      name: 'Magnet',
      source: RARE_DROP,
      effect: `pulls every XP gem on the map to you for ${MAGNET_DURATION_MS / 1000} s (not the Magnet passive)`,
    },
    {
      clip: 'pickupBomb.idle',
      texture: CONSUMABLE_TEXTURES.bomb,
      name: 'Bomb',
      source: RARE_DROP,
      effect: `hits every enemy on screen for ${BOMB_DAMAGE} damage; the boss is spared`,
    },
    {
      clip: 'pickupChest.idle',
      texture: CONSUMABLE_TEXTURES.chest,
      name: 'Chest',
      source: ELITE_CHEST_CHANCE >= 1 ? 'every elite kill' : 'some elite kills',
      effect: `pays ${CHEST_EMBERS} ${embers}`,
    },
    {
      clip: 'pickupRelic.idle',
      texture: PICKUP_TEXTURES.relic,
      name: 'Relic',
      source: `${relicCountFor(ARENA_SIZE)} placed round the map at run start, more on bigger maps`,
      effect: `pick 1 of ${MAX_OFFER_SIZE}: a buff for the rest of the run (buffs stack), or more Rerolls or Bans`,
    },
  ];
}

/** One row of the Help screen's Spells tab (#327): a spell and what its two upgrades add. */
export interface SpellHelpRow {
  id: RosterSpellId;
  name: string;
  /** The spell's HUD colour, for the icon's fallback disc. */
  color: number;
  description: string;
  lv2: string;
  lv3: string;
}

/** The Spells table fits five 56 px lines above Back; a pager is needed beyond that. */
export const MAX_SPELL_HELP_ROWS = 5;

/**
 * The Spells tab: one row per roster spell that has a level entry, in roster
 * order, so an element's upgrades appear here the moment its ticket fills the
 * table in (#328-#330). The two levels are the level-up card's own text, one
 * source; the table's Lv 2 and Lv 3 headers name them (CO-238).
 */
export function spellHelpRows(table: SpellLevelTable = SPELL_LEVELS): SpellHelpRow[] {
  const cards = new Map(rosterCards().map((card) => [card.id, card]));
  return ROSTER_SPELL_IDS.flatMap((id) => {
    const card = cards.get(id);
    const lv2 = spellLevelText(table, id, 2);
    const lv3 = spellLevelText(table, id, 3);
    if (!card || lv2 === undefined || lv3 === undefined) return [];
    return [
      {
        id,
        name: card.name,
        color: card.color,
        description: card.description,
        lv2,
        lv3,
      },
    ];
  });
}

/** One page of the Spells tab: an element's spells, at most `MAX_SPELL_HELP_ROWS` of them. */
export interface SpellHelpPage {
  element: ElementId;
  /** The element's name, capitalised: the pager buttons' label. */
  title: string;
  rows: SpellHelpRow[];
}

/**
 * The Spells tab split into pages, one element per page in `ELEMENTS` order
 * (#328): a full element never shares a page, and an element with more than
 * `MAX_SPELL_HELP_ROWS` spells would continue on a page of the same element.
 * Elements with no level entries have no page.
 */
export function spellHelpPages(table: SpellLevelTable = SPELL_LEVELS): SpellHelpPage[] {
  const rows = spellHelpRows(table);
  return ELEMENTS.flatMap((element) => {
    const own = rows.filter((row) => elementOf(row.id) === element);
    const title = element.charAt(0).toUpperCase() + element.slice(1);
    const pages: SpellHelpPage[] = [];
    for (let i = 0; i < own.length; i += MAX_SPELL_HELP_ROWS) {
      pages.push({ element, title, rows: own.slice(i, i + MAX_SPELL_HELP_ROWS) });
    }
    return pages;
  });
}

/** One row of the Help screen's Passives tab (CO-238): a passive, what one rank does and its cap. */
export interface PassiveHelpRow {
  id: string;
  name: string;
  /** What one rank does: the Per rank column. */
  effect: string;
  /** The rank cap, `—` for a passive with none: the Max rank column. */
  cap: string;
}

/** No cap to show in the Max rank column. */
export const NO_RANK_CAP = '—';

/**
 * The Passives tab: one row per passive in the catalog, in catalog order, so a
 * retune or a new passive changes the Help text with no edit here. The effect is
 * the level-up card's own line; the passive that shares a name with a pickup
 * says it is not that pickup.
 */
export function passiveHelpRows(passives: readonly Passive[] = PASSIVES): PassiveHelpRow[] {
  const pickupNames = new Set(pickupHelpRows().map((row) => row.name));
  return passives.map((passive) => ({
    id: passive.id,
    name: passive.name,
    effect:
      passive.description +
      (pickupNames.has(passive.name) ? ` Not the ${passive.name} pickup.` : ''),
    cap: passive.maxRank === undefined ? NO_RANK_CAP : `${passive.maxRank}`,
  }));
}

/** The Passives table fits eight 36 px rows under its header, above Back; a pager is needed beyond that. */
export const MAX_PASSIVE_HELP_ROWS = 8;

/** One page of the Passives tab: at most `MAX_PASSIVE_HELP_ROWS` rows. */
export interface PassiveHelpPage {
  /** `Page 1`, `Page 2`...: the pager buttons' label. */
  title: string;
  rows: PassiveHelpRow[];
}

/** The Passives tab split into pages of `MAX_PASSIVE_HELP_ROWS`; none for an empty catalog. */
export function passiveHelpPages(passives: readonly Passive[] = PASSIVES): PassiveHelpPage[] {
  const rows = passiveHelpRows(passives);
  const pages: PassiveHelpPage[] = [];
  for (let i = 0; i < rows.length; i += MAX_PASSIVE_HELP_ROWS) {
    pages.push({
      title: `Page ${pages.length + 1}`,
      rows: rows.slice(i, i + MAX_PASSIVE_HELP_ROWS),
    });
  }
  return pages;
}

/** `page` held to a page that exists, on the Spells or Passives tab: NaN or a fraction is the first page, out of range the nearest end. */
export function clampSpellPage(page: number, count: number): number {
  if (count <= 0 || !Number.isFinite(page)) return 0;
  return Math.min(Math.max(Math.trunc(page), 0), count - 1);
}

/** One version's lines on the About tab (#377). */
export interface ChangelogGroup {
  version: string;
  lines: string[];
}

/** Entries grouped under their version, order kept; only neighbours with the same version merge. */
export function groupChangelog(entries: readonly ChangelogEntry[]): ChangelogGroup[] {
  const groups: ChangelogGroup[] = [];
  for (const { version, line } of entries) {
    const last = groups[groups.length - 1];
    if (last?.version === version) last.lines.push(line);
    else groups.push({ version, lines: [line] });
  }
  return groups;
}

/** Rows the About panel has room for: one per version heading and one per line (#377). */
export const MAX_ABOUT_ROWS = 7;

/** Rows `groups` draw: a heading each, plus every line. */
export function aboutRowCount(groups: readonly ChangelogGroup[]): number {
  return groups.reduce((n, g) => n + 1 + g.lines.length, 0);
}

/** One line of the Controls tab (#384): what to do, the keys and pad button that do it, and what it does. */
export interface ControlHelpRow {
  action: string;
  keyboard: string;
  gamepad: string;
  note: string;
}

/**
 * The Controls tab's rows. The bindings are the player's own (CO-226): movement
 * and the dash are read in `entities/Player.ts`, the pause key and button in
 * `GameScene`, mute in `render/audio.ts`, Reroll, Skip and Ban in `LevelUpScene`
 * and the tab keys in `HelpScene`. The dash note reads its numbers from
 * `BASE_DASH`, so a retune changes the text.
 */
export function controlHelpRows(
  stats: Readonly<DashStats> = BASE_DASH,
  controls: Readonly<Controls> = defaultControls(),
): ControlHelpRow[] {
  const both = (action: ControlAction): Pick<ControlHelpRow, 'keyboard' | 'gamepad'> => ({
    keyboard: bindingLabel(controls, 'keyboard', action),
    gamepad: bindingLabel(controls, 'pad', action),
  });
  const trio = (device: 'keyboard' | 'pad'): string =>
    `${bindingLabel(controls, device, 'reroll')} reroll, ${bindingLabel(controls, device, 'skip')} skip, ${bindingLabel(controls, device, 'ban')} ban`;
  const pair = (device: 'keyboard' | 'pad'): string =>
    `${bindingLabel(controls, device, 'helpPrev')} / ${bindingLabel(controls, device, 'helpNext')}`;
  return [
    {
      action: 'Move',
      keyboard: moveLabel(controls, 'keyboard'),
      gamepad: moveLabel(controls, 'pad'),
      note: 'Walk; a dash goes the way you are moving',
    },
    {
      action: 'Dash',
      ...both('dash'),
      note: `Burst ${stats.distancePx} px; no damage while it runs; ${stats.cooldownMs / 1000} s cooldown`,
    },
    { action: 'Pause', ...both('pause'), note: 'Pause the run' },
    { action: 'Mute', ...both('mute'), note: 'Mute and unmute the sound' },
    {
      action: 'Level-up',
      keyboard: trio('keyboard'),
      gamepad: trio('pad'),
      note: 'On a level-up or relic; 1-3 pick a card',
    },
    {
      action: 'Help tabs',
      keyboard: pair('keyboard'),
      gamepad: pair('pad'),
      note: 'Previous and next tab or page',
    },
  ];
}

/** The Help tabs, left to right; a paged tab's pages come before the next one. */
const HELP_TAB_ORDER: readonly HelpView[] = ['pickups', 'spells', 'passives', 'controls', 'about'];

/** The tabs that run over several pages. */
export type PagedHelpView = 'spells' | 'passives';

/**
 * Where a shoulder button (LB -1, RB +1) takes the Help screen (#377): the tabs
 * run Pickups, Spells, Passives, Controls, About without wrapping, and on a
 * paged tab a press turns the page before it leaves (CO-238). `null` when there
 * is nowhere to go, or on the feedback form, which has no tabs.
 */
export function helpShoulderStep(
  view: HelpView,
  page: number,
  pageCounts: Readonly<Record<PagedHelpView, number>>,
  dir: -1 | 1,
): { view: HelpView; page?: number } | null {
  if (view === 'feedback') return null;
  if (view === 'spells' || view === 'passives') {
    const next = page + dir;
    if (next >= 0 && next < pageCounts[view]) return { view, page: next };
  }
  const target = HELP_TAB_ORDER[HELP_TAB_ORDER.indexOf(view) + dir];
  if (!target) return null;
  // Arriving on a paged tab from the right lands on its last page, from the left on its first.
  if (target === 'spells' || target === 'passives')
    return { view: target, page: dir === 1 ? 0 : Math.max(pageCounts[target] - 1, 0) };
  return { view: target };
}
