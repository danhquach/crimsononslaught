/**
 * The main-menu art (CO-191): painted images that are not in the atlas, each
 * its own file under `public/assets/menu/`, prepared by `npm run art:menu`
 * from the sources in `docs/art/sheets/CO-191/`. The layout numbers were read
 * off the shipped files; `scripts/lib/menuArt.test.mjs` checks them.
 */
export const MENU_ART = {
  /** The whole-canvas background painting. */
  bg: { key: 'menu.bg', url: 'assets/menu/menu_bg.jpg' },
  /**
   * The row plate, two frames stacked in one image: at rest on top, lit below.
   * The caps are drawn unscaled and the plain middle between them stretches.
   */
  plate: {
    key: 'menu.plate',
    url: 'assets/menu/menu_plate.png',
    width: 317,
    height: 38,
    capLeft: 32,
    capRight: 32,
  },
  /** Four ember flicker frames side by side, on pure black for an additive blend. */
  ember: { key: 'menu.ember', url: 'assets/menu/menu_ember.png', size: 16, frames: 4 },
  /**
   * The two-line painted title with its shadow and glow baked in; the letters
   * are 205 px tall inside a 27 px margin. The face below is the fallback and
   * the plates' label face.
   */
  title: { key: 'menu.title', url: 'assets/menu/menu_title.png', width: 434, height: 259 },
  /** The label face: Grenze Gotisch, weight 900, self-hosted (SIL OFL, see `OFL.txt`). */
  font: { family: 'GrenzeGotisch', url: 'assets/fonts/GrenzeGotisch-900.woff2' },
} as const;
