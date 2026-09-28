# CO-179 Art: passive and relic icons for the pause screen

Ticket: [#293](https://github.com/danhquach/crimsononslaught/issues/293)

The pause screen's Passives and Relics strips showed two-letter tiles. This ticket gives all 14 passives and 13 relic buffs an icon. The look is concept A of three: the round button of the spell icons (CO-154), on a steel-grey disc with a pale mint silhouette for a passive and on a violet disc in a gold ring with a gold object for a relic, so the two strips read apart by colour.

One sheet per five icons in one row, in `PASSIVES` and `RELIC_BUFFS` order (`src/config/passives.ts`, `src/config/relics.ts`). The cut frames are `icon.<id>.0` on their own atlas page 17, so no other page is re-quantised. The pause screen draws each disc 32 px across in its tile, with the rank or stack badge on its lower-right rim.

Six sheets. Copy each whole `text` block below and paste it as the prompt, with the concept A picture attached as the reference. Nothing else to add.

If the tool has a negative-prompt field, paste this into it:

```text
text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, drop shadow, blur, smooth gradient, jpeg artifacts, glow halo outside the disc, square tiles, frames, panels
```

## 1. `icons_passives_1.png`: 5 passives

Save as `docs/art/sheets/CO-179/icons_passives_1.png`. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1408x480 px from `openai/gpt-image-2` (asked 1280x256, 5x1 of 256 px), with concept A attached as the reference, first try. The discs came back about 228 px across, so each disc was found by its columns and rows of art, not by grid. Everything outside each disc's circle, pulled in 1.5 px off the JPEG fringe, was set to #FF00FF. Each disc was then area-averaged onto a 36 px native cell with the disc 32 px across, averaging the art pixels alone and skipping magenta-tinted specks on the rim (the house rule, `b > 0.8r && g < 0.6r && r > 140`, kept to the outer 6 px so the relics' violet is not dropped), and scaled back up 4x nearest-neighbour, so the cutter's 4x nearest-neighbour downscale lands on those averages. The magenta test for the background is strict (`r > 190 && b > 190 && g < 90`) because the relic violet, #9966FF, passes a loose one. Saved as PNG (720x144, no metadata chunks) before the cut. Ruled grid band: no. `sheetCell` 144, `centred`; cuts to 36x36 native frames with a 32x32 art box.

```text
Create one sheet of five small round passive upgrade button icons for a top-down 2D pixel-art game, drawn side by side in one row. Draw only the five icons, no text, no player, no monsters and no ground.

The canvas is 1280 by 256 pixels, a grid of 256 pixel square cells, five cells across and one cell down. They read left to right. Each icon is a round disc 208 pixels across, centred in its cell, which leaves 24 pixels of plain magenta between the disc and every cell edge.

Every disc is the same, like the attached concept picture: a solid circle shaded in four flat rings of cool steel grey, a dark slate rim, hex #2E3436, stepping inward through #4A5457 and #6E7A7D to a pale grey centre, hex #9AA5A8, with a crisp two pixel dark outline round the outside. The shading steps in hard bands with a little dithering between them, never a smooth blend. On each disc sits one bold, simple silhouette in pale mint white, hex #E5FFEE, with a few pure white highlight pixels, outlined in dark slate, hex #1E2426, so it stands out clearly against the grey. The silhouette is what tells the five apart: each one is a different shape, big and chunky, drawn with few details so it still reads when the icon is shown only 32 pixels across. Every silhouette stays inside the central circle of the disc, 150 pixels across, so a clear ring of plain disc colour shows all the way round it.

The first disc is Power: a clenched fist seen from the front, knuckles up. The second disc is Haste: a round clock face with one hand, three short speed lines trailing from its left side. The third disc is Expanse: four short thick arrows pointing outward, up, down, left and right, from one small round dot in the middle. The fourth disc is Velocity: a small round orb flying to the right with three long straight speed streaks trailing behind it. The fifth disc is Persistence: a short lit candle standing upright with a steady teardrop flame on top.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur and no anti-aliasing; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference picture.
Background: the file is one sheet of flat magenta #FF00FF with the discs sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every disc alike, fully opaque, with no transparency or alpha channel and no texture, noise, shadow, glow or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta beside a disc is the same magenta everywhere. No text anywhere either: a single character of text, a number, a label or a watermark ruins the sheet.
Every disc stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. All five discs are exactly the same size.
```

