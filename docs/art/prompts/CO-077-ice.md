# CO-077 Art: Ice spell FX — frost nova expansion, slow overlay, freeze, shatter

## What to do
1. Copy each prompt block marked "to do" into the art agent, one sheet per run. Attach the approved reference sheet from #53 (hero locomotion) as the style reference.
2. If the tool has a negative prompt field, paste this into it for every sheet:
   `text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, drop shadow, blur, gradient`
3. Attach every resulting PNG to this issue (drag into a comment).
4. Post the pixel dimensions the agent reported for each PNG.

Object: all visuals of the Ice spell. A ring of frost pulses outward from the player, slows enemies, can freeze them solid, and a perk shatters frozen enemies.

## Sheet 1 — `ice_nova.png` — to do

```text
Create one pixel-art animation sheet of an expanding frost ring for a
top-down 2D game: a flat ring of ice on the ground that starts as a point
and grows outward, seen from above. Colours are icy cyan (#40C4FF) with
white highlights and a pale blue inner mist. The centre of the ring is open
in every frame.

Cells are 448 px square, 6 across and 1 down, so the image is 2688 x 448 px.
The single row is a six-frame expansion, each frame centred in its cell, in
order: a small bright burst about 60 px wide; a thick ring about 140 px
across with a band about 40 px wide; a ring about 240 px across with a band
about 30 px wide and ice crystals along the rim; a ring about 320 px across
with a band about 24 px wide; a ring about 380 px across with a thin band
breaking into crystal shards; faint scattered shards near 380 px across, so
the last cell is almost blank. The ring is a flat circle of even thickness
with no rays outside it.

Style, identical for every sheet in this project
- Chunky pixel art with crisp hard pixel edges. No blur, no anti-aliasing,
  no gradients, no outline thinner than one art pixel.
- The camera is three-quarter top-down, slightly above and in front. Light
  comes from the top-left in every frame.
- Dark crimson and charcoal fantasy mood. Original design that does not
  imitate any existing game.
- Match the look of the approved reference sheet attached to this request.

Canvas and grid, strict because frames are cut out by script at fixed grid
positions
- The whole canvas is filled with one solid colour: pure bright magenta,
  RGB 255 0 255, hex #FF00FF. The same exact magenta in every cell and every
  row, with no vignette, texture, noise, pattern or checkerboard. Blank cells
  are this same magenta and nothing else.
- The image contains only the sprites on that magenta. It contains no text:
  no words, letters, numbers, titles, captions, frame names or cell codes.
  A single character of text anywhere ruins the sheet.
- The canvas is a uniform grid of square cells; the cell size and the number
  of cells across and down are given above. If it must be rendered smaller,
  scale the whole canvas proportionally and keep the same number of cells,
  then report the final pixel size.
- One frame per cell. Each row is one animation and the columns are its
  frames in time order from left to right.
- Every sprite stays inside the middle three quarters of its cell and never
  touches a cell edge. The character's feet, or the object's centre, sit at
  the same spot in every cell of a row so the animation does not jitter.
- A row described as facing right is drawn facing right: face, weapon and
  feet toward the right edge of the cell. Likewise for left, up and down.
  Never copy or mirror another row.
- No drop shadows, no ground shadows, no glow beyond the sprite's own
  pixels, no grid lines, no borders, no watermark.

Delivery
- One PNG file per sheet (PNG, not JPEG), lossless, at the largest size
  available. Report the exact pixel dimensions.
```

## Sheet 2 — `ice_status.png` — to do

```text
Create one pixel-art animation sheet of ice status effects for a top-down
2D game. These are drawn on top of enemy sprites, so draw only the ice with
no creature underneath. Colours are icy cyan (#40C4FF), white and pale blue.

Cells are 160 px square, 6 across and 3 down, so the image is 960 x 480 px.
Row 1 is a four-frame slow effect in the first four cells: a subtle loop of
small frost crystals and thin frost mist hovering over an invisible base
about 80 px wide, about 60 px tall. The last two cells stay blank magenta.
Row 2 has two frames in the first two cells: a translucent jagged block of
ice about 100 px tall and 90 px wide seen from the three-quarter camera,
hollow enough that a creature inside would show through; then the same
block with hairline cracks. The other four cells stay blank magenta.
Row 3 is a four-frame shatter in the first four cells: crack lines flash
white across the block; the block splits into six to eight shards; the
shards fly outward; the shards fade to almost nothing. The last two cells
stay blank magenta.

Style, identical for every sheet in this project
- Chunky pixel art with crisp hard pixel edges. No blur, no anti-aliasing,
  no gradients, no outline thinner than one art pixel.
- The camera is three-quarter top-down, slightly above and in front. Light
  comes from the top-left in every frame.
- Dark crimson and charcoal fantasy mood. Original design that does not
  imitate any existing game.
- Match the look of the approved reference sheet attached to this request.

Canvas and grid, strict because frames are cut out by script at fixed grid
positions
- The whole canvas is filled with one solid colour: pure bright magenta,
  RGB 255 0 255, hex #FF00FF. The same exact magenta in every cell and every
  row, with no vignette, texture, noise, pattern or checkerboard. Blank cells
  are this same magenta and nothing else.
- The image contains only the sprites on that magenta. It contains no text:
  no words, letters, numbers, titles, captions, frame names or cell codes.
  A single character of text anywhere ruins the sheet.
- The canvas is a uniform grid of square cells; the cell size and the number
  of cells across and down are given above. If it must be rendered smaller,
  scale the whole canvas proportionally and keep the same number of cells,
  then report the final pixel size.
- One frame per cell. Each row is one animation and the columns are its
  frames in time order from left to right.
- Every sprite stays inside the middle three quarters of its cell and never
  touches a cell edge. The character's feet, or the object's centre, sit at
  the same spot in every cell of a row so the animation does not jitter.
- A row described as facing right is drawn facing right: face, weapon and
  feet toward the right edge of the cell. Likewise for left, up and down.
  Never copy or mirror another row.
- No drop shadows, no ground shadows, no glow beyond the sprite's own
  pixels, no grid lines, no borders, no watermark.

Delivery
- One PNG file per sheet (PNG, not JPEG), lossless, at the largest size
  available. Report the exact pixel dimensions.
```

## Done when
Every sheet marked "to do" is attached at the stated grid. Engine integration is a separate ticket that depends on this one.
