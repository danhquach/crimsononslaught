# CO-218 Art: hero dash

Ticket: [#384](https://github.com/danhquach/crimsononslaught/issues/384)

Every loadout can dash: a 150 ms burst of about 120 px with a short invulnerability window. At the concept review the PM picked translucent violet afterimages over a green wind gust and a teal ribbon, then moved the colour to a pale lavender so it stays well away from the magenta enemy shots and every spell's colour. The ghosts themselves are the hero's own current frame redrawn in game with a lavender tint and fading alpha, so they always match the pose. These sheets supply the hero's dash pose, the smoke drawn on each ghost and at take-off, and the HUD icon. The smoke is its own sheet, so a later dash spell can swap it without redrawing the hero.

Three sheets. Copy each whole `text` block and paste it as the prompt. Nothing else to add. The hero sheet is generated as an edit with `docs/art/sheets/CO-070/hero_locomotion.jpg` attached as the reference.

If the tool has a negative-prompt field, paste this into it:

```text
text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, border, grid lines, floor tiles, blur, gradient, jpeg artifacts, drop shadow, motion blur, speed lines on the hero
```

## 1. `hero_dash.png`: the hero's dash pose, four facings

Save as `docs/art/sheets/CO-218/hero_dash.png`. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1152x1536 px from `openai/gpt-image-2` (quality medium, edit with the CO-070 locomotion sheet attached). The model drew on its own grid: rows sat at about y 140, 480, 830 and 1160 instead of on the 384 px cells, and the left row's last frame crossed into the next cell. Re-gridded by moving pixels: each drawing found as one connected part (keyed with the cutter's own `cornerKey`/`softAlpha` at 60/130), grouped into rows and columns at the widest gaps, then placed with its mass centre on the cell centre and its bottom on the walk sheet's feet line (0.87 of the cell) in a 330 px grid, so the hero fills 0.52–0.74 of the cell like the walk frames do (0.68–0.77). Saved as PNG (990x1320) with no C2PA chunk. Cut at `sheetCell` 192 with `maxMagenta` 20 to the hero's 48 px native frame, on its own atlas page (`props22`).

```text
Create one pixel-art sprite sheet of the exact same hero as the attached reference sheet: the small white-hooded mage with crimson trim, dark boots and a wooden staff topped with a red gem. Same proportions, same palette, same pixel size, same three-quarter top-down camera, light from the top-left. This sheet is the hero's DASH: a quick burst of forward movement.

The canvas is 1152 by 1536 pixels, a grid of 384 pixel square cells, three cells across and four cells down. Each row is one facing, and the three columns are the dash frames in time order: column 1 crouch and lean forward ready to burst, column 2 mid-dash stretched low and leaning hard forward with the cloak and hood streaming straight back behind, column 3 recovering upright, cloak settling.
Row 1: the hero faces down, toward the viewer, and dashes toward the viewer.
Row 2: the hero faces up, away from the viewer, back to the camera, and dashes away.
Row 3: the hero faces left and dashes toward the left edge.
Row 4: the hero faces right and dashes toward the right edge.
Draw each row separately; never mirror or copy another row. The hero is the same height as in the reference, about 220 pixels tall in a 384 pixel cell, with the feet on the same line in every cell of a row. Every drawing stays inside the middle three quarters of its cell and never touches a cell edge. Draw only the hero: no speed lines, no smoke, no dust, no motion blur, no glow, no afterimages, no shadow.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; original design.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing marks where one ends and the next begins, no tile, panel, line, border or frame. No text anywhere: one letter, number, label or watermark ruins the sheet.
```

## 2. `dash_wisp.png`: take-off burst and trailing wisp

Save as `docs/art/sheets/CO-218/dash_wisp.png`. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1152x576 px from `openai/gpt-image-2` (quality medium), on a green key because lavender sits too close to magenta for the house key. Every green-dominant pixel (`g > r && g > b`) snapped to #00FF00, saved as PNG with no C2PA chunk. The drawings landed inside their 288 px cells with no edge touched, so no re-grid. Cut at `sheetCell` 192, `centred`, on `props22`: row 1 is `dash.burst`, row 2 is `dash.wisp`.

```text
Create one pixel-art sprite sheet for a top-down 2D game: magical lavender smoke left behind when a hero dashes. Draw only the smoke, no character, no floor.

The canvas is 1024 by 512 pixels, a grid of 256 pixel square cells, four cells across and two cells down. Each row is one animation and the columns are its frames in time order from left to right. Every drawing stays inside a circle 180 pixels across centred in its cell and never touches a cell edge.
Row 1, take-off burst: a ring-shaped puff of smoke bursting outward from the centre. Frame 1 a small tight puff about 70 pixels across, frame 2 bigger and rounder about 120 pixels, frame 3 breaking into curling wisps about 160 pixels, frame 4 a few thin faded scraps.
Row 2, trailing wisp: a small drifting curl of smoke. Frame 1 a dense curl about 110 pixels across, frame 2 slightly larger and looser, frame 3 thinning into two or three strands, frame 4 just a few small faint scraps.

Colours: pale lavender and soft periwinkle violet only, hex #CFC7FF, #9B8CFF, #7A6AE0 and a little deep indigo #4B3FA8 in the shading, with a few tiny near-white sparkles #F2F0FF. No pink, no magenta, no red, no green anywhere in the drawings.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; top-down camera, light from the top-left; original design.
Background: the file is one sheet of flat pure green #00FF00 with the drawings sitting straight on it. Green runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing marks where one ends and the next begins, no tile, panel, line, border or frame. No text anywhere: one letter, number, label or watermark ruins the sheet. Give every cell visible art.
```

## 3. `icon_dash.png`: HUD dash icon

Save as `docs/art/sheets/CO-218/icon_dash.png`. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1024x1024 px from `openai/gpt-image-2` (quality medium), on a green key. Green fringe snapped as for the wisp sheet, saved as PNG with no C2PA chunk. Cut at `sheetCell` 144, `centred`, on `props22` as `icon.dash`.

```text
Create one pixel-art game HUD icon for a DASH ability: a small white-hooded running figure seen from the side, leaning hard forward, with three pale lavender speed streaks and a curl of lavender smoke trailing behind it, inside a round dark indigo badge with a thin pale lavender rim. One icon only, centred, about 760 pixels across, never touching the canvas edge.

Colours: white and pale grey for the figure, pale lavender and periwinkle violet hex #CFC7FF, #9B8CFF, #7A6AE0 for the streaks and smoke, deep indigo #2A2160 for the badge. No pink, no magenta, no red, no green anywhere in the icon.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; light from the top-left; original design.
Background: the canvas is flat pure green #00FF00 everywhere outside the icon, fully opaque, no texture, noise, vignette, border or frame. No text anywhere: one letter, number, label or watermark ruins the icon.
```
