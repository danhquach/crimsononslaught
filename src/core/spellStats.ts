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
}

/**
 * Ice Arrow (spec §9.3): a fast single-target bolt that chills what it hits.
 * No splash, so it fires faster than Fire Bolt.
 */
export interface IceStats {
  /** Seconds between volleys. */
  cooldown: number;
  /** Damage on a direct hit. */
  damage: number;
  /** Arrows per volley, each at its own target where possible. */
  projectiles: number;
  /** Arrow speed in px/s. */
  speed: number;
  /** How far an arrow flies before it expires, in px; also the targeting range. */
  range: number;
  /** Speed cut applied to the enemy hit, 0–1. */
  slowPct: number;
  /** Seconds that slow lasts. */
  slowDuration: number;
}

/**
 * Frost Nova Bomb (spec §9.3): Phase 1's nova, thrown. A slow bomb flies at
 * the nearest enemy within `range` and detonates on its first hit or where its
 * range runs out, pulsing `radius` around that point.
 */
export interface NovaBombStats {
  /** Seconds between throws. */
  cooldown: number;
  /** Damage the pulse deals to every enemy inside `radius`. */
  damage: number;
  /** Pulse radius in px, measured from where the bomb detonated. */
  radius: number;
  /** Bomb speed in px/s. */
  speed: number;
  /** How far the bomb flies before it detonates on its own, in px; also the targeting range. */
  range: number;
  /** Speed cut applied to everything hit, 0–1. */
  slowPct: number;
  /** Seconds a slow lasts. */
  slowDuration: number;
  /** Chance per enemy hit of a full stop for `freezeDuration` s, 0–1. */
  freezeChance: number;
  /** Seconds a freeze lasts. */
  freezeDuration: number;
}

/**
 * Lightning Bolt (#142, Phase 2 spec §9.4): the element's default. Every
 * `cooldown` s, `strikes` bolts each hit the nearest enemy within `targetRange`
 * for `damage`, stagger it for `staggerDuration` and, on a `stunChance` roll,
 * stun it for `stunDuration`.
 */
export interface LightningStats {
  /** Seconds between casts. */
  cooldown: number;
  /** Damage the first target of a bolt takes. */
  damage: number;
  /** Bolts per cast, each starting at its own target where possible. */
  strikes: number;
  /** How far from the caster a bolt's first target may be picked, in px. */
  targetRange: number;
  /** Seconds a hit enemy is staggered (#139). */
  staggerDuration: number;
  /** Chance per enemy hit of a stun for `stunDuration` s, 0–1. */
  stunChance: number;
  /** Seconds a stun lasts. */
  stunDuration: number;
}

/**
 * Chain Lightning (spec §9.4): Lightning Bolt that jumps on. After its first
 * target a bolt chains up to `chains` times to the nearest unhit enemy within
 * `chainRange`, each chained hit paying `damage * chainFalloff`.
 */
export interface ChainLightningStats extends LightningStats {
  /** Extra enemies one bolt jumps to after its first target. */
  chains: number;
  /** How far a chain may jump, in px. */
  chainRange: number;
  /** Damage multiplier applied per chained hit; 1 is no falloff. */
  chainFalloff: number;
}

/**
 * Tornado (spec §9.4, #136): a ground area (`core/groundArea.ts`) that drifts
 * from the caster at `speed` px/s toward where its target stood, pulling every
 * enemy within `pullRadius` toward its eye at `pullForce` px/s and dealing
 * `tickDamage` every `tickRate` s to everything inside `radius`, for `duration`.
 */
export interface TornadoStats {
  /** Seconds between casts. */
  cooldown: number;
  /** Damage one tick deals to every enemy inside `radius`. */
  tickDamage: number;
  /** Seconds between two ticks. */
  tickRate: number;
  /** How far the damaging eye reaches from the centre, in px. */
  radius: number;
  /** How far the pull reaches from the centre, in px. */
  pullRadius: number;
  /** Pull velocity toward the centre, in px/s. */
  pullForce: number;
  /** Drift speed in px/s. */
  speed: number;
  /** How far from the caster a target may be picked, in px. */
  targetRange: number;
  /** Seconds the tornado lives. */
  duration: number;
}

/**
 * Lightning Sword (spec §9.4): `count` blades circle the caster on the
 * orbiting-body ring (`core/orbitingBoulders.ts`), each cutting an enemy it
 * passes for `damage` and a stagger, at most once per `hitCooldown` s per enemy.
 */
