# CO-076 Art: Fire spell FX — fireball flight, explosion, burn overlay

## What to do
1. Copy each prompt block marked "to do" into the art agent, one sheet per run. Attach the approved reference sheet from #53 (hero locomotion) as the style reference.
2. If the tool has a negative prompt field, paste this into it for every sheet:
   `text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, drop shadow, blur, gradient`
3. Attach every resulting PNG to this issue (drag into a comment).
4. Post the pixel dimensions the agent reported for each PNG.

Object: all visuals of the Fire spell. The projectile flies at the nearest enemy and explodes on hit, and a burn perk shows flames on burning enemies.

## Sheet 1 — `fire_projectile.png` — done, attached

## Sheet 2 — `fire_explosion.png` — to do

```text
Create one pixel-art animation sheet of a fireball explosion for a
top-down 2D game, seen flat from a three-quarter top-down camera. Colours are
orange (#FF6D00) with a yellow core, a dark red rim and some near-black
smoke.

Cells are 384 px square, 6 across and 1 down, so the image is 2304 x 384 px.
The single row is a six-frame explosion, each frame centred in its cell, in
order: a bright white-yellow flash about 80 px wide; a blooming fireball
about 180 px wide; a full round blast about 300 px wide with a jagged flame
edge; the blast breaking up with a dark red rim and smoke starting; mostly
smoke with a few embers; only faint embers left, so the last cell is almost
blank. The blast is a flat disc seen from above, not a rising mushroom
cloud.

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

## Sheet 3 — `fire_burn_overlay.png` — done, attached

## Done when
Every sheet marked "to do" is attached at the stated grid. Engine integration is a separate ticket that depends on this one.
