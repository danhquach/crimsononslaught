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

import { buildIconFrame } from './buildIcons';
import type { TextureKey } from './colors';
import type { FrameName } from './frames';
import { ROSTER_SPELL_IDS } from './loadout';
import { PASSIVES } from './passives';
import { RELIC_BUFFS } from './relics';

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
  // Hero dash pose (CO-218): lean, burst, recover over the 150 ms dash. The
  // smoke is a separate sheet so a dash spell can swap it without the hero.
  ...facings('hero.dash', 3, 20, ONCE),
  spec('dash.burst', 4, 14, ONCE),
  spec('dash.wisp', 4, 10, ONCE),

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

  // Ranged enemy (CO-104, #126), authored facing right; the engine mirrors it
  // to face the player. Its shot is drawn flying right and turned to its heading.
  spec('ranged.move', 4, 8, LOOP),
  spec('ranged.hurt', 1, 10, ONCE),
  spec('ranged.death', 4, 12, ONCE),
  spec('ranged.spawn', 4, 10, ONCE),
  spec('ranged.shot', 4, 12, LOOP),

  // Exploder, splitter and its splitling (CO-104, #126), each authored facing
  // right and mirrored to face left. The exploder's death is its own burst;
  // the blast's `fire.explode` plays over it at the blast's size.
  spec('exploder.move', 4, 10, LOOP),
  spec('exploder.hurt', 1, 10, ONCE),
  spec('exploder.death', 4, 12, ONCE),
  spec('exploder.spawn', 4, 10, ONCE),
  spec('splitter.move', 4, 6, LOOP),
  spec('splitter.hurt', 1, 10, ONCE),
  spec('splitter.death', 4, 12, ONCE),
  spec('splitter.spawn', 4, 8, ONCE),
  spec('splitling.move', 4, 10, LOOP),
  spec('splitling.hurt', 1, 10, ONCE),
  spec('splitling.death', 4, 12, ONCE),
  spec('splitling.spawn', 4, 12, ONCE),

  // Shielded enemy (CO-104, #126): walks and flinches facing down, up and
  // right, and mirrors right to face left; the shield is on the side it faces.
  // Its death and spawn share the sheet's last row, three frames each.
  spec('shielded.walk.down', 4, 6, LOOP),
  spec('shielded.walk.up', 4, 6, LOOP),
  spec('shielded.walk.right', 4, 6, LOOP),
  spec('shielded.hurt.down', 1, 10, ONCE),
  spec('shielded.hurt.up', 1, 10, ONCE),
  spec('shielded.hurt.right', 1, 10, ONCE),
  spec('shielded.death', 3, 8, ONCE),
  spec('shielded.spawn', 3, 8, ONCE),

  // Boss (CO-074). Telegraph and charge are paced to the 0.8 s / 0.6 s phases
  // in `boss.ts`, so the art lands with the state change rather than drifting.
  ...facings('boss.walk', 4, 6, LOOP),
  ...facings('boss.telegraph', 2, 2.5, LOOP),
  ...facings('boss.charge', 2, 3.3, LOOP),
  ...facings('boss.hurt', 1, 10, ONCE),
  spec('boss.death', 8, 8, ONCE),
  // #388: the enrage ember ring loops under the boss; the burst plays once as it turns.
  spec('boss.enrageAura', 4, 8, LOOP),
  spec('boss.enrageBurst', 4, 12, ONCE),
  // CO-222: the Ground slam, paced to its 1.0 s wind-up and 0.4 s impact; the
  // poses hold their last frame. The warning disc and rim loop under the boss
  // through the wind-up, and the shockwave plays once on the slam.
  ...facings('boss.slamWindup', 2, 2, ONCE),
  ...facings('boss.slam', 2, 5, ONCE),
  spec('boss.slamWarnRim', 4, 8, LOOP),
  spec('boss.slamWarnFill', 4, 8, LOOP),
  spec('boss.slamShock', 4, 10, ONCE),
  // CO-223: the Bolt volley, paced to its 1.2 s wind-up (3 frames at 2.5 fps, holding
  // the last, the orbs at their biggest) and 0.5 s release (the one flaring frame
  // held). The bolt loops while it flies and its burst plays once where it ends.
  ...facings('boss.volleyWindup', 3, 2.5, ONCE),
  ...facings('boss.volley', 1, 2, ONCE),
  spec('boss.bolt', 4, 10, LOOP),
  spec('boss.boltHit', 4, 14, ONCE),
  // CO-224: the Summon, paced to its 1.0 s wind-up (3 frames at 3 fps, holding the last,
  // the sigil at its brightest) and a held flaring frame for the release. The circle
  // loops under each pack spawn point and its burst plays once as the pack appears.
  ...facings('boss.summonWindup', 3, 3, ONCE),
  ...facings('boss.summon', 1, 2, ONCE),
  spec('boss.summonCircle', 4, 6, LOOP),
  spec('boss.summonBurst', 4, 10, ONCE),

  // XP gem (CO-075).
  spec('gem.idle', 4, 6, LOOP),
  spec('gem.drift', 2, 8, LOOP),
  spec('gem.pickup', 4, 15, ONCE),

  // Fire spell (CO-076).
  spec('fire.fly', 4, 12, LOOP),
  // Fireball's own flight (CO-153); `fire.fly` stays the companion's shot.
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
  // frames at 4 fps is one pulse per fall. Nothing draws it since CO-167 put
  // the falling body in its place; it stays in the atlas until a cleanup.
  spec('fire.meteorMark', 4, 4, LOOP),
  spec('fire.meteor', 4, 12, LOOP),
  // Meteor's magma pond (CO-167): a slow simmer, looped for the pond's life.
  spec('fire.pond', 4, 6, LOOP),
  // Fire Wave's burnt ground (CO-200): four static soot variants, never played; a piece picks one frame.
  spec('fire.scorch', 4, 1, ONCE),
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
  // Frost Nova Bomb (CO-182): the ice urchin that rolls and the icicle it
  // throws, both stills (the engine spins the one and turns the other along
  // its flight), and the burst: a frost ring whose spikes rise and shatter.
  // Ice Shield still bursts with `ice.nova`.
  spec('ice.urchin', 1, 1, LOOP),
  spec('ice.icicle', 1, 1, LOOP),
  spec('ice.spikeRing', 6, 15, ONCE),

  spec('lightning.tornado', 4, 10, LOOP),
  spec('lightning.sword', 4, 12, LOOP),

  // Earth Spike's eruption (CO-123). The spike became a flying shot (#205,
  // `earth.fly`); Earthquake's level 3 Aftershock draws this burst (#330).
  spec('earth.spike', 5, 15, ONCE),
  spec('earth.shield', 4, 6, LOOP),
  spec('earth.shieldBreak', 4, 15, ONCE),
  // Earthquake (CO-145, #220): a star of fissures with amber deep inside and
  // no rim, rumbling in place. `earth.quake` above, a cracked disc inside a
  // rock ring, is no longer drawn by the spell and is kept for later.
  spec('earth.quake', 4, 8, LOOP),
  spec('earth.quakeRift', 4, 8, LOOP),
  // The Boulder's Landslide rut (CO-203): four static variants of one band of broken ground, never played; a tile picks one frame.
  spec('earth.rut', 4, 1, ONCE),

  // Cross-element status overlays (#139): bleed and stagger are applied by
  // spells of any element, so they hang off `status` rather than off the
  // element that happened to land the hit. Stagger plays at `lightning.stun`'s
  // rate, the overlay it replaces. Bleed plays at `fire.burn`'s rate, the
  // overlay it used to borrow.
  spec('status.stagger', 4, 10, LOOP),
  spec('status.bleed', 4, 8, LOOP),
  // The mark under an elite (#126): a rune circle that shimmers slowly, so it
  // reads as a marker on the floor rather than an effect going off.
  spec('status.elite', 4, 6, LOOP),

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
  // HUD dash icon (CO-218), drawn by HudScene beside the minimap.
  spec('icon.dash', 1, 1, ONCE),
  // The shield popped over the boss when it shrugs off a stun or freeze (CO-221), drawn by GameScene straight from the atlas, never played.
  spec('status.immune', 1, 1, ONCE),

  // Pause screen build icons (CO-179): one still per passive and relic buff,
  // drawn by PauseScene straight from the atlas, never played. A buff with no
  // icon art yet has no clip; its tile keeps its two letters.
  ...[...PASSIVES, ...RELIC_BUFFS]
    .filter(({ id }) => buildIconFrame(id) !== undefined)
    .map(({ id }) => spec(`icon.${id}`, 1, 1, ONCE)),

  // HUD bar frames and their end marks (CO-156): stills, never played; each
  // frame is cut into caps and a middle by `render/barFrame.ts`. The shield
  // bar's art is no longer drawn (CO-195) but stays on its page, so dropping it
  // would re-quantise the page's palette.
  ...(['hp', 'shield', 'xp', 'boss'] as const).flatMap((bar) => [
    spec(`hud.${bar}Frame`, 1, 1, ONCE),
    spec(`hud.${bar}Mark`, 1, 1, ONCE),
  ]),

  // The boss bar's break (#387): the glass cracks across the tube and shards
  // burst off it, each played once by HudScene's BossFx over the code flash.
  spec('hud.bossCrack', 4, 16, ONCE),
  spec('hud.bossShards', 4, 14, ONCE),
  // #388: the flames along the top of the boss bar while it is enraged; one 8-frame loop.
  spec('hud.bossFlames', 8, 10, LOOP),
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
  enemy_ranged: 'ranged.move.0',
  enemy_exploder: 'exploder.move.0',
  enemy_splitter: 'splitter.move.0',
  enemy_splitling: 'splitling.move.0',
  enemy_shielded: 'shielded.walk.down.0',
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
  // CO-182: Frost Nova Bomb's urchin and its icicle, the icicle drawn flying right.
  proj_nova_bomb: 'ice.urchin.0',
  proj_icicle: 'ice.icicle.0',
  shield_ice: 'ice.shield.0',
  fx_telegraph: 'fire.meteorMark.0',
  // CO-106: the floor pickups, each cut to its placeholder's size.
  pickup_ember: 'pickupEmber.idle.0',
  pickup_relic: 'pickupRelic.idle.0',
  pickup_health: 'pickupHealth.idle.0',
  pickup_magnet: 'pickupMagnet.idle.0',
  pickup_bomb: 'pickupBomb.idle.0',
  pickup_chest: 'pickupChest.idle.0',
  // #126: the ranged enemy's shot, the pink glob drawn flying right.
  proj_enemy: 'ranged.shot.0',
};
