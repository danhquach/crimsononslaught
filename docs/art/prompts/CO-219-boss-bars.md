# CO-219 Art: the boss bar's break effect

Ticket: [#387](https://github.com/danhquach/crimsononslaught/issues/387)

The boss's HP is shown as stacked bars on the one HUD boss bar. When a bar empties, its glass cracks and shatters before the next colour fills the tube. The look is concept A of three (A glass shatter, B white flare, C ember burst): cracks run across the tube and small glass shards burst out above and below it.

The bar fills are code colours on the existing CO-156 frame, so they need no new art. The ×N count is HUD text in the existing label style.

One sheet, a 4 x 2 grid. Row 1 is the crack and row 2 is the shards, four frames each. The art is pale, untinted glass, so the HUD can tint it to the colour of the bar that broke. The sheet is cut onto its own atlas page 23, so no other page is re-quantised.

## `boss_bar_break.png`: crack and shards

Save as `docs/art/sheets/CO-219/boss_bar_break.png`. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1152x576 px from `openai/gpt-image-2` (quality medium), on a green key because pale glass sits close to the house magenta's tints. Every green-dominant pixel (`g > r && g > b`) was snapped to #00FF00. The drawings did not sit in their 288 px cells: crack frame 3 ran 6 px into frame 2's cell, and the shards' last frame came back as scattered pieces. Each frame's art was found by its columns, grouped by the cell its middle sits in, and moved whole to the centre of its own cell, with no pixel redrawn. Saved as PNG with no C2PA chunk. Cut at `sheetCell` 288, `centred`, on `props23`: row 1 is `hud.bossCrack`, row 2 is `hud.bossShards`.

```text
Create one pixel-art sprite sheet for a top-down 2D game: the glass of a health bar tube cracking and shattering. Draw only the cracks and the glass shards, no bar, no frame, no character, no floor.

The canvas is 1024 by 512 pixels, a grid of 256 pixel square cells, four cells across and two cells down. Each row is one animation and the columns are its frames in time order from left to right. Every drawing stays centred in its cell and never touches a cell edge, with at least 24 pixels of plain green round it.
Row 1, crack: a jagged horizontal crack in glass, wide and flat, at most 200 pixels long and only 48 pixels tall, a bright main crack line with short branching side cracks. Frame 1 a short crack about 80 pixels long, frame 2 longer about 150 pixels with more branches, frame 3 the full 200 pixels with many branches, frame 4 the same crack broken into faint separated fragments.
Row 2, shards: small sharp angular glass shards bursting outward from the centre, flying more to the sides than up and down. Frame 1 a tight cluster of 6 shards about 70 pixels across, frame 2 the shards spread to about 130 pixels, frame 3 spread to about 190 pixels and turning, frame 4 a few small far-flung shards, fewer and smaller.

Colours: pale glass only, white #FFFFFF, very pale grey #E6E6EE, light grey #B8B8C8 for the shaded facets and a thin darker grey #6E6E80 outline. No colour tint, no violet, no pink, no magenta, no green anywhere in the drawings.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing, glow or gradients; light from the top-left; original design.
Background: the file is one sheet of flat pure green #00FF00 with the drawings sitting straight on it. Green runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing marks where one ends and the next begins, no tile, panel, line, border or frame. No text anywhere: one letter, number, label or watermark ruins the sheet. Give every cell visible art.
```
