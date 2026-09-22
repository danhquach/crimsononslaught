/**
 * Which profile multiplier reaches which spell stat field (Phase 2 spec §6.1).
 *
 * Every field of every spell stat block belongs to exactly one category, and
 * the category decides the multiplier `core/playerProfile.ts` applies. Adding a
 * field to a spell block without adding it here is a config error, reported at
 * boot by `validateSpellFields`.
 *
 * Counts stay unscaled on purpose: a global "+12% area" that silently became
 * "+12% boulders" would round to nothing on a 3-boulder ring and to a lot on a
 * 9-boulder one. Counts change only in a spell's own block and in #147's pass.
 *
 * The Phase 1 blocks (`config/spells.ts`) are covered too: CO-109 made this map
 * the path every equipped spell's numbers go through, so a field missing here
 * would be a stat no passive can ever reach.
 *
 * Pure data, no Phaser import.
 */

/** The profile multiplier a category applies, or none at all. */
export type StatCategory = 'damage' | 'cooldown' | 'area' | 'speed' | 'duration' | 'unscaled';

export const STAT_CATEGORIES = {
  // damage — scaled by `damageMul`
  damage: 'damage',
  tickDamage: 'damage',
  breakDamage: 'damage',
  burn: 'damage',
  bleed: 'damage',

  // cooldown — scaled by `cooldownMul`
  cooldown: 'cooldown',
  attackCooldown: 'cooldown',
  rechargeDelay: 'cooldown',
  fallDelay: 'cooldown',

  // area — scaled by `areaMul`
  aoeRadius: 'area',
  radius: 'area',
  breakRadius: 'area',
  chainRange: 'area',
  orbitRadius: 'area',
  leashRadius: 'area',
  targetRange: 'area',
  range: 'area',
  size: 'area',
  pullRadius: 'area',

  // speed — scaled by `projectileSpeedMul`
  speed: 'speed',
  orbitSpeed: 'speed',
  chaseSpeed: 'speed',

  // duration — scaled by `durationMul`
  duration: 'duration',
  burnDuration: 'duration',
  bleedDuration: 'duration',
  slowDuration: 'duration',
  freezeDuration: 'duration',
  stunDuration: 'duration',
  staggerDuration: 'duration',

  // unscaled — counts, fractions and the forces a global multiplier must not touch
  projectiles: 'unscaled',
  strikes: 'unscaled',
  chains: 'unscaled',
  count: 'unscaled',
  pierce: 'unscaled',
  slowPct: 'unscaled',
  freezeChance: 'unscaled',
  stunChance: 'unscaled',
  chainFalloff: 'unscaled',
  aoeDamageFactor: 'unscaled',
  knockback: 'unscaled',
  pullForce: 'unscaled',
  homingTurnRate: 'unscaled',
  hitCooldown: 'unscaled',
  tickRate: 'unscaled',
  shieldHp: 'unscaled',
} as const satisfies Readonly<Record<string, StatCategory>>;

/** Every field a Phase 2 spell stat block may carry. */
export type SpellStatField = keyof typeof STAT_CATEGORIES;

export const SPELL_STAT_FIELDS = Object.keys(STAT_CATEGORIES) as readonly SpellStatField[];

/**
 * One spell's numbers (spec §9). Partial: a spell carries only the fields its
 * behaviour uses, and the roster tickets (#140-#143) fill these in.
 */
export type SpellStatBlock = Readonly<Partial<Record<SpellStatField, number>>>;
