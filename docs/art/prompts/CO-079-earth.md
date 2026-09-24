# CO-079 Art: Earth spell FX — boulder spin, hit impact, knockback dust

## What to do
1. Copy each prompt block below into the art agent, one sheet per run. Attach the approved prop sheet from #53 as the style reference.
2. Attach every resulting PNG to this issue (drag into a comment), named as given.
3. If the tool has a NEGATIVE PROMPT field, paste this into it for every sheet:
   `text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, drop shadow, blur, gradient`
4. Post the pixel dimensions the agent reported for each PNG.

Object: all visuals of the Earth spell (Orbiting Boulders). Boulders ORBIT the player, and on contact deal damage and KNOCK the enemy back. The engine scales boulder size for the Size perk. Boulder in-game 20 px, drawn at 4x (about 80 px) inside 128 px cells.

## Sheet — `earth_boulder.png` (CELL 128, COLS 6, ROWS 3)

Delivered as: JPEG 1456x720 px (asked 768x384, 6x3 of 128 px); ruled grid band: yes, every cell.

```text
Create ONE pixel-art animation sheet for the ORBITING BOULDER of a
top-down 2D game. Object: rough round rock, earthy brown (#8D6E63), a few
darker cracks, small moss patches, seen from above. About 80 px inside a
128 px cell. Same boulder as the approved prop sheet.

CELL = 128 px. COLS = 6. ROWS = 3. Image 768 x 384 px.
Row 1 = SPIN, 6 frames (the boulder rotates clockwise 60 degrees per frame
so frame 6 loops back to frame 1; cracks and moss travel around it; center
stays fixed).
Row 2 = HIT IMPACT, 5 frames (brown-grey dust puff and 4-6 small rock
chips bursting from a point: boulder intact, flash, puff, chips spread,
fade). Frame 5 mostly transparent. Col 6 EMPTY.
Row 3 = KNOCKBACK DUST, 5 frames (a short horizontal skid of dust moving
LEFT to RIGHT, drawn under a pushed enemy: two puffs, puffs grow, trail,
thinning, almost gone). Col 6 EMPTY.

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
- One file per sheet (PNG preferred; JPEG accepted on flat magenta), at the largest size
  available. State the exact pixel dimensions of each PNG.
```

## Done when
Every sheet listed above is attached at the stated grid. Engine integration is a separate ticket that depends on this one.
