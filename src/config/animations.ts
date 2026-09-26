/**
 * Every animation in the atlas, as pure data (spec §6, CO-080).
 *
 * No Phaser import, so this is unit-tested against the generated `frames.ts`
 * and the sheet manifest. `BootScene` walks this list once and registers each
 * entry with the animation manager; nothing else needs to know frame names.
 *
 * Frame order is explicit rather than a column range because a sheet's drawing
 * order is not always its playing order — the swarm's spawn has the hole it
 * climbs out of drawn in the last cell.
 */

import type { TextureKey } from './colors';
import type { FrameName } from './frames';
import { ROSTER_SPELL_IDS } from './loadout';

export interface AnimationSpec {
  /** Animation key, matching the frame prefix, e.g. `hero.walk.down`. */
  name: string;
  /** Atlas frames in play order. */
  frames: FrameName[];
  frameRate: number;
  /** -1 loops forever, 0 plays once and stops on the last frame. */
  repeat: number;
}

/**
 * `count` frames of `name`, numbered from 0, in drawn order. `order` overrides
 * that with explicit frame indices where the sheet was drawn out of sequence.
 */
function spec(
  name: string,
  count: number,
  frameRate: number,
  repeat: number,
  order?: number[],
): AnimationSpec {
  const indices = order ?? Array.from({ length: count }, (_, i) => i);
  return {
    name,
    frames: indices.map((i) => `${name}.${i}` as FrameName),
    frameRate,
    repeat,
  };
}

const LOOP = -1;
const ONCE = 0;

export const FACINGS = ['down', 'up', 'left', 'right'] as const;

/** The four directions a character sheet is drawn in. */
export type Facing = (typeof FACINGS)[number];

/** The same animation in all four facings, which every character sheet has. */
function facings(
  prefix: string,
  count: number,
  frameRate: number,
  repeat: number,
): AnimationSpec[] {
  return FACINGS.map((f) => spec(`${prefix}.${f}`, count, frameRate, repeat));
}