## 2. `icons_passives_2.png`: 5 passives

Save as `docs/art/sheets/CO-179/icons_passives_2.png`. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1408x480 px from `openai/gpt-image-2` (asked 1280x256, 5x1 of 256 px), with concept A attached as the reference, first try. The discs came back about 229 px across, so each disc was found by its columns and rows of art, not by grid. Everything outside each disc's circle, pulled in 1.5 px off the JPEG fringe, was set to #FF00FF. Each disc was then area-averaged onto a 36 px native cell with the disc 32 px across, averaging the art pixels alone and skipping magenta-tinted specks on the rim (the house rule, `b > 0.8r && g < 0.6r && r > 140`, kept to the outer 6 px so the relics' violet is not dropped), and scaled back up 4x nearest-neighbour, so the cutter's 4x nearest-neighbour downscale lands on those averages. The magenta test for the background is strict (`r > 190 && b > 190 && g < 90`) because the relic violet, #9966FF, passes a loose one. Saved as PNG (720x144, no metadata chunks) before the cut. Ruled grid band: no. `sheetCell` 144, `centred`; cuts to 36x36 native frames with a 32x32 art box.

```text
Create one sheet of five small round passive upgrade button icons for a top-down 2D pixel-art game, drawn side by side in one row. Draw only the five icons, no text, no player, no monsters and no ground.

The canvas is 1280 by 256 pixels, a grid of 256 pixel square cells, five cells across and one cell down. They read left to right. Each icon is a round disc 208 pixels across, centred in its cell, which leaves 24 pixels of plain magenta between the disc and every cell edge.

Every disc is the same, like the attached concept picture: a solid circle shaded in four flat rings of cool steel grey, a dark slate rim, hex #2E3436, stepping inward through #4A5457 and #6E7A7D to a pale grey centre, hex #9AA5A8, with a crisp two pixel dark outline round the outside. The shading steps in hard bands with a little dithering between them, never a smooth blend. On each disc sits one bold, simple silhouette in pale mint white, hex #E5FFEE, with a few pure white highlight pixels, outlined in dark slate, hex #1E2426, so it stands out clearly against the grey. The silhouette is what tells the five apart: each one is a different shape, big and chunky, drawn with few details so it still reads when the icon is shown only 32 pixels across. Every silhouette stays inside the central circle of the disc, 150 pixels across, so a clear ring of plain disc colour shows all the way round it.

The first disc is Precision: a crosshair, a ring with four short ticks pointing inward and a dot in the centre. The second disc is Savagery: three parallel claw slashes raking down from the upper right to the lower left. The third disc is Ward: a round buckler shield seen from the front, with a raised boss in its centre and a cross of two bands. The fourth disc is Swift: a boot in side view facing right with a small wing on its heel. The fifth disc is Vitality: a plump heart.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur and no anti-aliasing; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference picture.
Background: the file is one sheet of flat magenta #FF00FF with the discs sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every disc alike, fully opaque, with no transparency or alpha channel and no texture, noise, shadow, glow or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta beside a disc is the same magenta everywhere. No text anywhere either: a single character of text, a number, a label or a watermark ruins the sheet.
Every disc stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. All five discs are exactly the same size.
```

## 3. `icons_passives_3.png`: 4 passives

Save as `docs/art/sheets/CO-179/icons_passives_3.png`. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1408x480 px from `openai/gpt-image-2` (asked 1024x256, 4x1 of 256 px), with concept A attached as the reference, first try. The discs came back about 283 px across, so each disc was found by its columns and rows of art, not by grid. Everything outside each disc's circle, pulled in 1.5 px off the JPEG fringe, was set to #FF00FF. Each disc was then area-averaged onto a 36 px native cell with the disc 32 px across, averaging the art pixels alone and skipping magenta-tinted specks on the rim (the house rule, `b > 0.8r && g < 0.6r && r > 140`, kept to the outer 6 px so the relics' violet is not dropped), and scaled back up 4x nearest-neighbour, so the cutter's 4x nearest-neighbour downscale lands on those averages. The magenta test for the background is strict (`r > 190 && b > 190 && g < 90`) because the relic violet, #9966FF, passes a loose one. Saved as PNG (576x144, no metadata chunks) before the cut. Ruled grid band: no. `sheetCell` 144, `centred`; cuts to 36x36 native frames with a 32x32 art box.

