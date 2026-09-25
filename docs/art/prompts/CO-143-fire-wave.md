# CO-143 Art: Fire Wave's flame front

Ticket: [#218](https://github.com/danhquach/crimsononslaught/issues/218)

Fire Column became Fire Wave: a 95° slice of flame that spreads out from the hero and burns every enemy its rim sweeps over. The rim needs its own art, a curved flame front the game turns toward the wave's heading and scales as it grows. The glow inside the slice stays a low-alpha Graphics fill (a painted glow would fade into the magenta key), the cast flash stays `fire.spawn` and each hit stays `fire.explode`. The Fire Column sheets are kept as a future background prop.

One sheet. Copy the whole `text` block below and paste it as the prompt. Nothing else to add.

If the tool has a negative-prompt field, paste this into it:

```text
text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, drop shadow, blur, gradient, jpeg artifacts, pink, purple, glow, haze
```

## 1. `fire_wave_front.png`: the flame front

Save as `docs/art/sheets/CO-143/fire_wave_front.png`. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1536x512 px from `openai/gpt-image-2` (asked 2048x512, 4x1 of 512 px; `quality: medium`, `fire_column_body.png` as the style reference), on the fifth try. Magenta-tinted fringe snapped to #FF00FF with the house rule plus `b > g + 20` (the JPEG left a hot-pink rim no fire colour has), then each cell's pixels shifted sideways (-42, -8, +12, +38 px) so the arc's circle centre sits at the same point in every cell: the model drew the four arcs about 26 px closer together than the cells. Saved as PNG; ruled grid band: no. Cut at `sheetCell` 768 to a 75x148 native frame; the arc's circle centre sits at (-24.5, 73.5) in the frame and its leading edge 88 px from it (`FIRE_WAVE_ART`, re-measured by `scripts/lib/fireWaveArt.test.mjs`).

The drawn arc is wider than the 95° the wave hits: 80% of the flame lies within ±43° of the heading, and the thin tapered tips run to about ±57°. Tries 1-3 (the brief's prompt, then a "shallow curve" rewording) drew 140-160° crescents, and try 4 ("nearly straight wall") drew about 70°; this prompt is the closest of the five.

```text
Create one pixel-art animation sheet for a top-down 2D game: the leading edge of a wave of fire that a fire mage sends outward in an arc. Draw only the fire, no caster, no creatures and no ground.

The canvas is 2048 by 512 pixels, a grid of 512 pixel square cells, four cells across and one cell down. They read left to right. Each drawing is about 380 pixels tall and about 160 pixels wide, and its middle sits exactly on the centre of its cell, which leaves at least 60 pixels of plain magenta between the drawing and every cell edge. The four drawings are evenly spaced, exactly one cell width apart.

The drawing is a curved band of flame standing upright and bent like a drawn bow, its middle bulging to the right: a quarter of a large ring, the shape of a closing parenthesis. The curve is clearly bent, not a straight wall, but it is not a crescent or a half moon either: its top end and its bottom end sit about 90 pixels further left than its middle, and they point up-left and down-left without curling back toward each other. The band is about 50 pixels thick along most of its length and tapers to thin points at both ends. Its right, outer edge is the hottest: a bright yellow-orange front, hex #FFB300, with ragged flame tongues about 30 pixels long licking outward to the right. Behind that the band darkens through deep orange, hex #FF6D00, to dark crimson at its inner, left edge, with a few small embers and wisps of soot trailing just behind it. Nothing fills the space inside the curve: to the left of the band is plain magenta.

The arc is drawn in this one facing and no other, bulging to the right. It is never turned, tilted or mirrored: the game itself turns the sprite toward its target, so an arc that is already angled would be turned twice. Every cell holds the same arc at the same size and in the same place within its cell.

The four drawings are one burning loop: the curve and its thickness stay fixed, while the flame tongues along the outer edge rise and curl into a different shape in each drawing and the embers behind drift to different spots.

Keep every colour warm: white-hot yellow, orange and crimson. No pink, purple or violet anywhere, and no soft glow or haze around the fire: the flame ends in a hard pixel edge against the magenta.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Keep the effect's centre and its size the same in every cell unless told otherwise, and give every cell visible art: a fading last frame never goes empty.
Deliver one PNG (preferred; a JPEG on flat magenta is accepted), at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```
