# CO-138 Art: Earth Spike in flight

Ticket: [#205](https://github.com/danhquach/crimsononslaught/issues/205)

Earth Spike is a slow stone spike flung from the hero at the nearest enemy. It needs its own flight clip, `earth.fly`, so it never reads as Boulder's round rolling stone. The look is concept C: a dark brown rock point with glowing amber-green mineral veins and a few tumbling rock chips at its tail, at about 42% of the concept's size against the hero (70%, then 60% of that; the shard is about 27 px long in game). The hit is the existing `earth.impact` burst.

One sheet. Copy the whole `text` block below and paste it as the prompt. Nothing else to add.

If the tool has a negative-prompt field, paste this into it:

```text
text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, drop shadow, blur, gradient, jpeg artifacts
```

## 1. `earth_spike_fly.png`: the spike in flight

Save as `docs/art/sheets/CO-138/earth_spike_fly.png`. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1408x480 px from `openai/gpt-image-2` (asked 1024x256, 4x1 of 256 px), with the chosen concept picture attached as the reference. Fringe (`b > g + 15`, and the house magenta rule) snapped to #FF00FF. Each drawing was then moved, pixels unchanged, onto a 480 px square cell (1920x480) with the shard's own centre on the cell centre, so the frame's anchor — the hitbox centre and the pivot it turns on — sits in the middle of the stone rather than on the chip trail; saved as PNG before the cut. Ruled grid band: no. `sheetCell` 304 sizes the shard to about 27 px, three quarters of the hero's height; cuts to a 47x15 native frame.

```text
Create one pixel-art animation sheet for a top-down 2D game: a single stone spike flying through the air, the projectile an earth mage flings. Draw only the spike, no caster, no target and no ground.

The canvas is 1024 by 256 pixels, a grid of 256 pixel square cells, four cells across and one cell down. They read left to right. Each drawing is about 180 pixels long and about 64 pixels tall, centred in its cell, which leaves at least 38 pixels of plain magenta between the drawing and every cell edge.

The spike flies to the right in every drawing. At the right end is its point: a sharp, jagged tip of dark brown rock. The body is a chunky, faceted stone shard, widest a little behind the middle, dark brown with lighter brown top faces, split by thin glowing amber-green mineral veins that run along its length, hex #C6D84A at their brightest. Behind the blunt left end, three or four small rock chips tumble loose in a short trail that thins out to the left. The shard is the largest part; the chips are small and stay close behind it. It is one self-contained object with a clear point and a clear back, never a smooth rod and never a strip that could be laid end to end.

The spike is drawn in this one facing and no other. It is never turned, tilted, mirrored or angled: the game itself turns the sprite along its flight, so a drawing that is already angled would be turned twice. Every cell holds the same shard at the same size, with its point at exactly the same point in its cell.

The four drawings are one loop: the shard itself stays in place, its veins pulse slightly brighter and dimmer, and the chips behind it tumble into a different position in each drawing, so the spike reads as moving while it flies.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Keep the effect's centre and its size the same in every cell unless told otherwise, and give every cell visible art: a fading last frame never goes empty.
Deliver one PNG (preferred; a JPEG on flat magenta is accepted), at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```
