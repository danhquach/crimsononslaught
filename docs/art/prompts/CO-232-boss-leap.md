# CO-232 Art: the boss's Leap

Ticket: [#413](https://github.com/danhquach/crimsononslaught/issues/413)

The boss crouches, springs into the air and lands hard. Through the 0.9 s wind-up an orange rune rim and a dark violet shadow disc mark the landing spot (the rim reads on the dark floor, the disc is the shadow), and on the landing a violet-and-crimson shockwave ring bursts out. The look is the concept pick (concepts A to C in this folder; the shadow disc and rim from B, the shockwave from C). Everything is drawn as a circle seen straight from above, because the hit test is a circle. All four sheets are cut onto their own atlas page 31, so no other page is re-quantised.

## `boss_leap.png`: the boss's leap poses

Save as `docs/art/sheets/CO-232/boss_leap.png`. Generated as an edit with `docs/art/sheets/CO-074/boss_walk.jpg` attached as the reference. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1536x1536 px from `openai/gpt-image-2` (quality medium, edit with the CO-074 walk sheet attached), on a magenta key. The model drew on its own grid: feet sat on y of about 360, 730, 1100 and 1462 instead of the 384 px cell lines, and the spring frames were taller (about 300 px against 215 for the crouch). Re-gridded by moving pixels, as on CO-222: pixels over 60 from #FF00FF kept (the faint ghost speckles in the magenta fall under it), each drawing taken as its one connected part (16 parts, none under 12 px), placed whole, not resampled, in a 476 px grid with its mass centre on the cell centre horizontally. Crouch, landing and recover have their lowest pixel on the walk sheet's feet line for that facing (42, 45, 46 and 46 game px below the anchor at 3.4 sheet px per game px, the same scale as the slam: rows end 381, 390, 395 and 395 px down the cell). The spring frame keeps the crouch frame's shift and is then lifted so it clears the crouch's feet by 40 px (about 12 game px): the model had already lifted the left and right springs by 39 and 45 px, so those are untouched, while the down spring (feet still on the floor, lift 1 px) and the up spring (19 px) were raised the rest of the way by moving the whole drawing up, so all four read as airborne. The widest drawing (the landing, 411 px) did not fit the slam's 408 px grid, hence the 476 px grid. Saved as PNG (1904x1904) with no C2PA chunk. Cut at `sheetCell` 560 (476 / 140 native = 3.4 sheet px per game px), not centred, with the boss recolour, on `props31`: columns 1-2 are `boss.leapWindup.<facing>` (crouch, spring), columns 3-4 are `boss.leap.<facing>` (land, recover). Pacing: the wind-up is 0.9 s, so `boss.leapWindup` plays at 1.8 fps, once, which holds the crouch for 0.55 s and shows the spring frame for the last 0.35 s.

```text
Create one pixel-art sprite sheet of the exact same boss as the attached reference sheet: the huge horned demon lord with violet skin, crimson and black wings and armour, pale horns and claws. Same proportions, same palette, same pixel size, same three-quarter top-down camera, light from the top-left. This sheet is the boss's LEAP: it crouches, springs into the air and lands hard.

The canvas is 1536 by 1536 pixels, a grid of 384 pixel square cells, four cells across and four cells down. Each row is one facing, and the four columns are the leap frames in time order: column 1 crouch, body sunk low on bent legs, claws touching the floor, wings raised and half spread; column 2 spring, body stretched upward leaving the ground with the legs pushing off, wings swept fully up; column 3 landing, dropped onto one knee with one fist driven into the ground in front of it, wings snapped open wide; column 4 recover, still low on one knee starting to rise, wings folding.
Row 1: the boss faces down, toward the viewer.
Row 2: the boss faces up, away from the viewer, back and wings to the camera.
Row 3: the boss faces left, face and horns toward the left edge.
Row 4: the boss faces right, face and horns toward the right edge.
Draw each row separately; never mirror or copy another row. The boss is a little smaller than in the reference, about 280 pixels tall in a 384 pixel cell, with the feet on the same line in every cell of a row. Every drawing, spread wings included, stays inside the middle three quarters of its cell and never touches a cell edge. Draw only the boss: no dust, no cracks, no shockwave, no rocks, no speed lines, no glow, no shadow.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; original design.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing marks where one ends and the next begins, no tile, panel, line, border or frame. No text anywhere: one letter, number, label or watermark ruins the sheet.
```

## `boss_leap_fx.png`: warning rim and shadow disc

Save as `docs/art/sheets/CO-232/boss_leap_fx.png`: row 1 the rim, row 2 the disc. Two prompts, copy each whole block.

Delivered as (rim): JPEG 1408x480 px from `openai/gpt-image-2` (quality medium, no reference), on a green key. Pixels with green above both red and blue were snapped to #00FF00, which also cleared the faint ghost lines the model left inside frames 1 and 2; only the largest connected part of each frame (the ring with its runes) was kept. The four rings came out 285 to 286 px across.

```text
Create one pixel-art sprite sheet for a top-down 2D game: a glowing orange rune circle drawn on the floor, seen straight from above. Draw only the circle: no creature, no floor, no shadow, no dripping lines, no trails, no particles below it.

The canvas is 1536 by 384 pixels, a grid of 384 pixel square cells, four cells across and one cell down. The four cells are the frames of one seamless looping pulse, in time order from left to right. Every drawing is an exact perfect circle, as wide as it is tall, not an oval, centred in its cell, about 320 pixels across, never touching a cell edge, with at least 24 pixels of plain green round it. The ring is a thin orange line about 8 pixels thick with eight small angular rune marks sitting on the line at even spacing round it. The whole inside and outside of the ring is plain green. The frames differ only in brightness: frame 1 medium, frame 2 brightest, frame 3 medium, frame 4 dimmest; the same diameter and the same rune positions in every frame.

Colours: orange #F7841E, bright yellow-orange #FFC23A highlights, dark orange #B8481A shade. No green anywhere in the drawings.

Style: chunky pixel art, crisp hard edges, no blur, no anti-aliasing, no soft glow, no gradients; original design.
Background: the file is one sheet of flat pure green #00FF00 with the drawings sitting straight on it. Green runs unbroken from one edge of the canvas to the other, fully opaque, with no texture, noise or vignette.
The cells are a measurement, not something to draw: no tile, panel, line, border or frame. No text anywhere: one letter, number, label or watermark ruins the sheet.
```

Delivered as (disc): JPEG 1536x768 px from `openai/gpt-image-2` (quality medium, edit with concept B attached), on a green key. Only row 2 (the shadow disc) is kept: row 1 (a rune rim with ghost lines) was retired for the rim sheet above and cropped off. Pixels with green above both red and blue were snapped to #00FF00 and the rest had green held to 0.8 of the larger of red and blue (the near-white ones excepted); 150 green pinholes sealed inside frames 1, 3 and 4 were put back from the delivered pixel the same way; parts under 12 px were dropped. The discs came out 320 to 322 px wide but only 284 px tall (ovals, against the prompt), so each was stretched vertically by nearest-neighbour to a circle of 320 to 322 px. The disc is a dark shadow by design: on the arena floor it reads by its violet veins and its edge, and the orange rim gives the contrast.

Rim and disc were then placed in one 500 px grid (sheet 2000x1000), each centred on its box. The rims were scaled nearest-neighbour by 1.12 so their outer edge (runes included) matches the discs' 321 px mean, so the warning edge holds still as it pulses; the discs were not scaled. Saved as PNG with no C2PA chunk. Cut at `sheetCell` 480 (500 / 120 native = 4.17 sheet px per game px, the slam fx's scale, so both come out about 77 game px across), `centred`, on `props31`: row 1 is `boss.leapWarnRim`, row 2 `boss.leapWarnFill`, both looping at 8 fps.

