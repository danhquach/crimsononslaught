import {
  DEFAULT_SPELL_BY_ELEMENT,
  ELEMENTS,
  SLOT_UNLOCK_LEVELS,
  SPELLS_BY_ELEMENT,
  elementOf,
  isRosterSpellId,
  type ElementId,
  type RosterSpellId,
} from '../config/loadout';
import { UPGRADES } from '../config/meta';
import { PASSIVES, passiveById, type PassiveId, type PlayerProfile } from '../config/passives';
import { RELIC_BUFFS, relicBuffById, type RelicBuffId } from '../config/relics';
import { resolveProfile, validatePassives } from './playerProfile';

/**
 * What a run is carrying (Phase 2 spec §3): one default spell that is always
 * equipped, two extra active slots that unlock at fixed levels and are final
 * once filled, and an uncapped stack of passive ranks.
 *
 * Every function here returns a new loadout rather than mutating one, so
 * whatever still holds the previous value keeps its numbers. The profile is
 * derived from the passive map on read (`profileOf`), never accumulated in
 * place, so a wrong rank can never be baked in.
 *
 * The name is `buildLoadout`, not `createLoadout`: Phase 1's
 * `createLoadout` / `LoadoutStats` in `core/spellStats.ts` are a different
 * thing (one spell's block plus the player's) and are retired by #132.
 *
 * Pure TS, no Phaser import.
 */

/** Spec §3.1: the two extra active slots, in unlock order. `null` = empty. */
export type ActiveSlots = readonly [RosterSpellId | null, RosterSpellId | null];

export interface Loadout {
  readonly element: ElementId;
  /** Chosen before the run, always equipped, never removable. */
  readonly defaultSpell: RosterSpellId;
  readonly slots: ActiveSlots;
  /** Passive id -> ranks owned. Uncapped in count; a passive may cap its own rank. */
  readonly passives: ReadonlyMap<PassiveId, number>;
  /**
   * Permanent upgrade id -> ranks bought before the run (CO-101). Fixed for the
   * run's whole length; resolved with the passives in `profileOf`.
   */
  readonly upgrades: ReadonlyMap<string, number>;
  /**
   * Relic buff id -> ranks picked this run (#227). Uncapped; resolved with the
   * upgrades and passives in `profileOf`.
   */
  readonly relics: ReadonlyMap<RelicBuffId, number>;
}

/** Why an equip was refused (spec §3.1, §3.2). */
export type EquipRejection =
  'unknown-spell' | 'wrong-element' | 'already-equipped' | 'slot-locked' | 'full';

export type EquipResult =
  | { readonly ok: true; readonly loadout: Loadout }
  | { readonly ok: false; readonly reason: EquipRejection };

/**
 * A run's starting loadout: the element's default spell, both slots empty, and
 * whatever permanent upgrades the save carries (none by default).
 */
export function buildLoadout(
  element: ElementId,
  upgrades: ReadonlyMap<string, number> = new Map(),
): Loadout {
  return {
    element,
    defaultSpell: DEFAULT_SPELL_BY_ELEMENT[element],
    slots: [null, null],
    passives: new Map(),
    upgrades,
    relics: new Map(),
  };
}

/** Everything casting right now: the default spell, then the slots in pick order. */
export function equipped(loadout: Loadout): RosterSpellId[] {
  return [loadout.defaultSpell, ...loadout.slots.filter((id) => id !== null)];
}

/** Slots whose unlock level this run has reached — 0, 1 or 2. */
export function unlockedSlots(level: number): number {
  return SLOT_UNLOCK_LEVELS.filter((unlockLevel) => level >= unlockLevel).length;
}

/** Unlocked and still empty: how many spells the player may still be offered. */
export function openSlots(loadout: Loadout, level: number): number {
  let open = 0;
  for (let index = 0; index < unlockedSlots(level); index++) {
    if (loadout.slots[index] === null) open++;
  }
  return open;
}

/** Both extra slots filled. Passives are uncapped, so they never make a loadout full. */
export function isFull(loadout: Loadout): boolean {
  return loadout.slots.every((id) => id !== null);
}

/** The element's spells that are not equipped yet — what a level-up may offer. */
export function equippableSpells(loadout: Loadout): RosterSpellId[] {
  const held = new Set<string>(equipped(loadout));
  return (SPELLS_BY_ELEMENT[loadout.element] as readonly RosterSpellId[]).filter(
    (id) => !held.has(id),
  );
}

/** `undefined` when the spell may be equipped at this level, else why not. */
export function canEquip(
  loadout: Loadout,
  spellId: string,
  level: number,
): EquipRejection | undefined {
  if (!isRosterSpellId(spellId)) return 'unknown-spell';
  if (elementOf(spellId) !== loadout.element) return 'wrong-element';
  if (equipped(loadout).includes(spellId)) return 'already-equipped';
  // A filled slot is final, so "no open slot" is either "not there yet" or
  // "never again" — the caller shows a different thing for each.
  if (openSlots(loadout, level) === 0) return isFull(loadout) ? 'full' : 'slot-locked';
  return undefined;
}

/**
 * Fill the lowest open slot with `spellId`, returning a new loadout. There is
 * no slot argument: a filled slot cannot be changed (spec §3.1), so the only
 * slot an equip can touch is the first open one.
 */
