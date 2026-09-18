# CO-070 Art: Player hero — 4 facings, idle, walk, hurt, death

## What to do
1. Copy each prompt block below into the art agent, one sheet per run. Attach the approved prop sheet from #53 as the style reference.
2. Attach every resulting PNG to this issue (drag into a comment), named as given.
3. If the tool has a NEGATIVE PROMPT field, paste this into it for every sheet:
   `text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, drop shadow, blur, gradient`
4. Post the pixel dimensions the agent reported for each PNG.

Object: the player hero. In-game size 28 x 28 px, drawn here at 4x (about 112 px tall). Hero is a lone mage/warrior in a white hooded cloak with crimson trim, holding a staff, as in the approved prop sheet.

## Sheet 1 — `hero_locomotion.png` (CELL 192, COLS 6, ROWS 4)

```text
Create ONE pixel-art animation sheet for the PLAYER HERO of a top-down 2D game.
Character: lone mage/warrior in a white hooded cloak (#F5F5F5) with crimson
(#DC143C) trim, wooden staff with a red gem, seen from a 3/4 top-down camera.
About 112 px tall inside a 192 px cell.

CELL = 192 px. COLS = 6. ROWS = 4. Image 1152 x 768 px.
Row 1 = FACING DOWN (toward camera). Row 2 = FACING UP (back to camera).
Row 3 = FACING LEFT. Row 4 = FACING RIGHT (draw it, do not mirror; the staff
is always in the same hand).
In every row ALL 6 cells face the same direction as that row.
Columns 1-2 = IDLE in that facing (2 frames: breathe / cloak sway, subtle);
columns 3-6 = WALK cycle in that facing (4 frames: left foot forward, feet
together, right foot forward, feet together — the leg change must be clearly
visible, cloak swings). Feet stay on the same baseline in all 6 cells.

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

## Sheet 2 — `hero_states.png` (CELL 192, COLS 6, ROWS 2)

```text
Create ONE pixel-art animation sheet for the PLAYER HERO of a top-down 2D game.
Same character as before: white hooded cloak (#F5F5F5), crimson (#DC143C)
trim, wooden staff with a red gem, 3/4 top-down camera, about 112 px tall
inside a 192 px cell.

CELL = 192 px. COLS = 6. ROWS = 2. Image 1152 x 384 px.
Row 1 = HURT: the hero recoiling from a hit, eyes shut, cloak flared. Col 1
shows him facing down, col 2 facing up, col 3 facing left, col 4 facing
right. Cols 5-6 EMPTY.
Row 2 = DEATH, hero facing down, 6 frames in order: he staggers back; he
drops to his knees; he falls forward; he lies flat on the ground with the
staff beside him; his body fades to a pale ghostly silhouette; only a faint
curl of mist remains. Frame 6 is mostly empty.

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