export interface SwordStats {
  /** Blades in orbit. */
  count: number;
  /** Orbit radius in px. */
  orbitRadius: number;
  /** Orbit angular speed in rad/s. */
  orbitSpeed: number;
  /** Damage one cut deals. */
  damage: number;
  /** Blade body radius in px. */
  size: number;
  /** Seconds between two cuts on the same enemy. */
  hitCooldown: number;
  /** Seconds a cut enemy is staggered (#139). */
  staggerDuration: number;
}

/**
 * Earth Spike (#143, Phase 2 spec §9.5): the element's default. Every
 * `cooldown` s a slow stone spike is flung at the nearest enemy within `range`
 * (#205). It strikes the first enemies it touches, up to `pierce` of them, for
 * `damage` and a light `knockback`, and each hit bleeds on a `bleedChance`
 * roll; one that misses flies on to its `range` and despawns.
 */
export interface EarthStats {
  /** Seconds between casts. */
  cooldown: number;
  /** Damage one strike deals. */
  damage: number;
  /** Flight speed in px/s. */
  speed: number;
  /** How far it flies before it despawns, in px; also the targeting range. */
  range: number;
  /** How many enemies one spike may strike in total (#206 raises it). */
  pierce: number;
  /** Knockback distance in px, away from the spike. */
  knockback: number;
  /** Bleed damage per second applied on a landed roll (#139). */
  bleed: number;
  /** Seconds that bleed lasts. */
  bleedDuration: number;
  /** Chance per strike, 0–1, that the hit bleeds. */
  bleedChance: number;
}

/**
 * Boulder (#143, spec §9.5): a heavy rolling projectile thrown at the nearest
 * enemy within `range`. It is not spent on its first hit — it strikes each
 * enemy it rolls over once for `damage` and a heavy `knockback`, until it has
 * struck `pierce` of them or has flown its `range`.
 */
export interface BoulderStats {
  /** Seconds between throws. */
  cooldown: number;
  /** Damage one strike deals. */
  damage: number;
  /** Boulder body radius in px. */
  radius: number;
  /** Roll speed in px/s. */
  speed: number;
  /** How far it rolls before it despawns, in px; also the targeting range. */
  range: number;
  /** Enemies one boulder may strike before it is spent. */
  pierce: number;
  /** Knockback distance in px, away from the boulder. */
  knockback: number;
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
  /** Lightning: seconds of stagger on hit (#139). */
  staggerDuration?: number;
}

/**
 * Ice Shield (#134, spec §9.3): an absorbing layer on the player that refills
 * on its own and shatters into the enemies around it.
 */
export interface IceShieldStats {
  /** The pool a full shield holds, in points of damage absorbed. */
  shieldHp: number;
  /** Seconds unhit before the pool refills, and how long a full refill takes. */
  rechargeDelay: number;
  /** Damage the shatter deals to everything inside `breakRadius`. */
  breakDamage: number;
  /** How far the shatter reaches, in px from the player. */
  breakRadius: number;
  /** Speed cut the shatter applies, 0-1. */
  slowPct: number;
  /** Seconds that slow lasts. */
  slowDuration: number;
}

/**
 * Earth Shield (#134, spec §9.5): Phase 1's orbiting ring plus a shared pool —
 * the stones absorb the player's damage, break at 0 and return after a delay.
 */
export interface EarthShieldStats {
  /** Stones in the ring. */
  count: number;
  /** Orbit radius in px. */
  orbitRadius: number;
  /** Orbit angular speed in rad/s. */
  orbitSpeed: number;
  /** Stone body radius in px. */
  size: number;
  /** Damage one stone deals to an enemy it rolls over. */
  damage: number;
  /** Knockback distance in px. */
  knockback: number;
  /** Seconds between two hits on the same enemy. */
  hitCooldown: number;
  /** The pool the whole ring shares, in points of damage absorbed. */
  shieldHp: number;
  /** Seconds the ring stays down after it breaks, and how long a refill takes. */
  rechargeDelay: number;
}

/**
 * A persistent ground area (#135, spec §9): Ice Storm and Earthquake both place
 * a patch that lives for `duration` and applies `tickDamage` plus its slow or
 * stagger every `tickRate` to whatever is standing in it. Ice Storm slows;
 * Earthquake staggers (#220) and carries no slow fields at all.
 */
