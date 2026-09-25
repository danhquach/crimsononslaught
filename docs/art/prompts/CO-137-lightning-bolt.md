# CO-137 Art: Lightning Bolt in flight

Ticket: [#202](https://github.com/danhquach/crimsononslaught/issues/202)

Superseded by CO-153 ([#238](https://github.com/danhquach/crimsononslaught/issues/238)): the bolt is now a ball of lightning, and this sheet was removed.

Lightning Bolt flies from the hero to its target as a short projectile. It needs its own flight clip so it never reads as Chain Lightning's tiled `lightning.chain` strip. The strike and impact bursts on the target are reused as they are (`lightning.strike`, `lightning.impact`).

One sheet. Copy the whole `text` block below and paste it as the prompt. Nothing else to add.

If the tool has a negative-prompt field, paste this into it:

```text
text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, drop shadow, blur, gradient, jpeg artifacts
```

## 1. `lightning_bolt.png`: the bolt in flight

Save as `docs/art/sheets/CO-137/lightning_bolt.png`. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1408x480 px from `openai/gpt-image-2` (asked 1024x256, 4x1 of 256 px), magenta-tinted fringe snapped to #FF00FF and saved as PNG before the cut; ruled grid band: no. Cuts to a 41x13 native frame.

```text
Create one pixel-art animation sheet for a top-down 2D game: a single short lightning bolt flying through the air, the projectile a lightning mage throws. Draw only the bolt, no caster, no target and no ground.

The canvas is 1024 by 256 pixels, a grid of 256 pixel square cells, four cells across and one cell down. They read left to right. Each drawing is about 130 pixels long and about 60 pixels tall, centred in its cell, which leaves at least 60 pixels of plain magenta between the drawing and every cell edge.

The bolt flies to the right in every drawing. At the right end is its head: a bright, compact, rounded spark of white-hot energy about 40 pixels across, with a white core and pale yellow edges, hex #FFEE58. Behind the head, trailing off to the left, is a short jagged tail of forked yellow lightning that thins and splits into two or three crooked prongs and ends in loose sparks. The head is the largest and brightest part; the tail is shorter than the whole drawing and narrows to nothing. It is one self-contained object with a clear front and back, a comet of lightning, never a straight even band and never a strip that could be laid end to end.

The bolt is drawn in this one facing and no other. It is never turned, tilted, mirrored or angled: the game itself turns the sprite along its flight, so a drawing that is already angled would be turned twice. Every cell holds the same bolt at the same size, with its head at exactly the same point in its cell.

The four drawings are one flicker loop: the head stays in place and pulses slightly, and the forks of the tail crackle into a different crooked shape in each drawing, so the bolt reads as live current while it flies.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Keep the effect's centre and its size the same in every cell unless told otherwise, and give every cell visible art: a fading last frame never goes empty.
Deliver one PNG (preferred; a JPEG on flat magenta is accepted), at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```
