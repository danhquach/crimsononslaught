# CO-073 Art: Tank enemy — 4 facings walk, hurt, death, spawn

## What to do
1. Copy each prompt block below into the art agent, one sheet per run. Attach the approved prop sheet from #53 as the style reference.
2. Attach every resulting PNG to this issue (drag into a comment), named as given.
3. If the tool has a NEGATIVE PROMPT field, paste this into it for every sheet:
   `text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, drop shadow, blur, gradient`
4. Post the pixel dimensions the agent reported for each PNG.

Object: the Tank enemy. In-game 32 x 32 px, drawn at 4x (about 128 px) inside 192 px cells. Heavy armored dark-red brute; slow, so a 4-facing walk is worth it.

## Sheet 1 — `enemy_tank_walk.png` (CELL 192, COLS 4, ROWS 4)

```text
Create ONE pixel-art animation sheet for the TANK ENEMY of a top-down 2D
game. Creature: heavy squat armored brute, dark blood-red (#8E1B1B) skin,
dark iron-grey plate armor with shoulder spikes, 3/4 top-down camera. About
128 px tall inside a 192 px cell. Same creature as the approved prop sheet.

CELL = 192 px. COLS = 4. ROWS = 4. Image 768 x 768 px.
Row 1 = WALK FACING DOWN, 4 frames (slow heavy stomp: left foot forward,
feet together, right foot forward, feet together — the leg change must be
clearly visible between frames). Row 2 = WALK FACING UP. Row 3 = WALK FACING LEFT.
Row 4 = WALK FACING RIGHT (draw it, do not mirror).
Feet on the same baseline in every cell of a row.

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

## Sheet 2 — `enemy_tank_states.png` (CELL 192, COLS 6, ROWS 3)

```text
Create ONE pixel-art animation sheet for the TANK ENEMY of a top-down 2D
game. Same creature: heavy squat armored brute, dark blood-red (#8E1B1B)
skin, dark iron-grey plate armor, 3/4 top-down camera, about 128 px tall
inside a 192 px cell.

CELL = 192 px. COLS = 6. ROWS = 3. Image 1152 x 576 px.
Row 1 = HURT, one frame per facing: col 1 down, col 2 up, col 3 left,
col 4 right (armor jolts, head snaps back). Cols 5-6 EMPTY.
Row 2 = DEATH facing down, 6 frames (stagger, drop to a knee, armor cracks,
collapse, crumble to rubble, rubble fades).
Row 3 = SPAWN facing down, 4 frames (climb out of a cracked patch of
ground: crack, shoulders, standing, crack seals). Cols 5-6 EMPTY.

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
