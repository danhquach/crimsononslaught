# CO-224 Art: the boss's Summon

Ticket: [#392](https://github.com/danhquach/crimsononslaught/issues/392)

The boss stops, raises both arms straight up and calls a magenta rune sigil between its hands for 1.0 s, then a pack appears out of summoning circles on the floor. The look began as concept B of three (A blood pentagram, B magenta runes, C hellfire rift), but the rune circle read as a magenta clump at game size, so it was replaced by a simpler one: a bold magenta ring with a pentagram inside and a hollow interior, pulsing between magenta and lighter pink; the burst is a light column and sparks rising out of it, then the ring fading. Both sheets are cut onto their own atlas page 28, so no other page is re-quantised.

The circle is drawn about 44 game px wide, to sit under a 16 px Swarm enemy as a spawn marker, and its origin (the frame anchor) is the circle's centre. The burst shares that centre and scale, so the circle inside the burst lines up with the loop.

## `boss_summon.png`: the boss's wind-up pose

Save as `docs/art/sheets/CO-224/boss_summon.png`. Generated as an edit with `docs/art/sheets/CO-074/boss_walk.jpg` attached as the reference, 1536x1536, quality medium. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1536x1536 px from `openai/gpt-image-2`, on a green key because the art is pink. Rows 3 and 4 came out swapped (row 3 faced right, row 4 left; the walk sheet has left on row 3), so the rows were swapped back. The rows are not on the 384 px grid (row 4's sigils start at y 1143, above its row's line), so drawings were grouped by the slot of their connected parts' centroids, not cut by grid lines. Pixels with green above both red and blue were snapped to #00FF00 (near-white pixels with a green cast, minimum channel 170 or more, had green set to their larger other channel instead, so the white cores kept their pixels). Each drawing was then placed in a 560 px grid cell with its feet on the walk sheet's feet line for that facing (41.5, 43.7, 46.1 and 46.1 game px below the anchor for down, up, left and right) and its feet centre on the walk sheet's feet x (+2.6, +3.1, -6.0 and +5.5 game px), at the model's own pixel size (no resampling). The cell is 560, not the 420 of the volley sheet, because the raised sigil stands 370 px above the feet and would otherwise leave the cell top. Specks under 12 px were dropped (144 parts), except pink glow sparks of 6 px or more. Saved as PNG (2240x2240) with no C2PA chunk. Cut at `sheetCell` 800 (2.8 sheet px per game px, the same boss size as the walk sheet), not centred, with the boss recolour, on `props28`: columns 1-3 are `boss.summonWindup.<facing>` (held on the last, the sigil at its biggest), column 4 is `boss.summon.<facing>` (one flaring frame held through the release).

```text
Create one pixel-art sprite sheet of the exact same boss as the attached reference sheet: the huge horned demon lord with violet skin, crimson and black wings and armour, pale horns and claws. Same proportions, same palette, same pixel size, same three-quarter top-down camera, light from the top-left. This sheet is the boss's SUMMON wind-up: it stands still and raises both arms straight up above its head, calling up a glowing magenta rune sigil between its raised hands.

The canvas is 1536 by 1536 pixels, a grid of 384 pixel square cells, four cells across and four cells down. Each row is one facing, and the four columns are the wind-up frames in time order: column 1 both arms starting to lift, small magenta sparks around the claws; column 2 arms raised to head height, wings half open, a small magenta rune glow forming above the head; column 3 both arms raised straight up overhead, wings spread, a bright magenta ring of light with a white core hovering between the raised hands; column 4 the same pose with the ring flaring white-pink, about to release.
Row 1: the boss faces down, toward the viewer.
Row 2: the boss faces up, away from the viewer, back and wings to the camera.
Row 3: the boss faces left, face and horns toward the left edge.
Row 4: the boss faces right, face and horns toward the right edge.
Draw each row separately; never mirror or copy another row. The boss is about 280 pixels tall in a 384 pixel cell, with the feet on the same line in every cell of a row. Every drawing, raised arms, wings and the glow included, stays inside the middle three quarters of its cell and never touches a cell edge. Draw only the boss and the light above its hands: no creatures, no circle on the floor, no dust, no floor, no shadow.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; original design.
Background: the file is one sheet of flat pure green #00FF00 with the drawings sitting straight on it. Green runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no texture, noise or vignette. No green anywhere in the drawings.
The cells are a measurement, not something to draw: nothing marks where one ends and the next begins, no tile, panel, line, border or frame. No text anywhere: one letter, number, label or watermark ruins the sheet.
```

## `boss_summon_fx.png`: the summoning circle and its burst

Save as `docs/art/sheets/CO-224/boss_summon_fx.png`. Generated from text only (no reference image). Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1536x768 px from `openai/gpt-image-2`, on a green key. Row 1 cells 1 and 2 carried a band of orange speckle noise under the ring; it sat close enough to green that the green snap below removed all of it (the loop frames then hold one connected part each, so nothing was dropped by size). Pixels with green above both red and blue were snapped to #00FF00 (near-white pixels with a green cast kept, as above). No speck drop was applied beyond parts under 6 px (none were found), so the thin star lines stay whole. The rings sit on the 384 px grid (x 29 to 355 in every cell, 326 px wide), so each frame was moved by whole pixels into a 560x640 cell: the ring's centre on the cell centre, x per frame and y by one value per row (the ring's widest point gives its vertical centre), so the loop holds still. Measured on the delivered sheet the loop ring is 327 px wide and 190 tall; the burst ring is 327, 327, 324 and 323 px wide, centred within 2 px of the loop in x and y, but only about 162 px tall (142 for the thin last ring), so it is about 15 percent flatter than the loop: width and centre line up, height is about 2 game px short per side. It was not resampled. Saved as PNG (2240x1280) with no C2PA chunk. Cut at `sheetCell` 352 (7.27 sheet px per game px, the ring about 45 px wide) on `props28`, both rows `centred`: row 1 is `boss.summonCircle` (loop), row 2 `boss.summonBurst` (once).

```text
Create one pixel-art sprite sheet of a very simple, bold summoning circle for a top-down game, seen from a three-quarter top-down camera as a flat ellipse on the ground. It must read clearly when shrunk very small, so it is minimal: one thick bright magenta ring, about 18 pixels thick, with a simple bold five-pointed star drawn inside it in thick magenta lines, star points touching the ring. Everything between the lines is EMPTY: plain green background shows through, no fill, no runes, no small symbols, no extra rings.

The canvas is 1536 by 768 pixels, a grid of 384 pixel square cells, four cells across and two cells down. Each row is one animation and the columns are its frames in time order from left to right.
Row 1, loop: the ring and star as an ellipse about 280 pixels wide and 170 pixels tall, centred in the cell. Four frames of one seamless loop: the lines pulse between magenta and a brighter hot pink. Same size and same place in all four frames.
Row 2, burst, plays once: frame 1 the same circle with a bright white-pink column of light rising from its centre, about 110 pixels wide and 220 pixels tall; frame 2 the column breaks into a few big pink sparks flying up; frame 3 a few smaller sparks and the circle fading; frame 4 only a thin faint ring. The circle is the same size and place as in row 1.
Every drawing stays inside its cell with at least 30 pixels of plain green round it and never touches a cell edge.

Colours: magenta #FF3CF0, hot pink #FF7AF5, white #FFFFFF, violet #A030E0 shade only on the outer edge. No green anywhere in the drawings.
Style: chunky pixel art, crisp hard edges, no blur, no anti-aliasing, no soft glow halo, no gradients; original design.
Background: the file is one sheet of flat pure green #00FF00 with the drawings sitting straight on it, fully opaque, no texture, noise or vignette. Nothing marks the cells: no tile, panel, line, border or frame. No text anywhere.
```
