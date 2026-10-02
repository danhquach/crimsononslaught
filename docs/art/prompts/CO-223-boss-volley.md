# CO-223 Art: the boss's Bolt volley

Ticket: [#391](https://github.com/danhquach/crimsononslaught/issues/391)

The boss stops, spreads its arms and wings and gathers bright magenta light in both open hands for 1.2 s, then releases a ring of orbs. The look is concept A of three (A magenta arcane orbs, B hellfire bolts, C ice-lightning shards); A was picked, with the sparkle trail pointing back toward the boss. A bolt is a round magenta-pink orb with a white-hot core, flying with a violet-pink sparkle trail behind it; it pops into a ring of sparks where it ends. Both sheets are cut onto their own atlas page 27, so no other page is re-quantised.

The bolt sprite is drawn flying to the right with its trail on the left, and its origin (the frame anchor) is the orb's centre, so the game rotates it to the flight angle about that origin. The orb is about 16 game px across (the bolt's hit radius is 8 px).

## `boss_volley.png`: the boss's wind-up pose

Save as `docs/art/sheets/CO-223/boss_volley.png`. Generated as an edit with `docs/art/sheets/CO-074/boss_walk.jpg` attached as the reference, 1536x1536, quality medium. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1536x1536 px from `openai/gpt-image-2`, on a green key because the art is pink. The model drew the boss about 0.72 of the walk sheet's cell fill, with rows on its own lines (feet at y of about 328, 720, 1085 and 1445). Re-gridded by moving pixels: pixels with green above both red and blue were snapped to #00FF00 (near-white pixels with a green cast had green set to their larger other channel instead, so the white cores kept their pixels), each drawing taken as its connected parts grouped to the grid slot of their centroid, then placed in a 420 px grid with its feet on the walk sheet's feet line for that facing (41.5, 43.7, 46.1 and 46.1 game px below the anchor for down, up, left and right, averaged over the walk frames) and its feet centre on the walk sheet's feet x. Specks under 12 px were dropped, except pink glow sparks of 6 px or more. Saved as PNG (1680x1680) with no C2PA chunk. Cut at `sheetCell` 600 (2.8 sheet px per game px, which puts the boss at the walk sheet's size: about 89 game px wing tip to feet), not centred, with the boss recolour, on `props27`: columns 1-3 are `boss.volleyWindup.<facing>` (held on the last, orbs at their biggest), column 4 is `boss.volley.<facing>` (one flaring frame held through the release).

```text
Create one pixel-art sprite sheet of the exact same boss as the attached reference sheet: the huge horned demon lord with violet skin, crimson and black wings and armour, pale horns and claws. Same proportions, same palette, same pixel size, same three-quarter top-down camera, light from the top-left. This sheet is the boss's BOLT VOLLEY wind-up: it stands still, spreads its arms and wings wide and gathers bright magenta arcane light in both open hands before firing a ring of orbs.

The canvas is 1536 by 1536 pixels, a grid of 384 pixel square cells, four cells across and four cells down. Each row is one facing, and the four columns are the wind-up frames in time order: column 1 arms starting to spread out to the sides, small magenta sparks in the palms; column 2 arms spread wide, wings opening, a bright magenta orb of light with a white core in each open hand; column 3 arms and wings fully spread, the orbs in both hands at their biggest and brightest, body leaning back; column 4 the same pose with the orbs flaring white-pink, about to release.
Row 1: the boss faces down, toward the viewer.
Row 2: the boss faces up, away from the viewer, back and wings to the camera.
Row 3: the boss faces left, face and horns toward the left edge.
Row 4: the boss faces right, face and horns toward the right edge.
Draw each row separately; never mirror or copy another row. The boss is about 280 pixels tall in a 384 pixel cell, with the feet on the same line in every cell of a row. Every drawing, spread wings and glowing hands included, stays inside the middle three quarters of its cell and never touches a cell edge. Draw only the boss and the light in its hands: no projectiles in flight, no dust, no shockwave, no floor, no shadow.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; original design.
Background: the file is one sheet of flat pure green #00FF00 with the drawings sitting straight on it. Green runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no texture, noise or vignette. No green anywhere in the drawings.
The cells are a measurement, not something to draw: nothing marks where one ends and the next begins, no tile, panel, line, border or frame. No text anywhere: one letter, number, label or watermark ruins the sheet.
```

## `boss_volley_fx.png`: the bolt and its burst

Save as `docs/art/sheets/CO-223/boss_volley_fx.png`. Generated as an edit with concept A attached as the reference. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1536x768 px from `openai/gpt-image-2`, on a green key. Row 1 cells 1 and 2 carried a band of orange speckle noise under the bolt (781 px, off-palette: blue below 0.6 of red); those pixels were dropped. Pixels with green above both red and blue were snapped to #00FF00 (white cores with a green cast kept, as above). The trail came out about 250 px long, not 150, and the orb about 98 px across. Re-gridded by moving pixels into 560x400 cells: each bolt frame placed with the centroid of its white core (the orb centre) on the cell centre, so the origin is the same in all four frames and the trail runs left; each burst frame centred on its box. Specks under 6 px were dropped. Saved as PNG (2240x800) with no C2PA chunk. Cut at `sheetCell` 256 (6.25 sheet px per game px, the orb about 16 px) on `props27`: row 1 is `boss.bolt` (loop, not centred, anchor on the orb centre), row 2 `boss.boltHit` (once, `centred`).

```text
The attached picture shows glowing magenta arcane orbs flying with sparkling trails. Create one pixel-art sprite sheet of only that orb projectile and its burst, in the same style and colours. Draw nothing else: no boss, no characters, no floor, no cobblestones.

The canvas is 1536 by 768 pixels, a grid of 384 pixel square cells, four cells across and two cells down. Each row is one animation and the columns are its frames in time order from left to right.
Row 1, flight loop: one orb flying to the RIGHT. A round bright magenta-pink orb with a white-hot core, about 90 pixels across, sitting right of the cell centre, and behind it on its LEFT a short tapering trail of pink and violet sparkles about 150 pixels long, so the orb leads toward the right edge and the trail points back toward the left edge. The four frames are one seamless loop: the core pulses slightly and the trail sparkles shift. The orb is the same size and in the same place in all four frames.
Row 2, burst, plays once: the orb pops where it stands. Frame 1 the orb swells to a bright white-pink flash about 120 pixels across; frame 2 it breaks into a small ring of pink sparks; frame 3 fewer, smaller sparks spread wider; frame 4 only a few faint violet specks. Centred in each cell, no trail.
Every drawing stays inside its cell with at least 30 pixels of plain green round it and never touches a cell edge.

Colours: orb and sparks magenta #FF3CF0, hot pink #FF7AF5, white #FFFFFF core, violet #A030E0 shade. No green anywhere in the drawings.

Style: chunky pixel art, crisp hard edges, no blur, no anti-aliasing, no soft glow halo, no gradients; original design.
Background: the file is one sheet of flat pure green #00FF00 with the drawings sitting straight on it. Green runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing marks where one ends and the next begins, no tile, panel, line, border or frame. No text anywhere: one letter, number, label or watermark ruins the sheet. Give every cell visible art.
```