```text
Create one sheet of four small round passive upgrade button icons for a top-down 2D pixel-art game, drawn side by side in one row. Draw only the four icons, no text, no player, no monsters and no ground.

The canvas is 1024 by 256 pixels, a grid of 256 pixel square cells, four cells across and one cell down. They read left to right. Each icon is a round disc 208 pixels across, centred in its cell, which leaves 24 pixels of plain magenta between the disc and every cell edge.

Every disc is the same, like the attached concept picture: a solid circle shaded in four flat rings of cool steel grey, a dark slate rim, hex #2E3436, stepping inward through #4A5457 and #6E7A7D to a pale grey centre, hex #9AA5A8, with a crisp two pixel dark outline round the outside. The shading steps in hard bands with a little dithering between them, never a smooth blend. On each disc sits one bold, simple silhouette in pale mint white, hex #E5FFEE, with a few pure white highlight pixels, outlined in dark slate, hex #1E2426, so it stands out clearly against the grey. The silhouette is what tells the four apart: each one is a different shape, big and chunky, drawn with few details so it still reads when the icon is shown only 32 pixels across. Every silhouette stays inside the central circle of the disc, 150 pixels across, so a clear ring of plain disc colour shows all the way round it.

The first disc is Regeneration: a young sprout rising from a small mound, two rounded leaves opening from its stem. The second disc is Magnet: a horseshoe magnet with its open ends pointing up, two small sparks above the ends. The third disc is Avarice: a single faceted crystal shard standing on its point, with a small four-pointed sparkle beside it. The fourth disc is Pierce: an arrow flying to the right straight through the middle of a ring, the ring cut where the arrow passes.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur and no anti-aliasing; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference picture.
Background: the file is one sheet of flat magenta #FF00FF with the discs sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every disc alike, fully opaque, with no transparency or alpha channel and no texture, noise, shadow, glow or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta beside a disc is the same magenta everywhere. No text anywhere either: a single character of text, a number, a label or a watermark ruins the sheet.
Every disc stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. All four discs are exactly the same size.
```

## 4. `icons_relics_1.png`: 5 relics

Save as `docs/art/sheets/CO-179/icons_relics_1.png`. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1408x480 px from `openai/gpt-image-2` (asked 1280x256, 5x1 of 256 px), with concept A attached as the reference, first try. The discs came back about 233 px across, so each disc was found by its columns and rows of art, not by grid. Everything outside each disc's circle, pulled in 1.5 px off the JPEG fringe, was set to #FF00FF. Each disc was then area-averaged onto a 36 px native cell with the disc 32 px across, averaging the art pixels alone and skipping magenta-tinted specks on the rim (the house rule, `b > 0.8r && g < 0.6r && r > 140`, kept to the outer 6 px so the relics' violet is not dropped), and scaled back up 4x nearest-neighbour, so the cutter's 4x nearest-neighbour downscale lands on those averages. The magenta test for the background is strict (`r > 190 && b > 190 && g < 90`) because the relic violet, #9966FF, passes a loose one. Saved as PNG (720x144, no metadata chunks) before the cut. Ruled grid band: no. `sheetCell` 144, `centred`; cuts to 36x36 native frames with a 32x32 art box. Faint JPEG streaks in the magenta below the discs are dropped by finding rows by a run of art, not by any one pixel.

