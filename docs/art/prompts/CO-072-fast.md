# CO-072 Art: Fast enemy — move, hurt, death, spawn (authored facing up)

## What to do
1. Copy each prompt block marked "to do" into the art agent, one sheet per run. Attach the approved reference sheet from #53 (hero locomotion) as the style reference.
2. If the tool has a negative prompt field, paste this into it for every sheet:
   `text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, drop shadow, blur, gradient`
3. Attach every resulting PNG to this issue (drag into a comment).
4. Post the pixel dimensions the agent reported for each PNG.

Object: the Fast enemy. In-game 20 x 20 px, drawn at 4x (about 80 px) inside 128 px cells. The engine rotates it toward its target, so every frame points straight up.

## Sheet — `enemy_fast.png` — to do

```text
Create one pixel-art animation sheet for a fast enemy in a top-down 2D game.
The creature is a lean, pointed, dart-shaped flyer, amber (#FFB300) with a
darker core, and it points straight up in every single frame. It is about
80 px tall inside a 128 px cell, the same creature as on the reference sheet.

Cells are 128 px square, 6 across and 4 down, so the image is 768 x 512 px.
Row 1 is a four-frame movement loop in the first four cells: fins flutter and
a short motion trail sits behind the tail, kept inside the cell. The last two
cells of the row stay blank magenta.
Row 2 has one frame in the first cell: the creature flinches with a pale
flash, still pointing up. The other five cells stay blank magenta.
Row 3 is a four-frame death in the first four cells: it cracks, splits in
two, the shards scatter, the shards fade to almost nothing. The last two
cells stay blank magenta.
Row 4 is a four-frame spawn in the first four cells: a thin streak rising
from the bottom of the cell, half the body formed, the full body, the body
settled in place. The last two cells stay blank magenta.

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
