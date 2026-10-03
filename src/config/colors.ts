/**
 * Placeholder look for every texture key (spec section 6).
 *
 * Pure data, no Phaser import, so it is unit-tested. `render/textures.ts`
 * turns each entry into a generated texture at boot; entities only ever ask
 * for a `TextureKey`, so swapping in real art touches nothing here but the
 * generator (see README "Swapping in a sprite atlas").
 */

export const TEXTURE_KEYS = [
  'player',
  'enemy_swarm',
  'enemy_fast',
  'enemy_tank',
  'enemy_ranged',
  'enemy_exploder',
  'enemy_splitter',
  'enemy_splitling',
  'enemy_shielded',
  'boss',
  'gem',
  'proj_fire',
  'fx_nova',
  'fx_bolt',
  'proj_bolt',
  'boulder',
  'companion',
  'proj_ice',
  'proj_nova_bomb',
  'proj_icicle',
  'proj_spike',
  'shield_ice',
  'fx_area',
  'fx_telegraph',
  'pickup_ember',
  'pickup_relic',
  'pickup_health',
  'pickup_magnet',
  'pickup_bomb',
  'pickup_chest',
  'proj_enemy',
] as const;

export type TextureKey = (typeof TEXTURE_KEYS)[number];

interface PlaceholderBase {
  /** 24-bit RGB, e.g. 0xff5252. */
  color: number;
  /** Generated texture size in pixels; the shape is centered and fills it. */
  width: number;
  height: number;
}

export type Placeholder = PlaceholderBase &
  ({ shape: 'circle' | 'rect' | 'triangle' | 'diamond' } | { shape: 'ring'; thickness: number });