```text
Create one sheet of five small round relic button icons for a top-down 2D pixel-art game, drawn side by side in one row. Draw only the five icons, no text, no player, no monsters and no ground.

The canvas is 1280 by 256 pixels, a grid of 256 pixel square cells, five cells across and one cell down. They read left to right. Each icon is a round disc 208 pixels across, centred in its cell, which leaves 24 pixels of plain magenta between the disc and every cell edge.

Every disc is the same, like the attached concept picture: a solid circle shaded in four flat rings of rich violet, a deep purple rim, hex #2A0F55, stepping inward through #45208A and #6B3FC9 to a bright violet centre, hex #9966FF, inside a thin ring of gold, hex #D4A62A, with a crisp two pixel dark outline round the outside. The shading steps in hard bands with a little dithering between them, never a smooth blend. On each disc sits one bold, simple object in warm gold and bone tones, hex #E8C66A with pale cream highlights, hex #FFF1D6, keeping its own natural colour where the description gives one, outlined all the way round in dark brown, hex #3A2400, so it stands out clearly against the violet. The silhouette is what tells the five apart: each one is a different shape, big and chunky, drawn with few details so it still reads when the icon is shown only 32 pixels across. Every silhouette stays inside the central circle of the disc, 150 pixels across, so a clear ring of plain disc colour shows all the way round it.

The first disc is Ancient Fury: a snarling horned beast skull seen from the front, curved horns, fanged jaw open. The second disc is Hourglass: an upright hourglass in a gold frame with two posts, sand running from the top bulb into the bottom. The third disc is Colossus: the stone head of a colossal ancient statue seen from the front, square jaw, blank eyes, a crack across its brow, in grey stone. The fourth disc is Tailwind: three curling gusts of wind sweeping to the right, each ending in a spiral curl. The fifth disc is Everfrost: a six-armed snowflake crystal, in icy white and pale blue.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur and no anti-aliasing; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference picture.
Background: the file is one sheet of flat magenta #FF00FF with the discs sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every disc alike, fully opaque, with no transparency or alpha channel and no texture, noise, shadow, glow or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta beside a disc is the same magenta everywhere. No text anywhere either: a single character of text, a number, a label or a watermark ruins the sheet.
Every disc stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. All five discs are exactly the same size.
```

## 5. `icons_relics_2.png`: 5 relics

Save as `docs/art/sheets/CO-179/icons_relics_2.png`. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1408x480 px from `openai/gpt-image-2` (asked 1280x256, 5x1 of 256 px), with concept A attached as the reference, first try. The discs came back about 233 px across, so each disc was found by its columns and rows of art, not by grid. Everything outside each disc's circle, pulled in 1.5 px off the JPEG fringe, was set to #FF00FF. Each disc was then area-averaged onto a 36 px native cell with the disc 32 px across, averaging the art pixels alone and skipping magenta-tinted specks on the rim (the house rule, `b > 0.8r && g < 0.6r && r > 140`, kept to the outer 6 px so the relics' violet is not dropped), and scaled back up 4x nearest-neighbour, so the cutter's 4x nearest-neighbour downscale lands on those averages. The magenta test for the background is strict (`r > 190 && b > 190 && g < 90`) because the relic violet, #9966FF, passes a loose one. Saved as PNG (720x144, no metadata chunks) before the cut. Ruled grid band: no. `sheetCell` 144, `centred`; cuts to 36x36 native frames with a 32x32 art box. Faint JPEG streaks in the magenta below the discs are dropped by finding rows by a run of art, not by any one pixel.

```text
Create one sheet of five small round relic button icons for a top-down 2D pixel-art game, drawn side by side in one row. Draw only the five icons, no text, no player, no monsters and no ground.

The canvas is 1280 by 256 pixels, a grid of 256 pixel square cells, five cells across and one cell down. They read left to right. Each icon is a round disc 208 pixels across, centred in its cell, which leaves 24 pixels of plain magenta between the disc and every cell edge.

Every disc is the same, like the attached concept picture: a solid circle shaded in four flat rings of rich violet, a deep purple rim, hex #2A0F55, stepping inward through #45208A and #6B3FC9 to a bright violet centre, hex #9966FF, inside a thin ring of gold, hex #D4A62A, with a crisp two pixel dark outline round the outside. The shading steps in hard bands with a little dithering between them, never a smooth blend. On each disc sits one bold, simple object in warm gold and bone tones, hex #E8C66A with pale cream highlights, hex #FFF1D6, keeping its own natural colour where the description gives one, outlined all the way round in dark brown, hex #3A2400, so it stands out clearly against the violet. The silhouette is what tells the five apart: each one is a different shape, big and chunky, drawn with few details so it still reads when the icon is shown only 32 pixels across. Every silhouette stays inside the central circle of the disc, 150 pixels across, so a clear ring of plain disc colour shows all the way round it.

The first disc is Hawk Eye: a hawk's head in side profile facing right, a sharp hooked beak and one fierce round eye. The second disc is Executioner: a heavy executioner's axe standing upright, a broad curved blade on a long haft. The third disc is Bulwark: a tall tower shield seen from the front, a rectangle with a rounded top, a raised rim and a riveted band across the middle. The fourth disc is Windstep: a single long feather curving from the lower left up to the upper right. The fifth disc is Bloodstone: a faceted blood red teardrop gemstone, point up, in deep red, hex #B01020, with bright red facets.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur and no anti-aliasing; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference picture.
Background: the file is one sheet of flat magenta #FF00FF with the discs sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every disc alike, fully opaque, with no transparency or alpha channel and no texture, noise, shadow, glow or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta beside a disc is the same magenta everywhere. No text anywhere either: a single character of text, a number, a label or a watermark ruins the sheet.
Every disc stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. All five discs are exactly the same size.
```