export const ANIMATIONS: readonly AnimationSpec[] = [
  // Hero (CO-070). Every facing is drawn, including right: the prompts asked
  // for it explicitly so the staff stays in the same hand, which a mirrored
  // frame would not do.
  ...facings('hero.idle', 2, 4, LOOP),
  ...facings('hero.walk', 4, 8, LOOP),
  ...facings('hero.hurt', 1, 10, ONCE),
  spec('hero.death', 6, 8, ONCE),

  // Swarm enemy (CO-071). Spawn is drawn hole-last, so it plays 3, 0, 1, 2.
  spec('swarm.move', 4, 8, LOOP),
  spec('swarm.hurt', 1, 10, ONCE),
  spec('swarm.death', 4, 12, ONCE),
  spec('swarm.spawn', 4, 10, ONCE, [3, 0, 1, 2]),

  // Fast enemy (CO-072), authored facing up; the engine rotates it.
  spec('fast.move', 4, 12, LOOP),
  spec('fast.hurt', 1, 10, ONCE),
  spec('fast.death', 4, 12, ONCE),
  spec('fast.spawn', 4, 12, ONCE),

  // Tank enemy (CO-073).
  ...facings('tank.walk', 4, 6, LOOP),
  ...facings('tank.hurt', 1, 10, ONCE),
  spec('tank.death', 6, 8, ONCE),
  spec('tank.spawn', 4, 8, ONCE),

  // Boss (CO-074). Telegraph and charge are paced to the 0.8 s / 0.6 s phases
  // in `boss.ts`, so the art lands with the state change rather than drifting.
  ...facings('boss.walk', 4, 6, LOOP),
  ...facings('boss.telegraph', 2, 2.5, LOOP),
  ...facings('boss.charge', 2, 3.3, LOOP),
  ...facings('boss.hurt', 1, 10, ONCE),
  spec('boss.death', 8, 8, ONCE),

  // XP gem (CO-075).
  spec('gem.idle', 4, 6, LOOP),
  spec('gem.drift', 2, 8, LOOP),
  spec('gem.pickup', 4, 15, ONCE),

  // Fire spell (CO-076).
  spec('fire.fly', 4, 12, LOOP),
  // Fireball's own flight (CO-153); `fire.fly` stays the dragon's and the companion's shot.
  spec('fire.ball', 4, 12, LOOP),
  spec('fire.spawn', 4, 15, ONCE),
  spec('fire.explode', 6, 15, ONCE),
  spec('fire.burn', 4, 8, LOOP),
  spec('fire.burnBig', 4, 8, LOOP),

  // Ice spell (CO-077).
  spec('ice.nova', 6, 15, ONCE),
  spec('ice.slow', 4, 6, LOOP),
  spec('ice.freeze', 3, 6, ONCE),
  spec('ice.shatter', 5, 12, ONCE),

  // Lightning spell (CO-078).
  spec('lightning.strike', 4, 20, ONCE),
  spec('lightning.impact', 4, 20, ONCE),
  spec('lightning.chain', 4, 20, LOOP),
  spec('lightning.stun', 4, 10, LOOP),
  // Lightning Bolt in flight (CO-137, #202): its own shot, not the chain strip.
  spec('lightning.bolt', 4, 20, LOOP),

  // Earth spell (CO-079).
  spec('earth.spin', 6, 12, LOOP),
  // Ember rock burst (CO-146): four frames, at 12 fps so it lasts as long as
  // the five-frame burst it replaced.
  spec('earth.impact', 4, 12, ONCE),
  spec('earth.dust', 5, 12, ONCE),
  // Earth Spike in flight (CO-138, #205): the stone shard drawn flying right,
  // its chips trailing; turned along its flight by `entities/Projectile.ts`.
  spec('earth.fly', 4, 10, LOOP),

  // Phase 2 spell FX (CO-123, #145). Every spell the Phase 2 roster added that
  // does not reuse a Phase 1 clip; what each one reuses instead is listed in
  // `docs/art/prompts/CO-123-spell-fx.md`.
  //
  // Meteor's mark is paced to the 1 s `fallDelay` in `config/strikes.ts`: four
  // frames at 4 fps is one pulse per fall, so the ring finishes its cycle as
  // the meteor lands rather than cutting off mid-pulse.
  spec('fire.meteorMark', 4, 4, LOOP),
  spec('fire.meteor', 4, 12, LOOP),
  // Fire Column's body and hit (CO-123). No spell draws them since Fire Wave
  // replaced the column (CO-143, #218): they are kept as a reserved background
  // prop for later, not a spell body.
  spec('fire.column', 4, 12, LOOP),
  spec('fire.columnHit', 4, 15, ONCE),
  // Fire Wave's flame front (CO-143, #218): the curved rim, drawn bulging
  // right and turned toward the wave's heading by `spells/FireWaveSpell.ts`.
  spec('fire.wave', 4, 12, LOOP),
  spec('fire.dragon', 4, 8, LOOP),

  spec('ice.arrow', 4, 12, LOOP),
  spec('ice.arrowHit', 4, 15, ONCE),
  spec('ice.bomb', 4, 8, LOOP),
  spec('ice.shield', 4, 6, LOOP),
  spec('ice.shieldBreak', 4, 15, ONCE),
  spec('ice.blizzard', 4, 8, LOOP),
  // Ice Storm (CO-144, #219): four sleet pieces, each drawn flying right and
  // turned along its fall, picked at random rather than played in order; and
  // a shard falling and shattering, the splash where the ice hits the ground.
  // `ice.blizzard` above is no longer drawn by the spell and is kept for later.
  spec('ice.stormSleet', 4, 1, LOOP),
  spec('ice.stormShard', 4, 12, ONCE),

  spec('lightning.tornado', 4, 10, LOOP),
  spec('lightning.sword', 4, 12, LOOP),

  // Earth Spike's eruption (CO-123). No spell draws it since the spike became
  // a flying shot (#205, `earth.fly`); it is kept for later.
  spec('earth.spike', 5, 15, ONCE),
  spec('earth.shield', 4, 6, LOOP),
  spec('earth.shieldBreak', 4, 15, ONCE),
  // Earthquake (CO-145, #220): a star of fissures with amber deep inside and
  // no rim, rumbling in place. `earth.quake` above, a cracked disc inside a
  // rock ring, is no longer drawn by the spell and is kept for later.
  spec('earth.quake', 4, 8, LOOP),
  spec('earth.quakeRift', 4, 8, LOOP),

  // Cross-element status overlays (#139): bleed and stagger are applied by
  // spells of any element, so they hang off `status` rather than off the
  // element that happened to land the hit. Stagger plays at `lightning.stun`'s
  // rate, the overlay it replaces. Bleed plays at `fire.burn`'s rate, the
  // overlay it used to borrow.
  spec('status.stagger', 4, 10, LOOP),
  spec('status.bleed', 4, 8, LOOP),

  // Companions (CO-124). Four elemental creatures on the hero's own sheet
  // layout, so `facings` applies unchanged. Move runs at the hero's walk rate
  // even though each companion chases at its own speed, because they all sit
  // near the player's 180 px/s and a per-element rate would only make the
  // slowest of them skate. Attack is four frames at 10, so the swing lands in
  // 0.4 s and finishes inside every companion's cooldown — the shortest is
  // Lightning's 0.8 s (`config/companions.ts`).
  //
  // Lightning's left and right are drawn in the reverse order to every other
  // sheet; the manifest labels its rows to match the art, so nothing here has
  // to know about it.
  ...facings('companionFire.idle', 2, 4, LOOP),
  ...facings('companionFire.move', 4, 8, LOOP),
  ...facings('companionFire.attack', 4, 10, ONCE),
  ...facings('companionIce.idle', 2, 4, LOOP),
  ...facings('companionIce.move', 4, 8, LOOP),
  ...facings('companionIce.attack', 4, 10, ONCE),
  ...facings('companionLightning.idle', 2, 4, LOOP),
  ...facings('companionLightning.move', 4, 8, LOOP),
  ...facings('companionLightning.attack', 4, 10, ONCE),
  ...facings('companionEarth.idle', 2, 4, LOOP),
  ...facings('companionEarth.move', 4, 8, LOOP),
  ...facings('companionEarth.attack', 4, 10, ONCE),

  // Floor pickups (CO-106, #128). The gem's pacing: an idle that loops while
  // the pickup lies there or drifts in, and a burst where it was taken. The
  // Ember's burst is three frames: its fourth cell was faint sparks that the
  // alpha threshold clears.
  spec('pickupHealth.idle', 4, 6, LOOP),
  spec('pickupHealth.pickup', 4, 15, ONCE),
  spec('pickupMagnet.idle', 4, 6, LOOP),
  spec('pickupMagnet.pickup', 4, 15, ONCE),
  spec('pickupBomb.idle', 4, 6, LOOP),
  spec('pickupBomb.pickup', 4, 15, ONCE),
  spec('pickupChest.idle', 4, 6, LOOP),
  spec('pickupChest.pickup', 4, 15, ONCE),
  spec('pickupEmber.idle', 4, 6, LOOP),
  spec('pickupEmber.pickup', 3, 15, ONCE),
  spec('pickupRelic.idle', 4, 6, LOOP),
  spec('pickupRelic.pickup', 4, 15, ONCE),

  // Arena dressing (CO-098, #120). Still frames, never played: each is a
  // one-frame clip so the atlas ships no frame outside an animation.
  spec('arena.ground', 1, 1, ONCE),
  spec('arena.edge', 1, 1, ONCE),
  spec('arena.rocks', 1, 1, ONCE),
  spec('arena.rubble', 1, 1, ONCE),
  spec('arena.bones', 1, 1, ONCE),
  spec('arena.tree', 1, 1, ONCE),
  spec('arena.pillar', 1, 1, ONCE),
  spec('arena.column', 1, 1, ONCE),
  spec('arena.gravestone', 1, 1, ONCE),
  spec('arena.bush', 1, 1, ONCE),

  // HUD slot icons (CO-154): one still per roster spell, drawn by HudScene
  // straight from the atlas, never played.
  ...ROSTER_SPELL_IDS.map((id) => spec(`icon.${id}`, 1, 1, ONCE)),

  // HUD bar frames and their end marks (CO-156): stills, never played; each
  // frame is cut into caps and a middle by `render/barFrame.ts`.
  ...(['hp', 'shield', 'xp', 'boss'] as const).flatMap((bar) => [
    spec(`hud.${bar}Frame`, 1, 1, ONCE),
    spec(`hud.${bar}Mark`, 1, 1, ONCE),
  ]),
];

