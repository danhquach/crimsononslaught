# CO-191 Art: main menu background, plates and embers

Ticket: [#318](https://github.com/danhquach/crimsononslaught/issues/318)

The main menu was a black screen with a red serif title and grey text buttons. This ticket gives it a painted look and brings every other menu screen to the game's style. The look is concept A of three: a ruined colosseum at dusk under a crimson sky with drifting embers, the title in heavy blackletter with a red glow, and four stacked dark-iron plates with crimson trim. The lit plate has a brighter crimson trim and a small arrow marker on its left.

Unlike the sprite sheets, these pieces are painted, not pixel art, and they are not cut into the atlas. The cutter's 4x nearest-neighbour shrink would make them chunky, and quantising an atlas page to 256 colours would move every other frame on it. Each piece ships as its own image under `public/assets/menu/`, made from the sources in `docs/art/sheets/CO-191/` by one script, `npm run art:menu` (`scripts/prep-menu-art.mjs`, helpers in `scripts/lib/menuArt.mjs`). The script is safe to re-run: it overwrites the three outputs, and it strips the four sources of their metadata segments (JPEG APP1, the Exif block where the generator wrote its prompt, and APP11, C2PA / JUMBF content credentials). Only whole header segments are removed. The script hashes the scan data (SOS to the end of the file) before and after and refuses to write if it changed; `menuArt.test.mjs` keeps the delivered hashes.

Pieces: four images from the AI generator, the concept picture that chose the look, and the label face. The text on the plates is drawn by the game, so the plate art has no lettering. The title is painted: lettering set in a font looked much worse than the concept, so the title was reproduced from concept A instead.

## 1. `menu_bg_source.jpg`: the background

Save as `docs/art/sheets/CO-191/menu_bg_source.jpg`.

Delivered as: JPEG 1536x864 px from `openai/gpt-image-2`, made by feeding concept A back in and asking for the same scene repainted as a clean background with every piece of lettering, plate, button and arrow removed. It kept the arena, the broken arches on both sides, the clouded crimson sky and the rune circle on the floor, and came back with no text. The centre column is a little darker than the concept, so the title and plates read on it.

Prep: area-averaged to exactly 960 x 540 (a 1.6x shrink, fractional edges weighted by coverage), written as a JPEG at quality 85. Output `public/assets/menu/menu_bg.jpg`, 960x540, about 97 KB (budget 200 KB). Every menu screen draws it; the full-scene screen (Intro) shows it as is, the others lay a black veil at 0.6 alpha over it, because the Canvas renderer has no tint.

## 2. `menu_plates_source.jpg`: the menu plate

Save as `docs/art/sheets/CO-191/menu_plates_source.jpg`.

Delivered as: JPEG 1152x576 px from `openai/gpt-image-2` (asked 1024x512), with concept A attached as the style reference. Two empty plates on flat magenta `#FF00FF`, stacked: the plate at rest on top and the same plate lit below. Each is a long bar of blackened iron with a thin crimson trim line inside its edge and a pointed cap at each end with a small ornament; between the caps the face is plain, so it can stretch. The JPEG left a purple and pink fringe on the plate edges.

Prep, in `prepPlates`:

1. Key the magenta to alpha with the house rule (`b > 0.8r && g < 0.6r && r > 140`). The hot-pink fringe (`b > g + 20` on a bright pixel) is keyed too, but only within 3 px of the key: the rest plate's dull crimson trim passes the same test, and followed further the fringe ate the trim line from the tip inward.
2. Find each plate by its bounding box, take the union width and the taller height so both share one box, and pull the box in 2 px top and bottom, where the outermost source rows are all JPEG fringe.
3. Area-average each to a third of the size (about 317 x 38), averaging colour over the opaque part only so no magenta bleeds back, then cap any remaining magenta tint on the dark rim at 6.
4. Stack the two frames in one image: `public/assets/menu/menu_plate.png`, 317x76, RGBA, with only the IHDR, IDAT and IEND chunks. The rest frame is at y 0 and the lit frame at y 38. The lit plate's red glow survives the key.

Caps, measured off the shipped art: the change from one column to the next is the iron's own texture in the plain middle and several times that in a cap. It falls back to the middle's level 31 columns in from the left tip and 28 from the right, so both caps are set to 32. The game draws the left cap, the plain middle stretched to the row's width and the right cap as three pieces, the way the HUD bars are built (`barSlices`), not with Phaser's `NineSlice`, which draws on WebGL only. The numbers live in `src/config/menuArt.ts`, and `scripts/lib/menuArt.test.mjs` checks them against the file: solid and uniform between the caps, clear at the tips, no magenta tint.

## 3. `menu_embers_source.jpg`: the drifting embers

Save as `docs/art/sheets/CO-191/menu_embers_source.jpg`.

Delivered as: JPEG 1408x480 px from `openai/gpt-image-2`: four small glowing sparks in a row of four equal cells, one per cell, each a bright orange-yellow core with a soft red-orange glow and a slightly different flicker (round, stretched upward, smaller and dimmer, brighter), on pure black. Faint near-black JPEG noise lies over the black.

Prep, in `prepEmbers`: in each cell, set everything with a brightest channel of 24 or less to pure 0 so the noise goes; find the glow's bounding box on that; cut a 160 px square round its centre (wide enough that the tallest flame's glow ends inside it); area-average it to 16 x 16 and crush anything at 6 or less to 0 again. Output `public/assets/menu/menu_ember.png`, 64x16, four 16 px frames side by side, RGBA and fully opaque, with only the IHDR, IDAT and IEND chunks. The border of every frame is pure black, which `menuArt.test.mjs` checks.