```text
The attached picture's right-hand side shows a boss's landing spot on the floor: a dark spreading shadow inside a thin glowing orange rune circle. Create one pixel-art sprite sheet of only that floor warning, in the same style. Draw nothing else: no boss, no characters, no floor, no cobblestones.

The canvas is 1536 by 768 pixels, a grid of 384 pixel square cells, four cells across and two cells down. Each row is one animation and the columns are its frames in time order from left to right. Every drawing is a perfect circle seen straight from above, not an oval, centred in its cell, about 330 pixels across, never touching a cell edge, with at least 24 pixels of plain green round it.
Row 1, rune rim loop: a hollow ring, a thin glowing orange circle line about 8 pixels thick with small orange rune marks spaced evenly round it and a few tiny embers, its whole inside left plain green. The four frames are one seamless pulse: the line and runes glow brighter, then dimmer, the same outer diameter in all four frames.
Row 2, shadow fill loop: a flat dark shadow disc with no rim, the same outer diameter as row 1, near-black violet in the middle with darker veins reaching out to a soft-stepped edge. The same disc size in all four frames, the veins shifting slightly from frame to frame.

Colours: rim orange #F7841E with bright #FFC23A highlights and #B8481A shade; shadow #1A0F1E, #2A1830 and #3A2040. No green anywhere in the drawings.

Style: chunky pixel art, crisp hard edges, no blur, no anti-aliasing, no soft glow, no gradients; original design.
Background: the file is one sheet of flat pure green #00FF00 with the drawings sitting straight on it. Green runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing marks where one ends and the next begins, no tile, panel, line, border or frame. No text anywhere: one letter, number, label or watermark ruins the sheet. Give every cell visible art.
```