## 6. `icons_relics_3.png`: 3 relics

Save as `docs/art/sheets/CO-179/icons_relics_3.png`. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1408x480 px from `openai/gpt-image-2` (asked 768x256, 3x1 of 256 px), with concept A attached as the reference, first try. The discs came back about 367 px across, so each disc was found by its columns and rows of art, not by grid. Everything outside each disc's circle, pulled in 1.5 px off the JPEG fringe, was set to #FF00FF. Each disc was then area-averaged onto a 36 px native cell with the disc 32 px across, averaging the art pixels alone and skipping magenta-tinted specks on the rim (the house rule, `b > 0.8r && g < 0.6r && r > 140`, kept to the outer 6 px so the relics' violet is not dropped), and scaled back up 4x nearest-neighbour, so the cutter's 4x nearest-neighbour downscale lands on those averages. The magenta test for the background is strict (`r > 190 && b > 190 && g < 90`) because the relic violet, #9966FF, passes a loose one. Saved as PNG (432x144, no metadata chunks) before the cut. Ruled grid band: no. `sheetCell` 144, `centred`; cuts to 36x36 native frames with a 32x32 art box.

```text
Create one sheet of three small round relic button icons for a top-down 2D pixel-art game, drawn side by side in one row. Draw only the three icons, no text, no player, no monsters and no ground.

The canvas is 768 by 256 pixels, a grid of 256 pixel square cells, three cells across and one cell down. They read left to right. Each icon is a round disc 208 pixels across, centred in its cell, which leaves 24 pixels of plain magenta between the disc and every cell edge.

Every disc is the same, like the attached concept picture: a solid circle shaded in four flat rings of rich violet, a deep purple rim, hex #2A0F55, stepping inward through #45208A and #6B3FC9 to a bright violet centre, hex #9966FF, inside a thin ring of gold, hex #D4A62A, with a crisp two pixel dark outline round the outside. The shading steps in hard bands with a little dithering between them, never a smooth blend. On each disc sits one bold, simple object in warm gold and bone tones, hex #E8C66A with pale cream highlights, hex #FFF1D6, keeping its own natural colour where the description gives one, outlined all the way round in dark brown, hex #3A2400, so it stands out clearly against the violet. The silhouette is what tells the three apart: each one is a different shape, big and chunky, drawn with few details so it still reads when the icon is shown only 32 pixels across. Every silhouette stays inside the central circle of the disc, 150 pixels across, so a clear ring of plain disc colour shows all the way round it.

The first disc is Wellspring: a round stone basin with a spout of clear blue water bubbling up from its middle and splashing over the rim. The second disc is Lodestone: a jagged chunk of dark grey rock with a bright violet vein, three small iron shards clinging to its sides. The third disc is Sage's Tome: a thick closed old book, standing slightly turned, with a leather cover, gold corners and a gold clasp.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur and no anti-aliasing; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference picture.
Background: the file is one sheet of flat magenta #FF00FF with the discs sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every disc alike, fully opaque, with no transparency or alpha channel and no texture, noise, shadow, glow or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta beside a disc is the same magenta everywhere. No text anywhere either: a single character of text, a number, a label or a watermark ruins the sheet.
Every disc stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. All three discs are exactly the same size.
```
