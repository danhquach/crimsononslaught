/**
 * The numbers a run is made of (Phase 2 spec §9): one stat block per spell.
 *
 * Every spell reads its own block and never learns where the numbers came
 * from. Base values live in `config/spells.ts`; what a run's passives do to
 * them is `core/playerProfile.ts`'s `resolveSpellStats`, against the category
 * map in `config/spellFields.ts`.
 *
 * Pure TS, no Phaser import.
 */

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

/**
 * One companion ally (#133, spec §9). All four share a block: the flavour —
 * ranged or melee — is `config/companions.ts`'s, and the element's on-hit
 * effect is whichever of the optional fields the block carries a value for.
 */
export interface CompanionStats {
  /** Seconds between this companion's own attacks. */
  attackCooldown: number;
  /** Damage one attack deals. */
  damage: number;
  /** How far the companion looks for something to attack, in px. */
  targetRange: number;
  /** How far it may stray from the player before it walks back, in px. */
  leashRadius: number;
  /** How fast it walks, in px/s. */
  chaseSpeed: number;
  /** Ranged only: shots per attack. */
  projectiles?: number;
  /** Ranged only: shot speed in px/s. */
  speed?: number;
  /** Fire: burn damage per second applied on hit. */
  burn?: number;
  /** Fire: seconds that burn lasts. */
  burnDuration?: number;
  /** Ice: speed cut applied on hit, 0-1. */
  slowPct?: number;
  /** Ice: seconds a slow lasts. */
  slowDuration?: number;
  /** Earth: knockback distance in px. */
  knockback?: number;
  /** Lightning: seconds of stagger on hit. Applied once #139 lands the effect. */
  staggerDuration?: number;
}

/** Which stat block each spell owns. */
export interface SpellStatsBySpell {
  fire: FireStats;
  ice: IceStats;
  lightning: LightningStats;
  earth: EarthStats;
  fire_companion: CompanionStats;
  ice_companion: CompanionStats;
  lightning_companion: CompanionStats;
  earth_companion: CompanionStats;
}

/** Every id a `Spell` may carry: the Phase 1 four plus the Phase 2 spells that exist. */
export type StattedSpellId = keyof SpellStatsBySpell;

export type SpellStats = SpellStatsBySpell[StattedSpellId];
