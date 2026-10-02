# CO-220 Art: the boss's Enrage aura and burst

Ticket: [#388](https://github.com/danhquach/crimsononslaught/issues/388)

When the boss enters Enrage it stands on a ring of burning floor cracks with embers rising round it for the rest of the fight, and the ring erupts once as it starts. The look is concept B of three (A red rim glow on the silhouette, B ember ring on the floor, C flame mantle behind the wings). B was picked because one ground layer works under all four facings, stays readable on the dark floor and never covers the sprite.

The aura sheet is a 4 x 2 grid. Row 1 is the looping aura and row 2 is the one-off burst, four frames each. The sheet is cut onto its own atlas page 24, so no other page is re-quantised.

## `boss_enrage.png`: aura and burst

Save as `docs/art/sheets/CO-220/boss_enrage.png`. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1152x576 px from `openai/gpt-image-2` (quality medium), on a green key because the art is red and orange. Every green-dominant pixel (`g > r && g > b`) was snapped to #00FF00. Every cell passed the cutter's probe with no edge touched, and the ring sits at the same x in all four aura frames, so no pixels were moved. Saved as PNG with no C2PA chunk. Cut at `sheetCell` 288, `centred`, on `props24`: row 1 is `boss.enrageAura`, row 2 is `boss.enrageBurst`.

```text
Create one pixel-art sprite sheet for a top-down 2D game: a burning ground aura that sits under an enraged boss. Draw only the glowing floor cracks and the embers, no creature, no character, no floor tiles.

The canvas is 1024 by 512 pixels, a grid of 256 pixel square cells, four cells across and two cells down. Each row is one animation and the columns are its frames in time order from left to right. Every drawing stays centred in its cell and never touches a cell edge, with at least 20 pixels of plain green round it.
Row 1, ember ring loop: a flat oval ring of glowing jagged cracks seen from a three-quarter top-down camera, about 210 pixels wide and 110 pixels tall, its centre left empty, with a few short cracks branching outward. Small square embers float above and around the ring, rising upward. The four frames are one seamless loop: the crack glow flickers brighter and dimmer and the embers rise a little higher each frame, the same ring shape in all four frames.
Row 2, enrage burst: a one-off eruption from the same oval ring. Frame 1 the ring flares bright with a burst of embers, frame 2 a wide ring of red-orange flame shoots outward to about 220 pixels with many embers flying out, frame 3 the flame ring breaks into flying embers and fading cracks, frame 4 only a few scattered small embers remain.

Colours: blood red #C8102E, bright red #FF3030, orange #FF8C1A and a few yellow-white #FFE08A hot cores, with dark crimson #5A0A14 edges. No green, no blue, no violet anywhere in the drawings.

Style: chunky pixel art, crisp hard edges, no blur, no anti-aliasing, no soft glow, no gradients; original design.
Background: the file is one sheet of flat pure green #00FF00 with the drawings sitting straight on it. Green runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing marks where one ends and the next begins, no tile, panel, line, border or frame. No text anywhere: one letter, number, label or watermark ruins the sheet. Give every cell visible art.
```

## `boss_bar_flames.png`: the boss bar on fire

While the boss is enraged, a row of flames burns along the top of the HUD boss bar. The look is concept A of three (A flames along the top, B molten fill, C a burning fuse at the fill's end). One short flame clump is tiled along the bar, and each tile starts on a different frame so the repeat does not show.

Save as `docs/art/sheets/CO-220/boss_bar_flames.png`. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1152x576 px from `openai/gpt-image-2` (quality medium), on a green key. Every green-dominant pixel was snapped to #00FF00. Row 2's flame base sat 13 px higher than row 1's, so row 2 was moved down 13 px whole to keep the base still across the loop, and stray sparks under the base in frames 1 and 2 were cleared to the key; no pixel was redrawn. Saved as PNG with no C2PA chunk. Cut at `sheetCell` 288, `centred`, on `props24`: all eight cells, row 1 then row 2, are `hud.bossFlames`.

```text
Create one pixel-art sprite sheet for a 2D game: an eight-frame looping animation of a low row of flames burning along the top edge of a health bar. Draw only the flames, no bar, no frame, no skull, no floor.

The canvas is 1024 by 512 pixels, a grid of 256 pixel square cells, four cells across and two cells down. The eight cells are the eight frames in reading order, left to right along row 1 and then left to right along row 2, and frame 8 loops back into frame 1 seamlessly. Every drawing stays centred in its cell and never touches a cell edge, with at least 20 pixels of plain green round it.
Each frame: a wide, low clump of five or six flame tongues side by side, about 210 pixels wide, standing on one flat straight base line about 70 pixels below the cell's centre, the tallest tip about 130 pixels high. The flames flicker from frame to frame: tongues grow, lean, split and shrink, a few small square sparks break off the tips and rise. The base line stays at the same height and the same width in every frame.

Colours: blood red #C8102E outer flame, bright red #FF3030, orange #FF8C1A and small yellow-white #FFE08A cores near the base, dark crimson #5A0A14 tips edges. No green, no blue, no violet anywhere in the drawings.

Style: chunky pixel art, crisp hard edges, no blur, no anti-aliasing, no soft glow, no gradients; original design.
Background: the file is one sheet of flat pure green #00FF00 with the drawings sitting straight on it. Green runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing marks where one ends and the next begins, no tile, panel, line, border or frame. No text anywhere: one letter, number, label or watermark ruins the sheet. Give every cell visible art.
```