export function equip(loadout: Loadout, spellId: RosterSpellId, level: number): EquipResult {
  const reason = canEquip(loadout, spellId, level);
  if (reason !== undefined) return { ok: false, reason };

  const [first, second] = loadout.slots;
  const slots: ActiveSlots = first === null ? [spellId, second] : [first, spellId];
  return { ok: true, loadout: { ...loadout, slots } };
}

/** Ranks of `passiveId` this run owns; 0 when it has never been taken. */
export function passiveRank(loadout: Loadout, passiveId: PassiveId): number {
  return loadout.passives.get(passiveId) ?? 0;
}

/** False once a capped passive is at `maxRank`; uncapped passives are always true. */
export function canTakePassive(loadout: Loadout, passiveId: PassiveId): boolean {
  const passive = passiveById(passiveId);
  if (!passive) return false;
  return passiveRank(loadout, passiveId) < (passive.maxRank ?? Infinity);
}

/**
 * Add one rank of a passive, returning a new loadout. Throws on an unknown id
 * or a passive already at `maxRank` — the level-up offer filters both out
 * (spec §7.1), so reaching here is a caller bug, not a player action.
 */
export function takePassive(loadout: Loadout, passiveId: PassiveId): Loadout {
  const passive = passiveById(passiveId);
  if (!passive) throw new Error(`unknown passive "${passiveId}"`);
  const rank = passiveRank(loadout, passiveId);
  const cap = passive.maxRank ?? Infinity;
  if (rank >= cap) throw new RangeError(`passive "${passiveId}" is already at rank ${cap}`);

  const passives = new Map(loadout.passives);
  passives.set(passiveId, rank + 1);
  return { ...loadout, passives };
}

/**
 * Add one rank of a relic buff (#227), returning a new loadout. Buffs never cap
 * their rank; an unknown id throws, since the relic offer only draws shipped
 * buffs.
 */
export function takeRelic(loadout: Loadout, buffId: RelicBuffId): Loadout {
  if (!relicBuffById(buffId)) throw new Error(`unknown relic buff "${buffId}"`);
  const relics = new Map(loadout.relics);
  relics.set(buffId, (relics.get(buffId) ?? 0) + 1);
  return { ...loadout, relics };
}

/** What `validateLoadoutConfig` checks; each part defaults to the shipped config. */
export interface LoadoutConfig {
  rosters?: Readonly<Record<ElementId, readonly string[]>>;
  defaults?: Readonly<Record<ElementId, string>>;
  unlockLevels?: readonly number[];
}

/**
 * The player profile this loadout resolves to (spec §4.2): the permanent
 * upgrades, the run's passives and its relic buffs (#227) in one pass, so an
 * upgrade's `mul` and a passive's `mul` on the same field multiply like two
 * passives would, and the clamps hold on the total. Ids never collide —
 * upgrades are `upgrade_*`, passives `passive_*`, relic buffs `relic_*`.
 */
export function profileOf(loadout: Loadout): PlayerProfile {
  return resolveProfile(new Map([...loadout.upgrades, ...loadout.passives, ...loadout.relics]), [
    ...UPGRADES,
    ...PASSIVES,
    ...RELIC_BUFFS,
  ]);
}

/**
 * Boot-time check of the loadout config (spec §12). Returns one line per
 * problem and never throws, so a bad config logs and the game still starts:
 * every element's roster is led by its default spell and holds no spell another
 * element also claims, the slot unlock levels ascend, and the passive and relic
 * buff lists pass `validatePassives`, each buff with a positive weight. Tests
 * pass their own config in `config`.
 */
export function validateLoadoutConfig(config: LoadoutConfig = {}): string[] {
  const rosters = config.rosters ?? SPELLS_BY_ELEMENT;
  const defaults = config.defaults ?? DEFAULT_SPELL_BY_ELEMENT;
  const unlockLevels = config.unlockLevels ?? SLOT_UNLOCK_LEVELS;

  const problems: string[] = [
    ...validatePassives(),
    ...validatePassives(RELIC_BUFFS).map((p) => p.replace(/passive /, 'relic buff ')),
  ];
  for (const buff of RELIC_BUFFS) {
    if (!Number.isFinite(buff.weight) || buff.weight <= 0) {
      problems.push(`relic buff "${buff.id}": weight must be > 0, got ${buff.weight}`);
    }
  }
  const owner = new Map<string, ElementId>();

  for (const element of ELEMENTS) {
    const roster = rosters[element];
    const expected = defaults[element];
    if (roster[0] !== expected) {
      problems.push(
        `element "${element}": default spell "${expected}" must lead its roster, got "${roster[0]}"`,
      );
    }
    for (const spellId of roster) {
      const other = owner.get(spellId);
      if (other) problems.push(`spell "${spellId}" is in both "${other}" and "${element}"`);
      else owner.set(spellId, element);
    }
  }

  let previous = 0;
  for (const [index, level] of unlockLevels.entries()) {
    if (!Number.isInteger(level) || level < 1) {
      problems.push(`slot ${index + 1} unlock level must be an integer >= 1, got ${level}`);
    } else if (level <= previous) {
      problems.push(`slot ${index + 1} unlocks at ${level}, not above ${previous}`);
    }
    previous = level;
  }

  return problems;
}