/**
 * The still frame each texture key with art resolves to.
 *
 * Entities ask for a `TextureKey` and anything that draws a static image keeps
 * working unchanged (spec §6): the key maps to the first idle or move frame of
 * the matching object instead of to a generated placeholder.
 *
 * Partial on purpose (Phase 2 §10): a spell registers its texture key and
 * placeholder colour on the day it lands, and the sheet follows in its own art
 * ticket. A key missing here keeps the generated placeholder, so the entity
 * draws either way and nothing has to wait on art. `companion` is missing on
 * purpose: it is only the disc a companion falls back to without an atlas.
 * With one, each companion plays its own sheet's clips by prefix (#184,
 * `COMPANION_FX`), which one shared key could not do.
 */
export const STATIC_FRAMES: Readonly<Partial<Record<TextureKey, FrameName>>> = {
  player: 'hero.idle.down.0',
  enemy_swarm: 'swarm.move.0',
  enemy_fast: 'fast.move.0',
  enemy_tank: 'tank.walk.down.0',
  boss: 'boss.walk.down.0',
  gem: 'gem.idle.0',
  proj_fire: 'fire.fly.0',
  fx_nova: 'ice.nova.0',
  // The chain segment, not the strike: this is the piece the engine stretches
  // between two enemies.
  fx_bolt: 'lightning.chain.0',
  // #202: Lightning Bolt's shot, the head-and-tail bolt drawn flying right.
  proj_bolt: 'lightning.bolt.0',
  boulder: 'earth.spin.0',
  // #205: Earth Spike's shot, the shard drawn flying right.
  proj_spike: 'earth.fly.0',
  // #145. The ice bolt's flight art, the ice shield's layer, the strike
  // telegraph; each cut to the size of the placeholder it replaces, so the
  // sprites the spells already build keep the size they were tuned at
  // (`docs/art/sheets/manifest.json` `sheetCell`).
  proj_ice: 'ice.arrow.0',
  shield_ice: 'ice.shield.0',
  fx_telegraph: 'fire.meteorMark.0',
  // CO-106: the floor pickups, each cut to its placeholder's size.
  pickup_ember: 'pickupEmber.idle.0',
  pickup_relic: 'pickupRelic.idle.0',
  pickup_health: 'pickupHealth.idle.0',
  pickup_magnet: 'pickupMagnet.idle.0',
  pickup_bomb: 'pickupBomb.idle.0',
  pickup_chest: 'pickupChest.idle.0',
};
