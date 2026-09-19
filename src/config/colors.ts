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
  'boss',
  'gem',
  'proj_fire',
  'fx_nova',
  'fx_bolt',
  'boulder',
  'companion',
  'proj_ice',
  'shield_ice',
  'fx_area',
  'fx_telegraph',
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
  boss: { shape: 'ring', color: 0x9c27b0, width: 80, height: 80, thickness: 10 },
  gem: { shape: 'diamond', color: 0x69f0ae, width: 12, height: 16 },
  proj_fire: { shape: 'circle', color: 0xff6d00, width: 12, height: 12 },
  fx_nova: { shape: 'ring', color: 0x40c4ff, width: 96, height: 96, thickness: 4 },
  fx_bolt: { shape: 'rect', color: 0xffee58, width: 48, height: 4 },
  boulder: { shape: 'circle', color: 0x8d6e63, width: 20, height: 20 },
  // #133: one disc stands in for all four companions until their character
  // sheets land (#146). Green so an ally never reads as an enemy at a glance.
  companion: { shape: 'circle', color: 0x64dd17, width: 24, height: 24 },
  // #133: the Ice Companion's bolt. Fire's shot is the only one with flight art
  // today, so the second element to shoot needs a look of its own or its bolts
  // read as fireballs; the sheet itself is #145.
  proj_ice: { shape: 'diamond', color: 0x80d8ff, width: 12, height: 12 },
  // #134: the Ice Shield's layer, drawn around the player. A ring rather
  // than a disc so the hero is still visible through it; its own art is #145.
  shield_ice: { shape: 'ring', color: 0xb3e5fc, width: 44, height: 44, thickness: 3 },
  // #135: a persistent ground area, drawn at `areaScale` of this size so the
  // ring outlines exactly the patch that ticks. One placeholder for Blizzard
  // and Earthquake alike — the same call the companions' shared disc makes —
  // until their own art lands (#145). A ring, so the crowd inside stays visible.
  fx_area: { shape: 'ring', color: 0x90a4ae, width: 200, height: 200, thickness: 3 },
  // #138: where a sky strike will land, drawn at `telegraphScale` of this size
  // so the ring outlines exactly the blast that is coming. Fire's orange and a
  // heavier stroke than the area ring, so it reads as a warning over a full
  // crowd rather than as another patch; its own art is #145.
  fx_telegraph: { shape: 'ring', color: 0xff8a65, width: 200, height: 200, thickness: 6 },
};
