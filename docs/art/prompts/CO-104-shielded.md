# CO-104 Art: Shielded enemy

Ticket: [#126](https://github.com/danhquach/crimsononslaught/issues/126)

The shielded enemy walks at the player behind a shield that takes most of any hit on its front, and turns too slowly to stop the player getting behind it. So the sheet has to show which way the shield faces, from every side. At review (2026-09-27) three concepts were generated over the arena, each showing the enemy from the front, the side and behind: a skeleton with a bronze tower shield, a crab with a teal shell plate, and a hobgoblin with a round wooden shield. A was chosen. Its bronze front against its white-bone back is the clearest front-or-back read at game size. The teal shell sat too close to the ice-slow tint, and the hobgoblin's back and front were too close in tone at about 30 px. The concept picture was attached to the prompt below as the reference.

One sheet. Copy the whole `text` block and paste it as the prompt, with the concept picture attached. Nothing else to add.

If the tool has a negative-prompt field, paste this into it:

```text
text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, floor tiles, drop shadow, blur, gradient, jpeg artifacts
```

## 1. `enemy_shielded.png`: the skeleton shield-bearer — walk and hurt facing down, up and right; death; spawn

Save as `docs/art/sheets/CO-104/enemy_shielded.png`. In game the engine mirrors the right-facing rows to face left.

Delivered as: JPEG 1536x1024 px from `openai/gpt-image-2` (medium quality), all 20 frames drawn in one pass. The drawings drifted off the grid, up to about 50 px from their cell centres and past the first row's bottom edge. Rescued by moving pixels, not redrawing. Each drawing was found as connected parts (a pixel more than 90 from #FF00FF, specks under 6 px dropped). Every drawing came out as one part. Each was pasted onto a flat #FF00FF canvas of 288 px cells (1728x1152), with its mass centre on its cell's centre line and every row's lowest pixel at y 264, so the feet share one line. Magenta-tinted fringe was snapped to the key. Saved as PNG with no C2PA chunk. Cut at `sheetCell` 192 (the skeleton about 26x42 facing down), `maxMagenta` 20, on its own atlas page (`props15`) so no other page re-quantises.

```text
Create one pixel-art animation sheet for a shielded enemy in a top-down 2D game. The creature is the skeleton shield-bearer from the attached reference picture: a hunched undead skeleton soldier with pale bone-white bones (#E8DFC8, #A89F86 shading) and a thick dark outline, wearing a dented bronze helmet, carrying a huge rectangular tower shield of polished bronze (#C8923A with #FFD27A highlights, #7A5520 shading, a round bronze boss in its middle and a thick dark outline) always held on the side it faces. Copy only the skeleton and its shield from the reference, never its floor or the hero.

The canvas is 1536 by 1024 pixels, a grid of 256 pixel square cells, 6 across and 4 down. In every cell the skeleton with its shield is about 150 pixels tall, centred left to right, with its feet on the same line near the bottom of the cell in every frame.
Row 1 faces the viewer (walking down the screen). The first four cells are a four-frame walking loop: the shield faces the viewer and covers almost the whole body, the skull and helmet peek over its top, the bony feet step under its bottom edge. The fifth cell is the flinch facing the viewer: the same pose drawn a shade paler, the shield jolted. The sixth cell stays blank magenta.
Row 2 faces away (walking up the screen). The first four cells are a four-frame walking loop seen from behind: the bare bony back, spine and ribs fill the middle, the helmet on top, and only the shield's edges peek out either side. The fifth cell is the flinch seen from behind, a shade paler. The sixth cell stays blank magenta.
Row 3 faces right. The first four cells are a four-frame walking loop seen from the side: the skeleton leans forward behind the shield, which is a thick bronze slab on its right side, the legs stride. The fifth cell is the flinch facing right, a shade paler. The sixth cell stays blank magenta.
Row 4 has two actions. The first three cells are a death: the skeleton staggers and the shield tips over, the bones collapse into a heap, a small pile of bones beside the fallen shield. The last three cells are a spawn: a few bones and the shield lying on the ground, the skeleton half assembled and rising, the skeleton standing with its shield raised, facing the viewer.

No pink, rose, purple or violet anywhere; its colours are bone white, bronze, brown and dark grey only.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference picture.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise, vignette, drop shadow or ground shadow.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell with at least 30 pixels of plain magenta to every cell edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Give every cell that is not described as blank visible art.
Deliver one PNG (preferred; a JPEG on flat magenta is accepted), at the canvas size given above.
```
