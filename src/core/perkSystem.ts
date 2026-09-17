import { perksForSpell, type PerkBranch, type PerkNode } from '../config/perks';
import type { SpellId } from '../config/spells';
import { MAX_OFFER_SIZE, type PerkCard } from './levelUp';
import { eligible, offer as drawOffer, ownedRank, type OwnedPerks } from './perkOffer';
import type { Rng } from './rng';
import {
  applyPerk,
  createLoadout,
  type LoadoutStats,
  type PlayerStats,
  type SpellStatsBySpell,
} from './spellStats';

/**
 * The run's perk state (spec §4 step 3, §5 "XP and level-up").
 *
 * One object owns the `owned` map and the loadout every perk writes to: a
 * level-up asks for `offer()`, the pick comes back as `pick(id)`, and the
 * result is a new `LoadoutStats` — the spell block a `Spell` reads every cast
 * (CO-043) and the player block `GameScene` pushes onto the player.
 *
 * The pieces are already unit-tested elsewhere: eligibility and the draw in
 * `perkOffer.ts` (CO-041), the field change in `spellStats.ts` (CO-040). This
 * is the run-long state around them, which is why it is a class and not a
 * function.
 *
 * Pure TS, no Phaser import.
 */
export class PerkSystem<S extends SpellId = SpellId> {
  private readonly tree: readonly PerkNode[];
  private readonly ranks = new Map<string, number>();
  private readonly rng: Rng;
  private loadout: LoadoutStats<S>;

  constructor(spellId: S, rng: Rng) {
    this.tree = perksForSpell(spellId);
    this.rng = rng;
    this.loadout = createLoadout(spellId);
  }

  /** The spell block, as the live spell should read it each cast. */
  get spellStats(): Readonly<SpellStatsBySpell[S]> {
    return this.loadout.spell;
  }

  /** The generic block: move speed, max HP, pickup radius. */
  get playerStats(): Readonly<PlayerStats> {
    return this.loadout.player;
  }

  /** Ranks taken so far, by perk id. */
  get owned(): OwnedPerks {
    return this.ranks;
  }

  rankOf(perkId: string): number {
    return ownedRank(this.ranks, perkId);
  }

  /**
   * Up to `size` cards for one level-up, drawn from what is eligible now. An
   * empty result is the spec's zero-eligible case, which the caller answers
   * with the silent +10 max HP instead of an overlay.
   */
  offer(size: number = MAX_OFFER_SIZE): readonly PerkCard[] {
    return drawOffer(this.rng, eligible(this.tree, this.ranks), size).map((perk) =>
      this.card(perk),
    );
  }

  /**
   * Take one rank of `perkId`. Returns the card that was granted, or
   * `undefined` for a perk this run cannot take right now — an unknown id, one
   * from another spell's tree, a maxed node or one whose prereq is unmet. The
   * pick arrives over a scene event, so a bad one is ignored rather than fatal.
   */
  pick(perkId: string): PerkCard | undefined {
    const perk = eligible(this.tree, this.ranks).find((node) => node.id === perkId);
    if (!perk) return undefined;
    const rank = this.rankOf(perkId) + 1;
    // Replaces the loadout rather than mutating it, so anything still holding
    // the previous one (a diff against the player's stats) keeps its numbers.
    this.loadout = applyPerk(this.loadout, perkId, rank);
    this.ranks.set(perkId, rank);
    return this.card(perk, rank);
  }

  private card(perk: PerkNode, rank: number = this.rankOf(perk.id) + 1): PerkCard {
    return {
      id: perk.id,
      name: perk.name,
      branch: branchLabel(perk.branch),
      rank,
      maxRank: perk.maxRank,
      description: perk.description,
    };
  }
}

/** Branch name as the level-up card shows it: `power` -> `Power`. */
function branchLabel(branch: PerkBranch | 'generic'): string {
  return branch.charAt(0).toUpperCase() + branch.slice(1);
}
