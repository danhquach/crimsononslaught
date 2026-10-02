# CO-222 Art: the boss's Ground slam

Ticket: [#390](https://github.com/danhquach/crimsononslaught/issues/390)

The boss stops, rears up and slams both fists into the floor. Through the 1 s wind-up a red disc with a bright rim marks the floor it will hit, and on the slam a thin ring of fire flares along the rim's edge. The warning is concept A of three (A filled red disc with a bright rim, B thin rune ring, C dashed ring with a shrinking countdown ring); A's filled disc reads best as "inside means hit". The impact was first built as concept B's white shockwave over a cracked crater; in game it read as too much even dimmed, and a thick fire band did not read as fire, so it is now concept C's thin ring of fire, generated with the concept picture attached. In game the rim draws at 55% opacity and the disc at 20%.

The warning is drawn as a circle seen straight from above, not a three-quarter oval, because the hit test is a circle: the rim sprite is scaled so its outer edge sits on the slam's radius. Both sheets are cut onto their own atlas page 26, so no other page is re-quantised.

## `boss_slam.png`: the boss's slam pose

Save as `docs/art/sheets/CO-222/boss_slam.png`. Generated as an edit with `docs/art/sheets/CO-074/boss_walk.jpg` attached as the reference. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1536x1536 px from `openai/gpt-image-2` (quality medium, edit with the CO-074 walk sheet attached). The model drew its rows on its own grid: feet sat on y of about 383, 765, 1115 and 1450 instead of the 384 px cell lines, so rows ran across them. The boss was also drawn about 13% smaller than on the walk sheet. Re-gridded by moving pixels: magenta keyed (plus the house fringe rule), each drawing taken as its connected parts grouped to the nearest grid slot, then placed in a 408 px grid with its mass centre on the cell centre and its feet on the walk sheet's feet line for that facing (42, 45, 46 and 46 game px below the anchor for down, up, left and right). Specks under 12 px were dropped. Saved as PNG (1632x1632) with no C2PA chunk. Cut at `sheetCell` 480 (3.4 sheet px per game px, the walk sheet's scale for this drawing), not centred, with the boss recolour, on `props26`: columns 1-2 are `boss.slamWindup.<facing>`, columns 3-4 are `boss.slam.<facing>`.

```text
Create one pixel-art sprite sheet of the exact same boss as the attached reference sheet: the huge horned demon lord with violet skin, crimson and black wings and armour, pale horns and claws. Same proportions, same palette, same pixel size, same three-quarter top-down camera, light from the top-left. This sheet is the boss's GROUND SLAM: it rears up and smashes both fists into the floor.

The canvas is 1536 by 1536 pixels, a grid of 384 pixel square cells, four cells across and four cells down. Each row is one facing, and the four columns are the slam frames in time order: column 1 wind-up, rising tall with both arms lifting overhead and the wings spreading; column 2 peak of the wind-up, both fists raised high together above the horns, wings fully spread, body leaning back; column 3 impact, body slammed down into a deep crouch with both fists driven into the ground in front of it, wings snapped down; column 4 follow-through, still crouched low with the fists on the ground, starting to rise.
Row 1: the boss faces down, toward the viewer.
Row 2: the boss faces up, away from the viewer, back and wings to the camera.
Row 3: the boss faces left, face and horns toward the left edge.
Row 4: the boss faces right, face and horns toward the right edge.
Draw each row separately; never mirror or copy another row. The boss is a little smaller than in the reference, about 280 pixels tall in a 384 pixel cell, with the feet on the same line in every cell of a row. Every drawing, raised fists and spread wings included, stays inside the middle three quarters of its cell and never touches a cell edge. Draw only the boss: no dust, no cracks, no shockwave, no rocks, no speed lines, no glow, no shadow.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; original design.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing marks where one ends and the next begins, no tile, panel, line, border or frame. No text anywhere: one letter, number, label or watermark ruins the sheet.
```

## `boss_slam_fx.png`: warning rim and warning disc

Save as `docs/art/sheets/CO-222/boss_slam_fx.png`. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1536x1152 px from `openai/gpt-image-2` (quality medium), on a green key because the art is red. It was generated with a third row, a white shockwave, since retired for the fire ring below and cropped off the sheet; the prompt below is trimmed to the two rows kept. Pixels with green over 40 above both red and blue were snapped to #00FF00; the near-white shockwave pixels with a slight green cast had green set to their larger other channel, so the white ring kept its pixels (the house `g > r && g > b` snap punched holes in it). The four rims came out 294 to 325 px across, so each rim was scaled nearest-neighbour to the discs' 302 px, so the warning's edge stays on the hit radius as it pulses. The impact's second and third frames ran over the row line by a few stones, so every drawing was re-gridded by moving pixels into 400 px cells, each centred on its largest connected part (rims and discs by box, impact frames by mass so the crater stays still under the flying stones). Specks under 6 px were dropped. Saved as PNG (1600x800 after the crop) with no C2PA chunk. Cut at `sheetCell` 384, `centred`, on `props26`: row 1 is `boss.slamWarnRim`, row 2 `boss.slamWarnFill`.