export interface GroundAreaStats {
  /** Seconds between casts. */
  cooldown: number;
  /** Damage one tick deals to every enemy inside. */
  tickDamage: number;
  /** Seconds between two ticks. */
  tickRate: number;
  /** How far the patch reaches from its centre, in px. */
  radius: number;
  /** Seconds the patch stays on the ground. */
  duration: number;
  /** How far from the player a patch may be placed, in px. */
  targetRange: number;
  /** Speed cut a tick applies, 0-1; absent on a patch that does not slow. */
  slowPct?: number;
  /** Seconds that slow lasts. */
  slowDuration?: number;
  /**
   * Seconds each tick stops an enemy for, refreshed rather than stacked; capped
   * under the tick interval by `areaStaggerS` (#220). Absent on a patch that
   * does not stagger.
   */
  staggerDuration?: number;
}

/**
 * Meteor (#138; CO-167 rework spec §4): a strike committed to a ground point
 * near a target, falling for `fallDelay`, landing on the whole crowd within
 * `aoeRadius` with a blast that falls off toward the rim, and leaving a magma
 * pond that burns whatever stands in it.
 */
export interface MeteorStats {
  /** Seconds between casts. */
  cooldown: number;
  /** Damage the landing deals at its centre, scaled by `aoeDamageFactor`. */
  damage: number;
  /** How far the landing reaches from the committed point, in px. */
  aoeRadius: number;
  /** Landing damage as a fraction of `damage`; Meteor's is Big Blast's 1 always. */
  aoeDamageFactor: number;
  /** The share of the centre's damage the blast still deals at `aoeRadius`, 0-1. */
  aoeEdgeFactor: number;
  /** Strikes per cast. */
  projectiles: number;
  /** How far from the player a target may be picked, in px. */
  targetRange: number;
  /** Seconds between the cast and the landing — how long the meteor falls. */
  fallDelay: number;
  /** How far the pond reaches from the point, in px. */
  pondRadius: number;
  /** Seconds the pond stays on the ground. */
  pondDuration: number;
  /** Damage one pond tick deals to every enemy inside. */
  pondTickDamage: number;
  /** Seconds between two pond ticks. */
  pondTickRate: number;
}

/**
 * Fire Wave (CO-143, #218; spec §9.2): an `arc`° slice of flame with its tip
 * at the caster, aimed at the nearest enemy within `range`. Its rim grows
 * outward at `speed` to `range` and burns and nudges every enemy it sweeps
 * over, once per wave. The id stays `fire_column` (saved run counts key on it).
 */
export interface FireWaveStats {
  /** Seconds between casts. */
  cooldown: number;
  /** Damage one hit deals. */
  damage: number;
  /** Width of the slice, in degrees. */
  arc: number;
  /** Rim speed in px/s. */
  speed: number;
  /** How far the rim reaches before the wave ends, in px; also the targeting range. */
  range: number;
  /** Shove a hit gives, in px, straight away from the caster. */
  knockback: number;
  /** Burn damage per second applied on hit. */
  burn: number;
  /** Seconds that burn lasts. */
  burnDuration: number;
}

/**
 * Fire Dragon (#137, spec §9.2): a homing missile with heavy single-target
 * damage and a small splash, that expires after `duration` seconds of flight.
 */
export interface FireDragonStats {
  /** Seconds between casts. */
  cooldown: number;
  /** Damage on a direct hit. */
  damage: number;
  /** Splash radius in px. */
  aoeRadius: number;
  /** Splash damage as a fraction of `damage`. */
  aoeDamageFactor: number;
  /** Dragons per cast. */
  projectiles: number;
  /** Flight speed in px/s. */
  speed: number;
  /** How far from the caster a target may be picked, in px. */
  targetRange: number;
  /** Maximum turn rate while homing, in rad/s. */
  homingTurnRate: number;
  /** Seconds a dragon flies before it expires. */
  duration: number;
}

/** Which stat block each spell owns. */
export interface SpellStatsBySpell {
  fire: FireStats;
  ice: IceStats;
  ice_nova_bomb: NovaBombStats;
  lightning: LightningStats;
  lightning_chain: ChainLightningStats;
  lightning_tornado: TornadoStats;
  lightning_sword: SwordStats;
  earth: EarthStats;
  earth_boulder: BoulderStats;
  fire_companion: CompanionStats;
  ice_companion: CompanionStats;
  lightning_companion: CompanionStats;
  earth_companion: CompanionStats;
  ice_shield: IceShieldStats;
  earth_shield: EarthShieldStats;
  ice_blizzard: GroundAreaStats;
  earth_quake: GroundAreaStats;
  fire_meteor: MeteorStats;
  fire_column: FireWaveStats;
  fire_dragon: FireDragonStats;
}

/** Every id a `Spell` may carry: the Phase 1 four plus the Phase 2 spells that exist. */
export type StattedSpellId = keyof SpellStatsBySpell;

export type SpellStats = SpellStatsBySpell[StattedSpellId];
