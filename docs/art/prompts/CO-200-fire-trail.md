# CO-200 Art: Fire Wave burnt ground

Ticket: [#327](https://github.com/danhquach/crimsononslaught/issues/327)

Fire Wave level 3 leaves a burnt patch behind its rim that follows the swept fan and burns enemies who walk into it. At the concept review the PM asked for charred soot with glowing ember specks and only a few tiny flames, calm and not a second wave. The patch is drawn as many small scorch pieces scattered over the fan, so the sheet is four static soot smudges, each a different ragged shape; the game picks one per piece, turns and flips it, and lays a few tiny `fire.burn` flames on top.

One sheet. Copy the whole `text` block below and paste it as the prompt. Nothing else to add.

If the tool has a negative-prompt field, paste this into it:

```text
text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, ring, rim, circle outline, border, floor tiles, blur, gradient, jpeg artifacts, glow, haze, pink, purple, green
```

## 1. `fire_trail_scorch.png`: four burnt-ground smudges

Save as `docs/art/sheets/CO-200/fire_trail_scorch.png`. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1536x1536 px from `openai/gpt-image-2` (quality medium). Magenta-tinted fringe snapped to #FF00FF with the house rule plus `b > g + 20`, the second rule restricted to `r + b > 200` (true magenta blends only: the bare rule ate about 14k pixels of real dark purple-brown soot flecks per cell, the restricted one about 5.7k), keyed only where it joins the background (a flood fill from the canvas edge) so tinted pixels inside the soot were not punched out; then blue pulled down to green on every remaining pixel whose blue was above its green (the JPEG had tinted the soot purple). Each cell's pixels were then shifted so the drawing's mass centre sits on the cell centre: (+3, -33), (+28, -28), (+21, -7) and (+35, -2) px. All four cells were kept (green-dominant share about 0.2% in every cell, under the 1% bar). Saved as PNG with no C2PA chunk; ruled grid band: no. Cut at `sheetCell` 288 to a 70x66 native frame with a 63x57 art box, on its own atlas page (`props20`) so no other page re-quantises; the game draws a piece at about scale 1.

```text
Create one pixel-art sheet for a top-down 2D game: four different patches of scorched, burnt ground left behind by a sweeping wave of fire, seen from above. Draw only the burnt patch itself, no creatures, no flames taller than a few pixels and no floor.

The canvas is 1536 by 1536 pixels, a grid of 768 pixel square cells, two cells across and two cells down. Every drawing fits inside a circle 580 pixels across centred in its cell, which leaves at least 94 pixels of plain magenta between the drawing and every cell edge.

Each drawing is one irregular soot smudge about 500 pixels across with ragged, broken edges, a different shape in each cell: blotchy, lumpy, never a circle, oval or square. The smudge is charred black and very dark brown ash, hex #120D0B, #1E1512 and #2B1E19, with a few darker cracks. Scattered across it are many small glowing ember specks, each only a few pixels, in orange and deep red, hex #FF8F00, #F4511E and #C62828, a few of them pale yellow, hex #FFD54F. The embers are denser toward the middle of the smudge and thin out toward its ragged edge. Near the edge the soot breaks up into small separate dark flecks, so the patch fades out instead of ending in a line. There is no ring, no rim, no outline and no border around the drawing.

Keep every colour hot or dark: black, dark brown, orange, deep red, a little pale yellow. No pink, rose, purple or violet anywhere, and no soft glow, halo or haze: every edge is a hard pixel edge against the magenta.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins, no tile, panel, square of colour, line, border, divider or frame. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill. Give every cell visible art.
```
