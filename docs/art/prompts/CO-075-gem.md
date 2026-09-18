# CO-075 Art: XP gem — idle sparkle, drift, pickup burst

## What to do
1. Copy each prompt block below into the art agent, one sheet per run. Attach the approved prop sheet from #53 as the style reference.
2. Attach every resulting PNG to this issue (drag into a comment), named as given.
3. If the tool has a NEGATIVE PROMPT field, paste this into it for every sheet:
   `text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, drop shadow, blur, gradient`
4. Post the pixel dimensions the agent reported for each PNG.

Object: the XP gem. In-game 12 x 16 px, drawn at 4x (about 48 x 64 px) inside 96 px cells. Mint-green faceted crystal. Gems sit on the ground, sparkle, then drift toward the player and vanish on pickup.

## Sheet — `gem.png` (CELL 96, COLS 6, ROWS 3)

```text
Create ONE pixel-art animation sheet for the XP GEM of a top-down 2D game.
Object: small faceted crystal, taller than wide, mint green (#69F0AE) with a
lighter core, no outer glow beyond its pixels. About 48 x 64 px inside a
96 px cell. Same gem as the approved prop sheet.

CELL = 96 px. COLS = 6. ROWS = 3. Image 576 x 288 px.
Row 1 = IDLE, 4 frames (gentle bob up/down by a few pixels, one sparkle
glint travelling across a facet). Cols 5-6 EMPTY.
Row 2 = DRIFT (being pulled toward the player), 2 frames (gem tilted, two
short trailing streaks behind it that stay inside the cell). Cols 3-6 EMPTY.
Row 3 = PICKUP, 4 frames (flash white, burst into 4-6 small green sparks,
sparks spread, sparks fade). Frame 4 mostly transparent. Cols 5-6 EMPTY.

STYLE (same for every sheet in this project)
- Chunky pixel art, crisp hard-edged pixels, no anti-aliasing blur, no
  gradients, no outlines thinner than 1 art pixel.
- 3/4 top-down view (camera slightly above and in front), light from the
  top-left on every frame.
- Dark crimson / charcoal fantasy mood. Original design, do not imitate any
  existing game.
- Match the look of the approved prop sheet for this project (attached).

GRID RULES (strict — frames are cut out by script, by grid position)
- The image contains ONLY sprites on flat magenta. Zero text of any kind:
  no words, letters, numbers, titles or captions in any cell. A single
  character of text makes the whole sheet unusable.
- The image is a uniform grid: CELL px square cells, COLS columns x ROWS rows.
  Total image = (COLS*CELL) x (ROWS*CELL). If you must render smaller, scale
  the WHOLE image proportionally and keep the exact grid count; report the
  final pixel dimensions.
- One frame per cell. Each row is ONE animation; columns are its frames in
  time order, left to right.
- Every sprite stays inside the middle 75% of its cell: never touches or
  crosses a cell edge. Keep the character's feet / the object's center at the
  SAME position in every cell of a row so the animation does not jitter.
- Cells marked EMPTY stay pure flat background. Do not invent extra content.
- Background: ONE flat solid magenta #FF00FF over the whole image, in every
  cell including EMPTY cells. Do NOT draw a checkerboard or any
  "transparency" pattern. No vignette, texture or noise.
- NO drop shadows, NO ground shadows, NO glow beyond the sprite's own pixels,
  NO grid lines, NO borders, NO watermark.
- A row marked FACING RIGHT must be genuinely drawn facing right: face, weapon
  and feet point to the RIGHT edge of the cell. Same for LEFT, UP, DOWN. Never
  copy or mirror another row's pose.

DELIVER
- One PNG file per sheet (PNG, not JPEG), lossless, at the largest size
  available. State the exact pixel dimensions of each PNG.
```

## Done when
Every sheet listed above is attached at the stated grid. Engine integration is a separate ticket that depends on this one.
