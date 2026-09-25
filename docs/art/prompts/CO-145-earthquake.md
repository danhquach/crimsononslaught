# CO-145 Art: Earthquake

Ticket: [#220](https://github.com/danhquach/crimsononslaught/issues/220)

Earthquake drew only the shared placeholder ring, so the ground never looked broken. Its CO-123 sheet (`earth.quake`, a cracked disc inside a rock ring) was never wired, and it was a ring again. At review (2026-09-25) three concepts were shown: heaved slabs, a star of fissures with amber in the cracks, and churned rubble with dust. The fissures were chosen, and the patch is drawn without the ring. The old `earth.quake` clip stays in the atlas, unused by the spell.

One sheet. Copy the whole `text` block below and paste it as the prompt. Nothing else to add.

If the tool has a negative-prompt field, paste this into it:

```text
text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, ring, rim, circle outline, border, floor tiles, blur, gradient, jpeg artifacts, pink, purple, glow, haze
```

## 1. `earth_quake_rift.png`: the ground splitting open

Save as `docs/art/sheets/CO-145/earth_quake_rift.png`. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1536x1536 px from `openai/gpt-image-2` (`quality: medium`, the chosen concept picture as the style reference), on the first try. Magenta-tinted fringe snapped to #FF00FF with the house rule plus `b > g + 40 && r > g + 40`, then blue pulled down to 0.88 x green on every opaque pixel whose blue was above its green (the JPEG had tinted some stones pink). Saved as PNG; ruled grid band: no. Cut at `sheetCell` 768 to a 166x150 native frame with a 157x145 art box, so the crack tips land on the radius when the game scales the box to the patch.

```text
Create one pixel-art animation sheet for a top-down 2D game: the ground splitting open in an earthquake, seen from above, drawn in the style of the attached picture's cracks. Draw only the cracks and the broken stone, no creatures and no floor.

The canvas is 1536 by 1536 pixels, a grid of 768 pixel square cells, two cells across and two cells down. They read left to right along the top row, then left to right along the bottom row. Every drawing fits inside a circle 560 pixels across centred in its cell, which leaves at least 104 pixels of plain magenta between the drawing and every cell edge.

Each drawing is a star of seven jagged fissures radiating out from the centre of the cell. Each fissure is wide and deep near the centre, about 40 pixels across, and narrows along its length to a thin hairline tip about 270 pixels from the centre. Inside the fissures is near-black dark brown, hex #2B1D14, and at the bottom of the widest parts sit solid patches of amber molten rock, hex #FFA000 and #FF6F00. Along both lips of every fissure the broken stone is pushed up into small tilted chunks of grey-brown rock, hex #6D5D52 with a lighter top-left edge, hex #9E8B7E, and a few loose pebbles and small grey-brown dust puffs sit beside the cracks. There is no ring, no rim, no circle and no outline around the drawing: the fissures simply end in thin tips, and everything between the fissures stays plain magenta so the game's own floor shows through.

The four drawings are one rumble that loops. The fissures keep the same layout and the same centre in all four; they widen and narrow by a few pixels, the amber patches grow and shrink, the stone chunks on the lips hop a pixel or two, and the dust puffs rise in a different place in each drawing.

Keep every colour earthy: near-black brown, grey-brown stone and amber. No pink, rose, red, purple or violet anywhere, and no soft glow, halo or haze: every edge is a hard pixel edge against the magenta.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference picture.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Keep the effect's centre and its size the same in every cell, and give every cell visible art.
Deliver one PNG (preferred; a JPEG on flat magenta is accepted), at the canvas size given above, and report the exact pixel size.
```