```text
Create one pixel-art sprite sheet for a top-down 2D game: the floor warning of a boss's ground slam. Draw only the effect, no creature, no character, no floor tiles.

The canvas is 1536 by 768 pixels, a grid of 384 pixel square cells, four cells across and two cells down. Each row is one animation and the columns are its frames in time order from left to right. Every drawing is a perfect circle seen straight from above, not an oval, centred in its cell, about 330 pixels across, never touching a cell edge, with at least 24 pixels of plain green round it.
Row 1, warning rim loop: a hollow ring, a bright red circle outline about 14 pixels thick, its whole inside left plain green. The four frames are one seamless pulse: the ring glows brighter and a little thicker, then dimmer and thinner, the same outer diameter in all four frames.
Row 2, warning fill loop: a flat solid blood-red disc with no rim, the same outer diameter as row 1, with a faint darker pattern of pixel speckles that shifts slightly from frame to frame. The same disc size in all four frames.

Colours: rim bright red #FF3030 with lighter #FF6A6A highlights and #C8102E shade; disc blood red #C8102E and #8E0B20. No green, no blue, no violet anywhere in the drawings.

Style: chunky pixel art, crisp hard edges, no blur, no anti-aliasing, no soft glow, no gradients; original design.
Background: the file is one sheet of flat pure green #00FF00 with the drawings sitting straight on it. Green runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing marks where one ends and the next begins, no tile, panel, line, border or frame. No text anywhere: one letter, number, label or watermark ruins the sheet. Give every cell visible art.
```

## `boss_slam_shock.png`: the ring of fire

Save as `docs/art/sheets/CO-222/boss_slam_shock.png`. Generated as an edit with concept C (the dashed-ring concept, whose right half shows a fire ring round the boss) attached as the reference. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1408x480 px from `openai/gpt-image-2` (quality medium, edit with concept C attached), on a green key. Pixels with green over 40 above both red and blue were snapped to #00FF00, and every other pixel had its green clamped to 0.8 of its red: the JPEG left an olive fringe on about 17% of the thin flames, and the clamp turns it orange while the yellow tips (green 0.76 of red) keep. Specks under 12 px were dropped (the stray dots inside frames 1 and 2). Every frame was scaled nearest-neighbour by one factor, 0.965, that puts frame 1's outer edge on the warning rim's 302 px, and centred on its box in a 400 px grid. Saved as PNG (1600x400) with no C2PA chunk. Cut at `sheetCell` 384, `centred`, on `props26` as `boss.slamShock`.

```text
The attached picture's right-hand panel shows a ring of fire erupting from the floor around a boss. Create one pixel-art sprite sheet of only that ring of fire, in the same style: thin flickering flame licks of red, orange and bright yellow-orange with tiny sparks, standing on a thin glowing burning line. Draw nothing else: no boss, no characters, no floor, no cobblestones, no cracks, no scorch marks.

The canvas is 1536 by 384 pixels, a grid of 384 pixel square cells, four cells across and one cell down. The four cells are the frames in time order from left to right, and the animation plays once. Every drawing is a perfect circle seen straight from above, not an oval, centred in its cell, about 320 pixels across, never touching a cell edge, with at least 24 pixels of plain green round it. The ring is THIN: the burning line is about 6 pixels thick and the flame licks rise only about 18 pixels from it, many small separate flames all round the circle, like the reference. The whole inside of the circle is plain green.
Frame 1: the burning line ignites all round with small low flames and sparks.
Frame 2: the flames are at their fullest, licking and flickering all round, sparks flying off.
Frame 3: the flames shrink low and flicker out in places, glowing embers on the line.
Frame 4: only a faint broken glowing line with a few tiny embers remains.

Colours: deep red #B01818, red-orange #E8401A, orange #F7841E, bright yellow-orange #FFC23A tips and sparks. No green, no blue, no violet anywhere in the drawings.

Style: pixel art, crisp hard edges, no blur, no anti-aliasing, no soft glow, no gradients; original design.
Background: the file is one sheet of flat pure green #00FF00 with the drawings sitting straight on it. Green runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing marks where one ends and the next begins, no tile, panel, line, border or frame. No text anywhere: one letter, number, label or watermark ruins the sheet. Give every cell visible art.
```