## `boss_leap_shock.png`: the landing shockwave

Save as `docs/art/sheets/CO-232/boss_leap_shock.png`. Generated as an edit with concept C attached as the reference. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1408x480 px from `openai/gpt-image-2` (quality medium, edit with concept C attached), on a green key. Pixels with green above both red and blue were snapped to #00FF00 and the rest had green held to 0.8 of the larger of red and blue (near-white excepted); parts under 12 px were dropped. The rings came out ovals (frame 1 was 284 by 257 px), so each frame was stretched vertically by nearest-neighbour to the shape of its ring (the large parts, not the flying chips). Every frame was scaled by one factor, 1.13, that puts frame 1's outer edge on the rim's 321 px, so frame 2 grows to about 383 px as drawn, and was centred on its ring in a 500 px grid (frame 3's loose chips had pulled a box centre 30 px off the ring). Saved as PNG (2000x500) with no C2PA chunk. Cut at `sheetCell` 480, `centred`, on `props31` as `boss.leapShock` (once, 10 fps).

```text
The attached picture shows a violet-and-crimson shockwave ring bursting out round a boss as it lands. Create one pixel-art sprite sheet of only that shockwave ring, in the same style: jagged violet and magenta-pink energy spikes with crimson cores and a few small flying stone chips. Draw nothing else: no boss, no characters, no floor, no cobblestones, no crater.

The canvas is 1536 by 384 pixels, a grid of 384 pixel square cells, four cells across and one cell down. The four cells are the frames in time order from left to right, and the animation plays once. Every drawing is a perfect circle seen straight from above, not an oval, centred in its cell, about 320 pixels across, never touching a cell edge, with at least 24 pixels of plain green round it. The ring is thin, its spikes about 24 pixels long, and the whole inside of the circle is plain green.
Frame 1: the ring flashes out bright with short spikes.
Frame 2: the spikes are at their fullest, stone chips flying off.
Frame 3: the spikes thin and break up in places.
Frame 4: only a faint broken ring of small sparks remains.

Colours: violet #8A3CE0, magenta-pink #E040B0, crimson #C8102E, pale pink #FFB0E8 highlights, stone grey #4A4450. No green anywhere in the drawings.

Style: pixel art, crisp hard edges, no blur, no anti-aliasing, no soft glow, no gradients; original design.
Background: the file is one sheet of flat pure green #00FF00 with the drawings sitting straight on it. Green runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing marks where one ends and the next begins, no tile, panel, line, border or frame. No text anywhere: one letter, number, label or watermark ruins the sheet. Give every cell visible art.
```
