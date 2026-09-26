# CO-156 Art: frames and end marks for the HUD bars

Ticket: [#242](https://github.com/danhquach/crimsononslaught/issues/242)

The HP, shield, XP and boss bars were flat rectangles on a dark grey strip. This ticket gives each one a pixel-art frame and an end mark. The look is concept C of three: a glass tube held in dark rails, its end caps bound and wrapped, and a big glossy mark overlapping the left end. HP, shield, XP and boss share that tube but differ in trim, mark and fill colour, so no two read as the same bar.

One sheet per bar, a 2 x 1 grid. Cell 1 is a short, complete framed bar: left cap, plain middle, right cap. The inside of the tube is left magenta, so the cut keys it clear and the game's own fill shows through it. Cell 2 is the end mark. The HUD draws both caps at native size and stretches the plain middle to the bar's length, so the middle must be the same all along. The frames are cut onto their own atlas page 11, so no other page is re-quantised.

Four sheets. Copy each whole `text` block below and paste it as the prompt, with the chosen concept picture attached as the reference. Nothing else to add.

If the tool has a negative-prompt field, paste this into it:

```text
text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, drop shadow, blur, smooth gradient, jpeg artifacts, liquid inside the tube, glass shine inside the tube, glow halo, square tiles, panels, grid lines
```

## 1. `hud_bar_hp.png`: the HP bar

Save as `docs/art/sheets/CO-156/hud_bar_hp.png`. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1152x576 px from `openai/gpt-image-2` (asked 1024x512, 2x1 of 512 px), with concept C attached as the reference. No text or watermark. Each piece was found by its columns of art, not by grid, and area-averaged onto native pixels on its own, averaging the art pixels alone and skipping any magenta-tinted pixel (the house rule, `b > 0.8r && g < 0.6r && r > 140`, plus the hot-pink fringe); a native pixel is art when at least half of it is. The frame's grid is anchored on the tube's inside corner so the trough edges land on whole pixels. Frame at 5 source px per native px, heart at 7. Each piece was then centred in a 112 px native cell and scaled back up 4x nearest-neighbour, so the cutter's 4x nearest-neighbour downscale lands on those averages. Saved as PNG (896x448, IHDR, IDAT and IEND only) before the cut. Ruled grid band: no. `sheetCell` 448, `maxMagenta` 24 for the purple JPEG rim round the thorns. Cuts to a 101x29 frame (tube inside 71x10, caps 21) and a 39x30 heart.

```text
Create one sheet of two pieces of a health bar for a top-down 2D pixel-art game, drawn side by side in one row: a short framed bar on the left and its heart mark on the right. Draw only these two pieces, no text, no player, no monsters and no ground.

The canvas is 1024 by 512 pixels, a grid of 512 pixel square cells, two cells across and one cell down.

The first cell holds a short, complete horizontal bar frame like the one in the attached concept picture, 448 pixels long and centred in its cell, which leaves at least 32 pixels of plain magenta between it and every cell edge. It is a glass tube held in dark wood and black leather. A straight dark brown wooden rail runs along the top and another along the bottom, each 24 pixels thick with a crisp dark outline, and the space between them, 144 pixels tall, is the inside of the tube. At each end is a rounded end cap 80 pixels long, bound in black leather straps and wrapped in dark thorny vines with small crimson thorn tips; the thorns reach at most 24 pixels above and below the rails. Between the two end caps the rails are perfectly plain and exactly the same all along, with no bindings, knots, bolts, thorns or marks, so the middle can be stretched. The inside of the tube is hollow: it is the same plain magenta as the background, with nothing drawn in it, no liquid, no glass, no shine and no shadow, and the rails and caps close it in cleanly on every side.

The second cell holds the heart mark alone, centred in its cell: a big glossy crimson pixel heart like the one in the concept picture, 256 pixels across, deep crimson hex #8C0F1E shading up to bright red hex #E0203A, with a crisp dark outline, a few pale pink highlight pixels at its upper left, and a thin strand of dark thorny vine curling round its lower half.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur and no anti-aliasing; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference picture.
Background: the file is one sheet of flat magenta #FF00FF with the two pieces sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between the pieces and inside the tube alike, fully opaque, with no transparency or alpha channel and no texture, noise, shadow, glow or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta beside a piece is the same magenta everywhere. No text anywhere either: a single character of text, a number, a label or a watermark ruins the sheet.
Each piece stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file.
```

## 2. `hud_bar_shield.png`: the shield bar

Save as `docs/art/sheets/CO-156/hud_bar_shield.png`. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1152x576 px from `openai/gpt-image-2` (asked 1024x512, 2x1 of 512 px), with concept C attached as the reference. No text or watermark. The frame came back 564 px long and ran over the middle cell line. Each piece was found by its columns of art, not by grid, and area-averaged onto native pixels on its own, averaging the art pixels alone and skipping any magenta-tinted pixel (the house rule, `b > 0.8r && g < 0.6r && r > 140`, plus the hot-pink fringe); a native pixel is art when at least half of it is. The frame's grid is anchored on the tube's inside corner so the trough edges land on whole pixels. Frame at 8 source px per native px, shield at 9. Each piece was then centred in a 112 px native cell and scaled back up 4x nearest-neighbour, so the cutter's 4x nearest-neighbour downscale lands on those averages. Saved as PNG (896x448, IHDR, IDAT and IEND only) before the cut. Ruled grid band: no. `sheetCell` 448, `maxMagenta` 24 for the pink tint JPEG left on the ice crystals. Cuts to a 71x17 frame (tube inside 59x6, caps 8) and a 14x20 shield.

```text
Create one sheet of two pieces of a thin shield bar for a top-down 2D pixel-art game, drawn side by side in one row: a short framed bar on the left and its shield mark on the right. Draw only these two pieces, no text, no player, no monsters and no ground.

The canvas is 1024 by 512 pixels, a grid of 512 pixel square cells, two cells across and one cell down.

The first cell holds a short, complete, thin horizontal bar frame in the same style as the attached concept picture, 448 pixels long and centred in its cell, which leaves at least 32 pixels of plain magenta between it and every cell edge. It is a slim glass tube held in cold blue-grey steel. A straight steel rail runs along the top and another along the bottom, each 24 pixels thick with a crisp dark outline and a pale frosty blue edge on top, and the space between them, only 64 pixels tall, is the inside of the tube. At each end is a squared-off end cap 64 pixels long, made of riveted steel bands with a few small pale blue ice crystals on them; the crystals reach at most 16 pixels above and below the rails. Between the two end caps the rails are perfectly plain and exactly the same all along, with no rivets, bands, crystals or marks, so the middle can be stretched. The inside of the tube is hollow: it is the same plain magenta as the background, with nothing drawn in it, no liquid, no glass, no shine and no shadow, and the rails and caps close it in cleanly on every side.

The second cell holds the shield mark alone, centred in its cell: a small kite-shaped shield seen from the front, 160 pixels tall, pointed at the bottom, with a steel rim and a pale icy blue face, hex #B3E5FC shading down to #4F8FC0, a crisp dark outline and a few white highlight pixels at its upper left.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur and no anti-aliasing; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference picture.
Background: the file is one sheet of flat magenta #FF00FF with the two pieces sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between the pieces and inside the tube alike, fully opaque, with no transparency or alpha channel and no texture, noise, shadow, glow or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta beside a piece is the same magenta everywhere. No text anywhere either: a single character of text, a number, a label or a watermark ruins the sheet.
Each piece stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file.
```

## 3. `hud_bar_xp.png`: the XP bar

Save as `docs/art/sheets/CO-156/hud_bar_xp.png`. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1152x576 px from `openai/gpt-image-2` (asked 1024x512, 2x1 of 512 px), with concept C attached as the reference. No text or watermark. The frame came back 690 px long and ran over the middle cell line. Each piece was found by its columns of art, not by grid, and area-averaged onto native pixels on its own, averaging the art pixels alone and skipping any magenta-tinted pixel (the house rule, `b > 0.8r && g < 0.6r && r > 140`, plus the hot-pink fringe); a native pixel is art when at least half of it is. The frame's grid is anchored on the tube's inside corner so the trough edges land on whole pixels. Frame at 11 source px per native px, gem at 9. Each piece was then centred in a 112 px native cell and scaled back up 4x nearest-neighbour, so the cutter's 4x nearest-neighbour downscale lands on those averages. Saved as PNG (896x448, IHDR, IDAT and IEND only) before the cut. Ruled grid band: no. `sheetCell` 448, `maxMagenta` 24. Cuts to a 63x17 frame (tube inside 45x7, caps 11) and a 17x22 gem.

```text
Create one sheet of two pieces of an experience bar for a top-down 2D pixel-art game, drawn side by side in one row: a short framed bar on the left and its gem mark on the right. Draw only these two pieces, no text, no player, no monsters and no ground.

The canvas is 1024 by 512 pixels, a grid of 512 pixel square cells, two cells across and one cell down.

The first cell holds a short, complete, slim horizontal bar frame in the same style as the attached concept picture, 448 pixels long and centred in its cell, which leaves at least 32 pixels of plain magenta between it and every cell edge. It is a glass tube held in dark wood. A straight dark brown wooden rail runs along the top and another along the bottom, each 24 pixels thick with a crisp dark outline, and the space between them, 80 pixels tall, is the inside of the tube. At each end is a rounded end cap 64 pixels long, bound in dark leather and wrapped in a curling green vine with a few small leaves and one tiny green gem stud; the leaves reach at most 16 pixels above and below the rails. Between the two end caps the rails are perfectly plain and exactly the same all along, with no bindings, knots, leaves, studs or marks, so the middle can be stretched. The inside of the tube is hollow: it is the same plain magenta as the background, with nothing drawn in it, no liquid, no glass, no shine and no shadow, and the rails and caps close it in cleanly on every side.

The second cell holds the gem mark alone, centred in its cell: a faceted emerald-green gem cut like a diamond shape, 176 pixels tall, bright mint green hex #69F0AE shading down to deep green #1B7A4A, with a crisp dark outline and a few white glint pixels at its upper left.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur and no anti-aliasing; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference picture.
Background: the file is one sheet of flat magenta #FF00FF with the two pieces sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between the pieces and inside the tube alike, fully opaque, with no transparency or alpha channel and no texture, noise, shadow, glow or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta beside a piece is the same magenta everywhere. No text anywhere either: a single character of text, a number, a label or a watermark ruins the sheet.
Each piece stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file.
```

## 4. `hud_bar_boss.png`: the boss bar

Save as `docs/art/sheets/CO-156/hud_bar_boss.png`. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1152x576 px from `openai/gpt-image-2` (asked 1024x512, 2x1 of 512 px), with concept C attached as the reference. No text or watermark. The frame came back 668 px long and ran over the middle cell line. Each piece was found by its columns of art, not by grid, and area-averaged onto native pixels on its own, averaging the art pixels alone and skipping any magenta-tinted pixel (the house rule, `b > 0.8r && g < 0.6r && r > 140`, plus the hot-pink fringe); a native pixel is art when at least half of it is. The frame's grid is anchored on the tube's inside corner so the trough edges land on whole pixels. Frame at 8 source px per native px, skull at 7. Each piece was then centred in a 112 px native cell and scaled back up 4x nearest-neighbour, so the cutter's 4x nearest-neighbour downscale lands on those averages. Saved as PNG (896x448, IHDR, IDAT and IEND only) before the cut. Ruled grid band: no. `sheetCell` 448; no `maxMagenta`, because the horns and eyes are purple on purpose. Cuts to an 84x28 frame (tube inside 64x12, caps 11) and a 31x25 skull.

```text
Create one sheet of two pieces of a boss health bar for a top-down 2D pixel-art game, drawn side by side in one row: a short framed bar on the left and its skull mark on the right. Draw only these two pieces, no text, no player, no monsters and no ground.

The canvas is 1024 by 512 pixels, a grid of 512 pixel square cells, two cells across and one cell down.

The first cell holds a short, complete horizontal bar frame in the same style as the attached concept picture, 448 pixels long and centred in its cell, which leaves at least 32 pixels of plain magenta between it and every cell edge. It is a glass tube held in blackened iron and old bone. A straight blackened iron rail runs along the top and another along the bottom, each 32 pixels thick with a crisp dark outline, and the space between them, 112 pixels tall, is the inside of the tube. At each end is a heavy end cap 80 pixels long, made of pale bone plates bolted to the iron, with two short curved bone horns tipped in dark purple, hex #6A1B9A, pointing outward; the horns reach at most 32 pixels above and below the rails. Between the two end caps the rails are perfectly plain and exactly the same all along, with no bolts, plates, horns or marks, so the middle can be stretched. The inside of the tube is hollow: it is the same plain magenta as the background, with nothing drawn in it, no liquid, no glass, no shine and no shadow, and the rails and caps close it in cleanly on every side.

The second cell holds the skull mark alone, centred in its cell: a horned skull seen from the front, 224 pixels across, old bone white hex #E8E0CC shading down to grey-brown #8A7F6A, with two short curved horns, deep purple glowing eye sockets hex #9C27B0, a crisp dark outline and a few pale highlight pixels at its upper left.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur and no anti-aliasing; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference picture.
Background: the file is one sheet of flat magenta #FF00FF with the two pieces sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between the pieces and inside the tube alike, fully opaque, with no transparency or alpha channel and no texture, noise, shadow, glow or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta beside a piece is the same magenta everywhere. No text anywhere either: a single character of text, a number, a label or a watermark ruins the sheet.
Each piece stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file.
```