export const PLACEHOLDERS: Readonly<Record<TextureKey, Placeholder>> = {
  player: { shape: 'circle', color: 0xf5f5f5, width: 28, height: 28 },
  enemy_swarm: { shape: 'circle', color: 0xff5252, width: 16, height: 16 },
  enemy_fast: { shape: 'triangle', color: 0xffb300, width: 20, height: 20 },
  enemy_tank: { shape: 'rect', color: 0x8e1b1b, width: 32, height: 32 },
  // #126: a diamond, the one enemy silhouette nothing else uses; with the atlas
  // it plays its own sheet (CO-104).
  enemy_ranged: { shape: 'diamond', color: 0xd84315, width: 22, height: 22 },
  // #126: the exploder a bright warning yellow-orange, the splitter a large
  // olive disc and its splitling a small one, so a child reads as its parent's.
  enemy_exploder: { shape: 'triangle', color: 0xffca28, width: 22, height: 22 },
  enemy_splitter: { shape: 'circle', color: 0x827717, width: 30, height: 30 },
  enemy_splitling: { shape: 'circle', color: 0xafb42b, width: 13, height: 13 },
  // #126: a bronze block, smaller than the tank's, for the shield it walks behind.
  enemy_shielded: { shape: 'rect', color: 0xc8923a, width: 26, height: 26 },
  boss: { shape: 'ring', color: 0x9c27b0, width: 80, height: 80, thickness: 10 },
  gem: { shape: 'diamond', color: 0x69f0ae, width: 12, height: 16 },
  proj_fire: { shape: 'circle', color: 0xff6d00, width: 12, height: 12 },
  fx_nova: { shape: 'ring', color: 0x40c4ff, width: 96, height: 96, thickness: 4 },
  fx_bolt: { shape: 'rect', color: 0xffee58, width: 48, height: 4 },
  // #202: Lightning Bolt in flight — a short diamond, so without the atlas it
  // still reads as a shot and never as Chain Lightning's `fx_bolt` strip.
  proj_bolt: { shape: 'diamond', color: 0xfff59d, width: 24, height: 10 },
  boulder: { shape: 'circle', color: 0x8d6e63, width: 20, height: 20 },
  // #133: one disc stands in for all four companions when there is no atlas;
  // with one, each plays its own sheet (#184). Green so an ally never reads as
  // an enemy at a glance.
  companion: { shape: 'circle', color: 0x64dd17, width: 24, height: 24 },
  // #133: the Ice Companion's bolt. Fire's shot is the only one with flight art
  // today, so the second element to shoot needs a look of its own or its bolts
  // read as fireballs; the sheet itself is #145.
  proj_ice: { shape: 'diamond', color: 0x80d8ff, width: 12, height: 12 },
  // CO-182: Frost Nova Bomb's rolling urchin and the icicles it throws. A disc
  // and a thin diamond in ice blues of their own (every key's colour is
  // distinct), so without the atlas the bomb still reads apart from Ice Arrow's
  // `proj_ice`; with it they wear `ice.urchin` and `ice.icicle`.
  proj_nova_bomb: { shape: 'circle', color: 0x29b6f6, width: 22, height: 22 },
  proj_icicle: { shape: 'diamond', color: 0xe1f5fe, width: 14, height: 6 },
  // #205: Earth Spike in flight — a long stone diamond, so it reads as a shot
  // and never as the round `boulder` disc. With the atlas it plays `earth.fly`
  // (CO-138); the body stays this disc's circle, round the shard's middle.
  proj_spike: { shape: 'diamond', color: 0xa1887f, width: 16, height: 8 },
  // #134: the Ice Shield's layer, drawn around the player. Since #406 the
  // shield is a ring of diamonds and nothing draws this key: the HUD reads its
  // colour for the shield bar.
  shield_ice: { shape: 'ring', color: 0xb3e5fc, width: 44, height: 44, thickness: 3 },
  // #135: a persistent ground area, drawn at `areaScale` of this size so the
  // ring outlines exactly the patch that ticks. An area spell keeps it as the
  // outline over its own art (#179), one whose art has not landed draws it
  // alone, and Ice Storm hides it for its sleet while the atlas is loaded
  // (#219). A ring, so the crowd inside stays visible.
  fx_area: { shape: 'ring', color: 0x90a4ae, width: 200, height: 200, thickness: 3 },
  // #138: where a sky strike will land, drawn at `telegraphScale` of this size
  // so the ring outlines exactly the blast that is coming. Fire's orange and a
  // heavier stroke than the area ring, so it reads as a warning over a full
  // crowd rather than as another patch; its own art is #145.
  fx_telegraph: { shape: 'ring', color: 0xff8a65, width: 200, height: 200, thickness: 6 },
  // #195: the floor pickups, placeholders until their art lands. None is a
  // diamond, so nothing on the floor reads as a gem. An Ember is a small amber
  // point and a relic a large gold ring — the biggest thing on the floor, since
  // the player walks across the arena for it.
  pickup_ember: { shape: 'triangle', color: 0xffab40, width: 12, height: 14 },
  pickup_relic: { shape: 'ring', color: 0xffd740, width: 36, height: 36, thickness: 7 },
  // #128: a consumable per kind, so the player can tell at a glance which one
  // is worth the walk. Health a pink square, the magnet a blue ring, the bomb
  // a violet disc, and a chest a wide amber block.
  pickup_health: { shape: 'rect', color: 0xf50057, width: 14, height: 14 },
  pickup_magnet: { shape: 'ring', color: 0x448aff, width: 20, height: 20, thickness: 4 },
  pickup_bomb: { shape: 'circle', color: 0xd500f9, width: 14, height: 14 },
  pickup_chest: { shape: 'rect', color: 0xffc400, width: 20, height: 14 },
  // #126: a ranged enemy's shot, the thing to dodge. Magenta, a hue none of
  // the player's own shots use (fire's orange, ice's blue, lightning's yellow,
  // earth's brown), and a thick ring where theirs are discs and diamonds, so
  // the two never read alike (`colors.test.ts` holds the hue gap). With the
  // atlas it plays the pink glob of CO-104's shot sheet, in the same hue.
  proj_enemy: { shape: 'ring', color: 0xff00d4, width: 12, height: 12, thickness: 4 },
};
