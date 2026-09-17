import { PERKS, perkById, type PerkNode } from '../config/perks';
import { BASE_SPELL_STATS, SPELL_IDS, type SpellId } from '../config/spells';
import { PICKUP_RADIUS } from './gems';
import { PLAYER_MAX_HP } from './health';
import { PLAYER_SPEED } from './input';

/**
 * The numbers a run is made of (spec §5 "Spells", "Generic perks") and the one
 * reducer that changes them.
 *
 * Every spell reads its own stat block; a perk pick is a single field change on
 * that block, or on the player block for the three generic perks. Keeping the
 * change here — rather than in each spell — means a spell never learns what a
 * perk is, and the whole tree is unit-tested without a running game.
 *
 * Base values live in `config/spells.ts`, the trees in `config/perks.ts`.
 *
 * Pure TS, no Phaser import.
 */

/** Spec §5 Fire: burn ticks for this long after a hit. Not perk-modified. */
export const BURN_DURATION = 2;

/** Spec §5 Ice: a freeze is a full stop for this long. Not perk-modified. */
export const FREEZE_DURATION = 1;

/** Spec §5 Earth: one boulder can hit the same enemy this often. Not perk-modified. */
export const BOULDER_HIT_COOLDOWN = 0.4;

export interface FireStats {
  /** Seconds between volleys. */
  cooldown: number;
  /** Damage on a direct hit. */
  damage: number;
  /** Explosion radius in px. */
  aoeRadius: number;
  /** Explosion damage as a fraction of `damage`; Big Blast takes it to 1. */
  aoeDamageFactor: number;
  /** Projectiles per volley, each at its own target where possible. */
  projectiles: number;
  /** Projectile speed in px/s. */
  speed: number;
  /** How far a projectile flies before it expires, in px; also the targeting range. */
  range: number;
  /** Burn damage per second for `BURN_DURATION` s. 0 = no burn. */
  burn: number;
}

export interface IceStats {
  /** Seconds between pulses. */
  cooldown: number;
  damage: number;
  /** Pulse radius in px, measured from the player. */
  radius: number;
  /** Speed cut applied to everything hit, 0–1. */
  slowPct: number;
  /** Seconds a slow lasts. */
  slowDuration: number;
  /** Chance per hit of a full stop for `FREEZE_DURATION` s, 0–1. */
  freezeChance: number;
  /** Shatter: extra damage against an already-slowed enemy, as a fraction of `damage`. */
  shatterBonus: number;
}

export interface LightningStats {
  /** Seconds between strikes. */
  cooldown: number;
  damage: number;
  /** Extra enemies one bolt jumps to after its first target. */
  chains: number;
  /** How far a chain may jump, in px. */
  chainRange: number;
  /** Bolts per cast, each starting at its own target where possible. */
  strikes: number;
  /** Seconds a hit enemy is stunned. 0 = no stun. */
  stun: number;
  /** Damage multiplier applied per chain jump; No Falloff takes it to 1. */
  chainFalloff: number;
}

export interface EarthStats {
  /** Boulders in orbit. */
  count: number;
  /** Orbit radius in px. */
  orbitRadius: number;
  /** Orbit angular speed in rad/s. */
  orbitSpeed: number;
  damage: number;
  /** Knockback distance in px. */
  knockback: number;
  /** Boulder body radius in px. */
  size: number;
  /** Crush: damage multiplier against Tanks. */
  crushMultiplier: number;
}

/** Which stat block each spell owns. */
export interface SpellStatsBySpell {
  fire: FireStats;
  ice: IceStats;
  lightning: LightningStats;
  earth: EarthStats;
}

export type SpellStats = SpellStatsBySpell[SpellId];

/** What the generic perks change (spec §5 "Generic perks"). */
export interface PlayerStats {
  /** px/s, before diagonal normalization. */
  moveSpeed: number;
  maxHp: number;
  /** Gem pickup radius in px. */
  pickupRadius: number;
}

/**
 * Player baselines, taken from the systems that already own them so a perk and
 * the entity it buffs can never drift apart.
 */
export const BASE_PLAYER_STATS: Readonly<PlayerStats> = {
  moveSpeed: PLAYER_SPEED,
  maxHp: PLAYER_MAX_HP,
  pickupRadius: PICKUP_RADIUS,
};

/** Everything a run's perks can touch: the chosen spell's block plus the player's. */
export interface LoadoutStats<S extends SpellId = SpellId> {
  /** Fixed at spell select; `applyPerk` refuses perks from another spell. */
  readonly spellId: S;
  spell: SpellStatsBySpell[S];
  player: PlayerStats;
}

/** A fresh loadout at base values. Copies, so two runs never share a block. */
export function createLoadout<S extends SpellId>(spellId: S): LoadoutStats<S> {
  return {
    spellId,
    spell: { ...BASE_SPELL_STATS[spellId] },
    player: { ...BASE_PLAYER_STATS },
  };
}

/**
 * Apply one rank of one perk, returning a new loadout — the caller (CO-042's
 * `PerkSystem`) calls this once per pick, so ranks compound in pick order and
 * the previous stats stay intact for anything still reading them.
 *
 * `rank` is the rank being gained, 1-based. Anything the boot-time validation
 * would have rejected throws here rather than silently missing a buff: an
 * unknown id, a perk from another spell, or a rank outside `1..maxRank`.
 */
