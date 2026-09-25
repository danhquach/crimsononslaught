# CO-144 Art: Ice Storm

Ticket: [#219](https://github.com/danhquach/crimsononslaught/issues/219)

Blizzard became Ice Storm: a patch that slows and grinds down whatever stands in it, drawn as freezing sleet that falls like heavy rain, slanted a little by the wind, with ice bursting on the stones where it lands. It has no drawn border: the sleet thins out toward the edge that ticks. A first look (frosted ground, a snow vortex and a rim of blown snow) read as a frozen pond at review (2026-09-25) and was dropped with its three sheets. The old `ice.blizzard` clip stays in the atlas, unused by the spell.

Two sheets. Copy each whole `text` block below and paste it as the prompt. Nothing else to add.

If the tool has a negative-prompt field, paste this into it:

```text
text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, drop shadow, blur, gradient, jpeg artifacts, pink, purple, glow, haze
```

## 1. `ice_storm_sleet.png`: four pieces of sleet

Save as `docs/art/sheets/CO-144/ice_storm_sleet.png`. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1536x512 px from `openai/gpt-image-2` (`quality: medium`, `CO-123/ice_blizzard_area.jpg` as the style reference; asked 2048x512, 4x1 of 512 px; delivered cells are 384x512), the second of two tries: both drew the long needle across the first cell's right edge. Cleaned as the shard sheet below was, then each piece moved whole to the centre of its own cell ((-27, -3), (-65, -3), (-29, -4), (+19, -3) px). Saved as PNG; ruled grid band: no. Cut at `sheetCell` 280 to a 54x12 native frame; the long needle is 49 px, and every piece lies along the anchor row, flying right (`scripts/lib/iceStormArt.test.mjs`).

```text
Create one pixel-art sprite sheet for a top-down 2D game: four separate particles of freezing sleet, the pieces of an ice storm that falls like heavy rain. Draw only the four particles, no ground, no creatures and no background scene.

The canvas is 2048 by 512 pixels, a grid of 512 pixel square cells, four cells across and one cell down. Each cell holds one particle, centred in its cell, and every particle fits inside a 320 by 80 pixel box centred in its cell, which leaves wide plain magenta all round it.

Every particle is flying toward the right and is drawn lying flat along one horizontal line: its sharp head at the right end and a thin streak trailing behind it to the left that thins to nothing. None of them is tilted, turned or angled; the game itself turns each particle along its fall.

First cell: a long, thin needle of clear blue ice, hex #81D4FA, about 280 pixels long and 14 pixels thick at its widest, with a white core line, a steel-blue edge, hex #4F83CC, and a sharp point at the right; it tapers into a faint pale streak at the left.
Second cell: a shorter needle of the same ice, about 170 pixels long and 12 pixels thick, the same colours and taper.
Third cell: a small round pellet of white and pale blue ice, hex #F5FBFF and #B3E5FC, about 28 pixels across, with a short thin pale blue streak about 90 pixels long behind it.
Fourth cell: a small six-armed white snowflake, hex #F5FBFF, about 44 pixels across, with a short faint pale blue streak about 70 pixels long behind it.

These are four different particles, not an animation: they are used at random side by side.

Keep every colour cold: white, pale blue, clear ice blue and steel blue. No pink, purple or violet anywhere, and no soft glow, haze or mist: every edge is a hard pixel edge against the magenta.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Give every cell visible art.
Deliver one PNG (preferred; a JPEG on flat magenta is accepted), at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```

## 2. `ice_storm_shard.png`: one shard falling and shattering

Save as `docs/art/sheets/CO-144/ice_storm_shard.png`. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1536x512 px from `openai/gpt-image-2` (`quality: medium`, `CO-123/ice_blizzard_area.jpg` as the style reference) (asked 2048x512, 4x1 of 512 px; delivered cells are 384x512), on the first try. Magenta-tinted fringe snapped to #FF00FF with the house rule, partly keyed pixels still pink after the despill cleared to the key, and red pulled down to green on opaque pixels the JPEG had tinted pink; then every cell's pixels shifted so the burst in drawing three sits on the cell centre: (+27, +1) px for drawings one to three, and (+18, -5) px for drawing four, whose scatter it centres the same way. Saved as PNG; ruled grid band: no. Cut at `sheetCell` 320 to a 48x62 native frame; the burst spreads about 20 px from the anchor, and the game draws it at 0.6 as the splash where the sleet lands.

```text
Create one pixel-art animation sheet for a top-down 2D game: a single jagged ice shard falling out of a storm and shattering on the ground. Draw only the ice, no ground and no creatures.

The canvas is 2048 by 512 pixels, a grid of 512 pixel square cells, four cells across and one cell down. They read left to right. Every drawing fits inside a 300 pixel square centred in its cell, which leaves at least 106 pixels of plain magenta between the drawing and every cell edge.

The shard is a long, sharp splinter of clear blue ice, hex #81D4FA, with a white highlight along its top-left edge and a steel-blue shadow edge, hex #4F83CC.

The four drawings play once, in this order. First, the shard high in the upper left of the square, pointing down and to the right, about 160 pixels long, with two short white speed streaks behind it. Second, the shard lower and nearer the centre of the square, the same size and angle, its tip about to touch the centre point. Third, the shard has struck the centre point and burst: eight to ten small angular ice splinters thrown outward in a ring about 180 pixels across, with a small white puff of snow in the middle. Fourth, the splinters are smaller, further out and scattered in a ring about 260 pixels across, with only a few left; the fourth drawing is faint but still clearly visible and never fades to nothing. The impact point is the centre of the cell in drawings three and four.

Keep every colour cold: white, pale blue and steel blue. No pink, purple or violet anywhere, and no soft glow or haze: every edge is a hard pixel edge against the magenta.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Keep the effect's centre and its size the same in every cell unless told otherwise, and give every cell visible art: a fading last frame never goes empty.
Deliver one PNG (preferred; a JPEG on flat magenta is accepted), at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```
