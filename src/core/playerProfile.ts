import {
  BASE_PLAYER_PROFILE,
  PASSIVES,
  PROFILE_CLAMPS,
  PROFILE_FLOOR,
  type Passive,
  type PlayerProfile,
  type ProfileField,
} from '../config/passives';
import {
  STAT_CATEGORIES,
  type SpellStatBlock,
  type SpellStatField,
  type StatCategory,
} from '../config/spellFields';

/**
 * Resolving a stack of passives into the player's profile, and the profile into
 * the stat block a spell casts with (Phase 2 spec §4.2, §6).
 *
 * Both functions are pure and derive on read: nothing is accumulated in place,
 * so a wrong rank can never be baked in and a passive taken at level 9 applies
 * to a spell equipped at level 3 without anything walking the loadout to
 * rewrite numbers.
 *
 * Pure TS, no Phaser import.
 */

/**
 * Which profile field scales each category; `unscaled` is left alone and
 * `pierce` is added to, not scaled.
 */
const CATEGORY_MULTIPLIER: Readonly<
  Record<Exclude<StatCategory, 'unscaled' | 'pierce'>, ProfileField>
> = {
  damage: 'damageMul',
  cooldown: 'cooldownMul',
  area: 'areaMul',
  speed: 'projectileSpeedMul',
  duration: 'durationMul',
};

/**
 * Spec §4.2: `value = clamp((base + Σ adds) × Π muls)` per field, adds first,
 * muls second, clamps last. Order-independent by construction — addition and
 * multiplication are each order-independent and the two groups never
 * interleave — which is what makes a shuffled pick order give an identical
 * profile.
 *
 * A rank is one application of `{op, amount}`: three ranks of a `mul 1.10`
 * passive contribute `1.10³`, not `1.30`.
 *
 * Anything the boot-time validation would have rejected throws here rather than
 * silently missing a buff: an unknown id, or a rank outside `1..maxRank`.
 *
 * `passives` is the config the ranks are read against; tests pass their own.
 */
export function resolveProfile(
  ranks: ReadonlyMap<string, number>,
  passives: readonly Passive[] = PASSIVES,
): PlayerProfile {
  const adds = new Map<ProfileField, number>();
  const muls = new Map<ProfileField, number>();

  for (const [id, rank] of ranks) {
    const passive = passives.find((candidate) => candidate.id === id);
    if (!passive) throw new Error(`unknown passive "${id}"`);
    const cap = passive.maxRank ?? Infinity;
    if (!Number.isInteger(rank) || rank < 1 || rank > cap) {
      throw new RangeError(`passive "${id}" has no rank ${rank} (1..${cap})`);
    }
    if (passive.op === 'add') {
      adds.set(passive.field, (adds.get(passive.field) ?? 0) + passive.amount * rank);
    } else {
      muls.set(passive.field, (muls.get(passive.field) ?? 1) * passive.amount ** rank);
    }
  }

  const profile = { ...BASE_PLAYER_PROFILE };
  for (const field of Object.keys(profile) as ProfileField[]) {
    const raw = (profile[field] + (adds.get(field) ?? 0)) * (muls.get(field) ?? 1);
    profile[field] = clampField(field, raw);
  }
  return profile;
}

/** Spec §4.3: the caps, plus a floor of 0 on every field. */
function clampField(field: ProfileField, value: number): number {
  const clamp = PROFILE_CLAMPS[field];
  const min = clamp?.min ?? PROFILE_FLOOR;
  return Math.min(clamp?.max ?? Infinity, Math.max(min, value));
}

/**
 * Spec §6.2: one spell's numbers as it casts them right now. Each field is
 * `base × profile[multiplier for its category]`, except `pierce`, which is
 * `base + profile.pierceBonus` (#206); unscaled fields and fields missing from
 * the category map are copied through untouched — an unknown field is a config
 * error `validateSpellFields` reports at boot, not a reason to throw mid-run.
 *
 * Only the fields `base` carries are written, so a spell that does not pierce
 * never gains a `pierce` from the Pierce passive.
 *
 * Called where the value is used, never stored on the loadout: a snapshotting
 * caller (a projectile in flight) reads once at spawn, a live one (a companion,
 * an orbit, a shield) reads every frame.
 */
export function resolveSpellStats(base: SpellStatBlock, profile: PlayerProfile): SpellStatBlock {
  const out: Record<string, number> = {};
  for (const [field, value] of Object.entries(base)) {
    if (value === undefined) continue;
    out[field] =
      STAT_CATEGORIES[field as SpellStatField] === 'pierce'
        ? value + profile.pierceBonus
        : value * multiplierFor(field as SpellStatField, profile);
  }
  return out as SpellStatBlock;
}

function multiplierFor(field: SpellStatField, profile: PlayerProfile): number {
  const category: StatCategory | undefined = STAT_CATEGORIES[field];
  if (category === undefined || category === 'unscaled' || category === 'pierce') return 1;
  return profile[CATEGORY_MULTIPLIER[category]];
}

/**
 * Boot-time check of the loadout config (spec §12, in the shape Phase 1 §7
 * uses). Returns one line per problem and never throws, so a bad config logs
 * and the game still starts.
 *
 * Checked: ids are unique, every passive names a field that exists on
 * `PlayerProfile` with a usable amount, and `maxRank` is a positive integer
 * where present. The roster and the slot unlock levels are checked by
 * `validateLoadoutConfig` in `core/loadout.ts`.
 */
export function validatePassives(passives: readonly Passive[] = PASSIVES): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const passive of passives) {
    const where = `passive "${passive.id}"`;
    if (seen.has(passive.id)) problems.push(`duplicate passive id "${passive.id}"`);
    seen.add(passive.id);

    if (!(passive.field in BASE_PLAYER_PROFILE)) {
      problems.push(`${where}: no field "${passive.field}" on PlayerProfile`);
    }
    if (
      passive.maxRank !== undefined &&
      (!Number.isInteger(passive.maxRank) || passive.maxRank < 1)
    ) {
      problems.push(`${where}: maxRank must be an integer >= 1, got ${passive.maxRank}`);
    }
    if (!Number.isFinite(passive.amount)) {
      problems.push(`${where}: amount must be finite, got ${passive.amount}`);
    } else if (passive.op === 'mul' && passive.amount <= 0) {
      problems.push(`${where}: a mul amount must be > 0, got ${passive.amount}`);
    }
  }

  return problems;
}

/**
 * Boot-time check that every field of every roster stat block is in the
 * category map (spec §6.1). The roster blocks land with #140-#143; until then
 * the caller passes whatever blocks exist.
 */
export function validateSpellFields(blocks: Readonly<Record<string, SpellStatBlock>>): string[] {
  const problems: string[] = [];
  for (const [spellId, block] of Object.entries(blocks)) {
    for (const field of Object.keys(block)) {
      if (!(field in STAT_CATEGORIES)) {
        problems.push(`spell "${spellId}": stat "${field}" is in no category (spec §6.1)`);
      }
    }
  }
  return problems;
}
