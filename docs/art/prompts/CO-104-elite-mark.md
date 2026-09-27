# CO-104 Art: Elite mark

Ticket: [#126](https://github.com/danhquach/crimsononslaught/issues/126)

An elite is a champion of a regular enemy type: tougher, harder-hitting, and it drops a chest. The player has to spot one at a glance in a crowd of its own kind, at the enemy cap, on the dark arena. It cannot be marked by tint, because hit flashes and status tints repaint the enemy every hit. It cannot be scaled either, because that resizes its body. So a mark is drawn under its feet. At review (2026-09-27) three concepts were generated over the arena: A a gold rune circle on the floor, B a floating crown and star, C a violet flame aura. A was chosen. It is the brightest thing on the dark floor, and it lies under the enemy, so it never hides the sprite or the status overlays drawn over it. B was small at about 25 px and clashed with the stun sparks above the head. C covered the sprite and sat too close to the pink and violet enemy art. The concept picture was attached to the prompt below as the reference.

One sheet. Copy the whole `text` block and paste it as the prompt, with the concept picture attached. Nothing else to add.

If the tool has a negative-prompt field, paste this into it:

```text
text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, floor tiles, cobblestones, monster, skeleton, character, drop shadow, blur, gradient, jpeg artifacts
```

## 1. `elite_mark.png`: the rune circle, a four-frame loop

Save as `docs/art/sheets/CO-104/elite_mark.png`. In game it loops under the elite's feet, drawn 2.4 times the elite's body width.

Delivered as: JPEG 1408x480 px from `openai/gpt-image-2` (medium quality), four rings of 272x165 px on cells that were not square, with faint key-coloured noise under the first two. The runes barely move between frames, so the loop shimmers rather than turns. Rescued by moving pixels, not redrawing. Each ring was cropped at its own box, pixels within 60 of #FF00FF were set to the key, and magenta-tinted fringe was snapped to it. Each was pasted centred on a flat #FF00FF canvas of 352 px cells (1408x352). Saved as PNG with no C2PA chunk. Cut at `sheetCell` 352, `centred`, on its own atlas page (`props16`) so no other page re-quantises.

```text
Create one pixel-art animation sheet of a magic rune circle for a top-down 2D game. It is the glowing floor sigil from the attached reference picture, under the champion skeleton: a ring of gold and crimson runes lying flat on the ground. Copy only the circle, never the skeleton standing on it, the floor or anything else in the picture.

The canvas is 1024 by 256 pixels, a grid of 256 pixel square cells, 4 across and 1 down. In every cell the circle is seen from a three-quarter top-down camera, so it is an ellipse lying on the ground about 190 pixels wide and 110 pixels tall, centred in the cell. It has a bright outer ring of solid gold (#FFD24A with #FFF2A8 highlights and #C8841A shading), a thinner inner ring, and between them a band of small blocky rune marks in hot orange-gold (#FFB030) on a thin deep crimson band (#A0141E). The middle of the circle is empty: plain magenta shows through it, where the champion will stand.
The four cells are a looping animation of the circle slowly turning: the runes between the rings move a quarter of a step round the circle from one cell to the next, so the fourth cell leads back into the first. The rings stay exactly the same size and in the same place in every cell. In the first and third cells the gold is a touch brighter, so the circle gently pulses as it turns.

Its colours are gold, orange-gold and deep crimson only; no pink, rose, purple, violet, blue or green anywhere.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference picture.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike and inside the circle too, fully opaque, with no transparency or alpha channel and no texture, noise, vignette, glow, drop shadow or ground shadow.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell with at least 30 pixels of plain magenta to every cell edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Give every cell visible art.
Deliver one PNG (preferred; a JPEG on flat magenta is accepted), at the canvas size given above.
```