The game draws the frames with an additive blend (`Phaser.BlendModes.ADD`), so the black costs nothing and no key is needed. About two dozen of them rise and fade on looping tweens the Intro scene owns; their spots come from a fixed seed through `src/core/rng.ts`.

## 4. `concept_A.jpg`: the chosen look

Kept for reference at `docs/art/sheets/CO-191/concept_A.jpg`.

Delivered as: JPEG 1088x608 px from `openai/gpt-image-2`, one of three concepts of the whole menu (background and entries only, as the ticket asked for). The picture is the target for the composition; its lettering is not used, and its tagline under the plates is dropped.

## 5. `menu_title_source.jpg`: the title

Save as `docs/art/sheets/CO-191/menu_title_source.jpg`.

Delivered as: JPEG 1536x640 px from `openai/gpt-image-2`, made by an image edit of concept A: the title lettering of the concept reproduced on its own as "Crimson" over "Onslaught" in two lines, in painted, cracked red blackletter with a dark outline, on a flat `#00FF00` green key with nothing else drawn. A one-line version was tried as well; the two-line stack was chosen by look.

Prep, in `prepTitle` (helpers `keyGreen`, `openAlpha`, `alphaBounds`, `glowTitle` in `scripts/lib/menuArt.mjs`):

1. Key the green to alpha: a pixel's lead is its green minus the larger of its red and blue, and alpha is `1 - (lead - 40) / 80` clipped to 0..1, so pure green is clear and the letters stay solid. Despill: green is never left above the larger of red and blue, so no green rim survives on a soft edge.
2. Drop JPEG specks from the alpha: a 5 px min filter, then a 5 px max filter.
3. Crop to the box of the pixels with alpha above 40 and area-average to 205 px tall (380 px wide, colour averaged over the opaque part only).
4. Pad 27 px on every side and bake two layers under the letters: a drop shadow (the alpha moved 2 px right and 4 px down, blurred 4 px, black at 0.9) and, under that, a glow (the alpha blurred 9 px, colour 190, 15, 30 at 0.55). The game draws one image.

Output `public/assets/menu/menu_title.png`, 434x259, RGBA with a real alpha channel and only the IHDR, IDAT and IEND chunks. `menuArt.test.mjs` checks the size, that the corner is clear, that the letters are solid and that no visible pixel is green. Intro centres it at x 480, y 120, so the letters run from y 17 to 222, and the first plate starts 21 px below them. If the file does not load, Intro letters the title in the label face instead and the menu warns once.

## 6. The label face

The plate labels, and the title when its image is missing, are set in Grenze Gotisch at weight 900 (SIL Open Font License 1.1). The latin subset of the 900 weight is self-hosted at `public/assets/fonts/GrenzeGotisch-900.woff2` with its licence at `public/assets/fonts/OFL.txt`, so nothing loads from a CDN at runtime, and the Content-Security-Policy allows it with `font-src 'self'`. Boot loads it (`this.load.font`) before Intro creates any text, because text made before a font loads stays in its fallback face. The other screens keep the serif the pause screen uses.
