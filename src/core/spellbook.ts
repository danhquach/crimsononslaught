import type { RosterSpellId } from '../config/loadout';
import type { PassiveId, PlayerProfile } from '../config/passives';
import type { RelicBuffId } from '../config/relics';
import type { SpellStatBlock, SpellStatField } from '../config/spellFields';
import {
  equip as equipInLoadout,
  profileOf,
  takePassive,
  takeRelic,
  type Loadout,
} from './loadout';
import { resolveSpellStats } from './playerProfile';
import type { Spell } from './spell';
import type { SpellStats } from './spellStats';

/**
 * Everything a run is casting (Phase 2 spec §3, §6.2): the spells that are
 * equipped right now, each ticking its own cooldown, and the one place their
 * stat blocks are resolved from the loadout.
 *
 * A spell added mid-run starts casting from the moment it is equipped — a
 * `Spell` owns its `CastScheduler`, so a new one simply begins its first full
 * cooldown here rather than inheriting anyone else's charge. A passive is taken
 * against the loadout and every equipped spell is re-resolved on the spot, which
 * is what makes one pick reach all of them at once (spec §4.2: derive on read,
 * never accumulate in place).
 *
 * Pure TS, no Phaser import: the caller brings the factory that builds a
 * `Spell` with its sprites, this file only decides what casts and with which
 * numbers.
 */

/**
 * Builds the spell for an id, with the block it should cast at. `undefined` for
 * an id this build has no implementation for — every roster spell has one since
 * #143, so this is the door for an id added to the roster ahead of its class.
 */
export type SpellFactory = (spellId: RosterSpellId, stats: SpellStatBlock) => Spell | undefined;

/** The unmodified block a spell's stats are resolved from, before the profile scales it. */
export type BaseStatsFor = (spellId: RosterSpellId) => SpellStatBlock | undefined;

export class Spellbook {
  private readonly live: Spell[] = [];
  private current: Loadout;
  private readonly create: SpellFactory;
  private readonly baseStats: BaseStatsFor;

  constructor(loadout: Loadout, create: SpellFactory, baseStats: BaseStatsFor) {
    this.current = loadout;
    this.create = create;
    this.baseStats = baseStats;
  }

  /** The spells casting right now, in equip order. */
  get spells(): readonly Spell[] {
    return this.live;
  }

  get loadout(): Loadout {
    return this.current;
  }

  /**
   * Every stat the spells casting right now carry in their base blocks — slotted
   * or not, so a `?loadout=` extra counts. What gates a passive's
   * `requiresStat` at level-up (#206).
   */
  get carriedStats(): ReadonlySet<SpellStatField> {
    const carried = new Set<SpellStatField>();
    for (const spell of this.live) {
      for (const [field, value] of Object.entries(this.baseStats(spell.id) ?? {})) {
        if (value !== undefined) carried.add(field as SpellStatField);
      }
    }
    return carried;
  }

  /** The profile the loadout's passives resolve to — what scales every block. */
  get profile(): PlayerProfile {
    return profileOf(this.current);
  }

  /**
   * Equip one spell, returning it, or `undefined` when it cannot be cast: an id
   * already equipped, or one with no implementation or no stat block. Which
   * spells a level-up may *offer* is the loadout's rule (`canEquip`); this only
   * refuses what would break the run.
   */
  equip(spellId: RosterSpellId): Spell | undefined {
    if (this.live.some((spell) => spell.id === spellId)) return undefined;
    const stats = this.statsFor(spellId);
    if (!stats) return undefined;
    const spell = this.create(spellId, stats);
    if (spell) this.live.push(spell);
    return spell;
  }

  /**
   * Equip a level-up pick: fill the lowest open slot with `spellId` and start
   * casting it. `undefined` — and nothing changed — when the loadout refuses it
   * (`canEquip`: another element, already equipped, no slot open at this level)
   * or when this build cannot cast it, so a slot is never spent on a spell that
   * would not fire.
   *
   * `equip` is the other door in: it casts a spell without occupying a slot,
   * which is what the default spell and the `?loadout=` test hook need.
   */
  equipActive(spellId: RosterSpellId, level: number): Spell | undefined {
    const result = equipInLoadout(this.current, spellId, level);
    if (!result.ok) return undefined;
    const spell = this.equip(spellId);
    if (!spell) return undefined;
    this.current = result.loadout;
    return spell;
  }

  /**
   * Take one rank of a passive and push the new numbers onto every equipped
   * spell, so the next cast of all of them already has it. Throws on what
   * `takePassive` rejects — an unknown id or one already at `maxRank`.
   */
  takePassive(passiveId: PassiveId): void {
    this.current = takePassive(this.current, passiveId);
    this.refresh();
  }

  /** Take one rank of a relic buff (#227); every equipped spell is re-resolved like a passive. */
  takeRelic(buffId: RelicBuffId): void {
    this.current = takeRelic(this.current, buffId);
    this.refresh();
  }

  /**
   * Re-resolve every equipped spell's block against the loadout as it stands.
   * Called for a passive, and by the caller for anything else that moves the
   * numbers a spell's base block comes from.
   */
  refresh(): void {
    for (const spell of this.live) {
      const stats = this.statsFor(spell.id);
      // The block came from this spell's own base block, so its fields are that
      // spell's; the resolver widens the type, it never changes which keys exist.
      if (stats) spell.setStats(stats as SpellStats);
    }
  }

  /** One frame, in milliseconds of run time. Each spell ticks its own cooldown. */
  update(deltaMs: number): void {
    for (const spell of this.live) spell.update(deltaMs);
  }

  private statsFor(spellId: RosterSpellId): SpellStatBlock | undefined {
    const base = this.baseStats(spellId);
    return base && resolveSpellStats(base, this.profile);
  }
}