export function applyPerk<S extends SpellId>(
  stats: LoadoutStats<S>,
  perkId: string,
  rank: number,
): LoadoutStats<S> {
  const perk = perkById(perkId);
  if (!perk) throw new Error(`unknown perk "${perkId}"`);
  if (perk.spell !== 'generic' && perk.spell !== stats.spellId) {
    throw new Error(`perk "${perkId}" belongs to ${perk.spell}, not ${stats.spellId}`);
  }
  if (!Number.isInteger(rank) || rank < 1 || rank > perk.maxRank) {
    throw new RangeError(`perk "${perkId}" has no rank ${rank} (1..${perk.maxRank})`);
  }

  // Both blocks are copied, so a returned loadout never shares state with the
  // one that produced it — whatever still holds the old one keeps its numbers.
  const next: LoadoutStats<S> = {
    spellId: stats.spellId,
    spell: { ...stats.spell },
    player: { ...stats.player },
  };
  const block = (perk.spell === 'generic' ? next.player : next.spell) as unknown as Record<
    string,
    number
  >;
  const current = block[perk.effect.field];
  if (current === undefined) {
    throw new Error(`perk "${perkId}" changes "${perk.effect.field}", which ${perk.spell} has not`);
  }
  block[perk.effect.field] = applyEffect(current, perk.effect);
  return next;
}

function applyEffect(value: number, effect: PerkNode['effect']): number {
  switch (effect.op) {
    case 'add':
      return value + effect.amount;
    case 'mul':
      return value * effect.amount;
    case 'set':
      return effect.amount;
  }
}

/**
 * Boot-time check of a perk tree (spec §7: config is validated once at boot and
 * fails loudly in the console, but the game still starts).
 *
 * Returns one line per problem — it never throws, whatever the config says, so
 * a bad tree logs and the run still starts. Checked: ids are unique, `maxRank`
 * is a positive integer, a spell branch holds one node per tier, tiers start at
 * 1 and each tier above it names the tier below it in the same branch as its
 * prereq, and every effect names a field that exists on the block it targets
 * with a usable amount.
 */
export function validatePerks(nodes: readonly PerkNode[] = PERKS): string[] {
  const problems: string[] = [];
  const byId = new Map<string, PerkNode>();
  const slots = new Map<string, string>();
  for (const node of nodes) {
    if (byId.has(node.id)) problems.push(`duplicate perk id "${node.id}"`);
    byId.set(node.id, node);
  }

  for (const node of nodes) {
    const where = `perk "${node.id}"`;
    if (!Number.isInteger(node.maxRank) || node.maxRank < 1) {
      problems.push(`${where}: maxRank must be an integer >= 1, got ${node.maxRank}`);
    }
    if (!Number.isInteger(node.tier) || node.tier < 1) {
      problems.push(`${where}: tier must be an integer >= 1, got ${node.tier}`);
    }
    // One node per tier in a spell branch, so "the tier below" is unambiguous.
    // The generic nodes are standalone, all at tier 1, and are exempt.
    if (node.spell !== 'generic') {
      const slot = `${node.spell}/${node.branch}/${node.tier}`;
      if (slots.has(slot))
        problems.push(`${where}: ${slot} is already taken by "${slots.get(slot)}"`);
      else slots.set(slot, node.id);
    }

    problems.push(...prereqProblems(node, byId));

    // An unknown spell has no block to check the effect against, so that node's
    // remaining checks stop here rather than reading off the end of the config.
    const base = baseStatsFor(node.spell);
    if (!base) {
      problems.push(`${where}: unknown spell "${node.spell}"`);
    } else if (!(node.effect.field in base)) {
      problems.push(`${where}: no stat "${node.effect.field}" on ${node.spell}`);
    }
    if (!Number.isFinite(node.effect.amount)) {
      problems.push(`${where}: amount must be finite, got ${node.effect.amount}`);
    } else if (node.effect.op === 'mul' && node.effect.amount <= 0) {
      problems.push(`${where}: a mul amount must be > 0, got ${node.effect.amount}`);
    }
  }

  return problems;
}

/** The block a node's effect is checked against, or `undefined` for a bad spell. */
function baseStatsFor(spell: PerkNode['spell']): Record<string, number> | undefined {
  if (spell === 'generic') return BASE_PLAYER_STATS as unknown as Record<string, number>;
  if (!(SPELL_IDS as readonly string[]).includes(spell)) return undefined;
  return BASE_SPELL_STATS[spell] as unknown as Record<string, number>;
}

function prereqProblems(node: PerkNode, byId: ReadonlyMap<string, PerkNode>): string[] {
  const where = `perk "${node.id}"`;
  if (node.tier === 1) {
    return node.prereq === undefined ? [] : [`${where}: tier 1 must not have a prereq`];
  }
  if (node.prereq === undefined) return [`${where}: tier ${node.tier} needs a prereq`];

  const prereq = byId.get(node.prereq);
  if (!prereq) return [`${where}: prereq "${node.prereq}" does not exist`];
  if (prereq.spell !== node.spell || prereq.branch !== node.branch) {
    return [`${where}: prereq "${node.prereq}" is in another branch`];
  }
  if (prereq.tier !== node.tier - 1) {
    return [`${where}: prereq "${node.prereq}" is tier ${prereq.tier}, expected ${node.tier - 1}`];
  }
  return [];
}
