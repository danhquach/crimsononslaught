# CO-167 Art: Meteor magma pond

Ticket: [#258](https://github.com/danhquach/crimsononslaught/issues/258)

Meteor never drew its falling body and left nothing on the ground, only a ring and then an explosion. The rework (`docs/superpowers/specs/2026-09-26-meteor-rework-design.md`) flies the existing `fire.meteor` art onto the point and leaves a small pool of molten magma that burns the crowd. At review (2026-09-26) a mockup built from the game's own sprites was approved with concept A, a simmering magma splash, and a smaller molten centre. The pond has no ring: the old `fire.meteorMark` ring was rejected for it and stays in the atlas, unused.

One sheet. Copy the whole `text` block below and paste it as the prompt. Nothing else to add.

If the tool has a negative-prompt field, paste this into it:

```text
text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, ring, rim, circle outline, border, floor tiles, blur, gradient, jpeg artifacts, pink, purple, glow, haze
```

## 1. `fire_meteor_pond.png`: the magma pond a meteor leaves

Save as `docs/art/sheets/CO-167/fire_meteor_pond.png`. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1536x1536 px from `openai/gpt-image-2`, the candidate approved at design review and reused, not regenerated; the prompt below was written afterwards to the house format, to regenerate the sheet from. Magenta-tinted fringe snapped to #FF00FF with the house rule plus `b > g + 20`, keyed only where it joins the background (a flood fill from the canvas edge), so tinted pixels inside the rocks were not punched out as holes; then blue pulled down to green on every remaining pixel whose blue was above its green (the JPEG had tinted the rocks purple). Each cell's pixels were then shifted so the drawing's mass centre sits on the cell centre: (-34, -20), (+5, -21), (-31, +25) and (+9, +24) px. Saved as PNG with no C2PA chunk; ruled grid band: no. Cut at `sheetCell` 768 to a 146x128 native frame with a 140x123 art box, on its own atlas page (`props12`) so no other page re-quantises; the game scales the box so it spans the pond.

```text
Create one pixel-art animation sheet for a top-down 2D game: a small pool of molten magma splashed onto the ground where a meteor struck, seen from above. Draw only the magma and the scorched rock in it, no creatures and no floor.

The canvas is 1536 by 1536 pixels, a grid of 768 pixel square cells, two cells across and two cells down. They read left to right along the top row, then left to right along the bottom row. Every drawing fits inside a circle 560 pixels across centred in its cell, which leaves at least 104 pixels of plain magenta between the drawing and every cell edge.

Each drawing is a splash of molten magma about 480 pixels across, centred in the cell. A small molten centre about 90 pixels across glows pale yellow, hex #FFF59D and #FFD54F, and fades out through orange, hex #FF9800 and #F57C00, to a deep red body, hex #D84315 and #B71C1C. Jagged splash arms of magma radiate out from the body in every direction, each one narrowing to a point, and small droplets of orange magma are flung beyond the arms. A dozen small dark cooled rocks, hex #3E2723 with a lighter top-left edge, hex #5D4037, sit in the magma. There is no ring, no rim, no circle and no outline around the drawing: the splash arms and droplets simply end, and everything between them stays plain magenta so the game's own floor shows through.

The four drawings are one simmer that loops. The splash keeps the same shape, the same size and the same centre in all four; the molten centre brightens and dims a little, the colours ripple by a few pixels through the body, and the droplets beyond the arms sit in slightly different places in each drawing.

Keep every colour hot: pale yellow, orange, deep red and dark brown rock. No pink, rose, purple or violet anywhere, and no soft glow, halo or haze: every edge is a hard pixel edge against the magenta.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference picture.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Keep the effect's centre and its size the same in every cell, and give every cell visible art.
Deliver one PNG (preferred; a JPEG on flat magenta is accepted), at the canvas size given above, and report the exact pixel size.
```
