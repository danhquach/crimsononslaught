# CO-074 Art: Boss — 4 facings walk, telegraph, charge, hurt, death

## What to do
1. Copy each prompt block marked "to do" into the art agent, one sheet per run. Attach the approved reference sheet from #53 (hero locomotion) as the style reference.
2. If the tool has a negative prompt field, paste this into it for every sheet:
   `text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, drop shadow, blur, gradient`
3. Attach every resulting PNG to this issue (drag into a comment).
4. Post the pixel dimensions the agent reported for each PNG.

Object: the Boss. In-game 80 x 80 px, drawn at 4x (about 320 px) inside 384 px cells. Huge horned violet demon lord with wings. Behaviour to cover: slow walk, a wind-up flash before a charge, the charge, being hurt, dying.

## Sheet 1 — `boss_walk.png` — to do

Delivered as: JPEG 1024x1024 px (asked 1536x1536, 4x4 of 384 px); ruled grid band: no.

```text
Create one pixel-art animation sheet for the boss of a top-down 2D game.
The creature is a huge horned demon lord with violet (#9C27B0) skin, crimson
and black wing membranes and armour, pale horns and claws, seen from a
three-quarter top-down camera. It is about 320 px tall inside a 384 px cell,
the same creature as on the reference sheet.

Cells are 384 px square, 4 across and 4 down, so the image is 1536 x 1536 px.
Every row is a four-frame walk cycle: left foot forward, feet together, right
foot forward, feet together, with the leg change and the wing sway clearly
visible from frame to frame.
Row 1 walks toward the camera, facing down. Row 2 walks away from the
camera, facing up, showing its back and wings. Row 3 walks facing left, its
face and horns toward the left edge. Row 4 walks facing right, its face and
horns toward the right edge, drawn fresh and not copied from row 3.

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
- One file per sheet (PNG preferred; JPEG accepted on flat magenta), at the largest size
  available. Report the exact pixel dimensions.
```

## Sheet 2 — `boss_charge.png` — to do

Delivered as: JPEG 1024x1024 px (asked 1536x1536, 4x4 of 384 px); ruled grid band: no.

```text
Create one pixel-art animation sheet for the boss of a top-down 2D game.
The creature is a huge horned demon lord with violet (#9C27B0) skin, crimson
and black wing membranes and armour, pale horns and claws, seen from a
three-quarter top-down camera, about 320 px tall inside a 384 px cell, the
same creature as on the reference sheet.

Cells are 384 px square, 4 across and 4 down, so the image is 1536 x 1536 px.
Each row shows one facing: row 1 faces down toward the camera, row 2 faces
up away from the camera, row 3 faces left, row 4 faces right, each drawn
fresh in its own direction.
In every row the four cells are, in order: the boss crouching with wings
pulled back and its eyes and body veins starting to glow pinkish white; the
same crouch with the glow at full strength so the whole body reads much
lighter, which is the warning flash; the boss lunging forward with wings
back and claws out, with short motion streaks behind it kept inside the
cell; a second lunge frame with the legs swapped.

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
- One file per sheet (PNG preferred; JPEG accepted on flat magenta), at the largest size
  available. Report the exact pixel dimensions.
```

## Sheet 3 — `boss_states.png` — to do

Delivered as: PNG 1344x1008 px (asked 1728x1296, 4x3 of 432 px); ruled grid band: no.

```text
Create one pixel-art animation sheet for the boss of a top-down 2D game.
The creature is a huge horned demon lord with violet (#9C27B0) skin, crimson
and black wing membranes and armour, pale horns and claws, seen from a
three-quarter top-down camera, about 320 px tall inside a 432 px cell, the
same creature as on the reference sheet.

Cells are 432 px square, 4 across and 3 down, so the image is 1728 x 1296 px.
Row 1 shows the boss recoiling from a hit, head thrown back and wings
flared with a brief pale flash: the first cell facing down, the second
facing up, the third facing left, the fourth facing right.
Row 2 is the first half of its death, facing down, four frames in order: it
roars with wings spread; the wings tear; it sinks to its knees; its body
cracks with light leaking out of the cracks.
Row 3 is the second half, four frames in order: the body bursts into violet
shards; the shards spread outward; the shards fade; only a faint ring of
dust remains, so the last cell is almost blank.

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
- One file per sheet (PNG preferred; JPEG accepted on flat magenta), at the largest size
  available. Report the exact pixel dimensions.
```

## Done when
Every sheet marked "to do" is attached at the stated grid. Engine integration is a separate ticket that depends on this one.
