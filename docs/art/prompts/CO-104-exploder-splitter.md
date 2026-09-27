# CO-104 Art: Exploder, Splitter and Splitling

Ticket: [#126](https://github.com/danhquach/crimsononslaught/issues/126)

The exploder charges the player and blows up; the splitter bursts into three splitlings when it dies. At review (2026-09-27) three concepts were generated over the arena, each pairing an exploder with a splitter: a magma beetle with a rock golem, a bomb goblin with an indigo slime, and a flaming skull with a bone golem. B was chosen for both. The flaming skull was turned down because a burning orange ball reads as the player's own Fire Bolt or Meteor. The indigo slime splits into smaller copies of itself, the clearest "it split" read at game size. The concept picture was attached to every prompt below as the reference.

Three sheets. Copy each whole `text` block and paste it as the prompt, with the concept picture attached. Nothing else to add.

If the tool has a negative-prompt field, paste this into it for all three:

```text
text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, floor tiles, drop shadow, blur, gradient, jpeg artifacts
```

## 1. `enemy_exploder.png`: the bomb goblin — move, hurt, death, spawn (authored facing right)

Save as `docs/art/sheets/CO-104/enemy_exploder.png`. In game the engine mirrors it to face where it runs.

Delivered as: JPEG 1536x1024 px from `openai/gpt-image-2`, in two passes. The first sheet drew the bomb black, and in game it vanished into the dark cobblestones: only the fuse sparks and an olive smudge showed. So the same sheet was fed back as the reference with the bomb repainted warning red with a yellow band and the skin lightened, which is what the block below asks for from the start. All 13 frames were drawn, on a grid of about 290 px rather than 256, so drawings crossed the cell lines. Rescued by moving pixels, not redrawing: each row's parts (a pixel more than 90 from #FF00FF, specks under 6 px dropped) were split into drawings at the row's widest empty gaps and pasted onto a flat #FF00FF canvas of 288 px cells (1728x1152), each drawing's mass centre on its cell's centre line and every row's lowest pixel at y 258, so the standing body lands on the cell centre. Saved as PNG with no C2PA chunk. Cut at `sheetCell` 168 (the goblin about 25 px across, 29x35 with the sparks), `maxMagenta` 20, on its own atlas page (`props14`) with the slimes.

```text
Create one pixel-art animation sheet for an exploding enemy in a top-down 2D game. The creature is the bomb goblin from the attached reference picture: a hunched goblin imp with light olive-green skin (#8FA63A, #5C6E22 shading) and a thick dark outline, pointed ears, a grin and yellow eyes, running with a round iron bomb strapped to its back. The bomb is painted bright warning red (#E53935 with #B71C1C shading and a #FF8A80 highlight on its top-left), with a wide bright yellow band (#FFD600) round its middle and a thick black outline, and its short fuse is lit and sparking orange (#FF9800) and yellow (#FFEB3B). It faces right in every single frame. Copy only the goblin from the reference, never its floor, the hero or the other monsters.

The canvas is 1536 by 1024 pixels, a grid of 256 pixel square cells, 6 across and 4 down. In every cell the goblin with its bomb is about 150 pixels wide, centred left to right, with its feet on the same line near the bottom of the cell in every frame.
Row 1 is a four-frame running loop in the first four cells: legs mid-stride, arms pumping, the fuse sparks flickering. The last two cells of the row stay blank magenta.
Row 2 has one frame in the first cell: the goblin flinches, drawn a shade paler, still facing right, the fuse still lit. The other five cells stay blank magenta.
Row 3 is a four-frame death in the first four cells: the bomb flashes bright white-yellow, a round burst of orange and yellow fire swallows the goblin, the burst breaks into dark grey smoke puffs and flying embers, the last few embers and a small smoke puff fade. The last two cells stay blank magenta.
Row 4 is a four-frame spawn in the first four cells: a small puff of dark smoke on the ground, the goblin crouched half out of the smoke, the goblin standing, the goblin settled with the fuse catching light. The last two cells stay blank magenta.

No pink, rose, purple or violet anywhere; its colours are olive green, warning red, yellow, orange, grey and brown only.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference picture.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise, vignette, drop shadow or ground shadow.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell with at least 30 pixels of plain magenta to every cell edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Give every cell that is not described as blank visible art.
Deliver one PNG (preferred; a JPEG on flat magenta is accepted), at the canvas size given above.
```

## 2. `enemy_splitter.png`: the indigo slime — move, hurt, death, spawn (authored facing right)

Save as `docs/art/sheets/CO-104/enemy_splitter.png`. On flat green, not magenta: indigo-violet sits close enough to the magenta key that the key would eat its highlights.

Delivered as: JPEG 1536x1024 px from `openai/gpt-image-2`, all 13 frames drawn, on the same ~290 px drift as the goblin. Re-gridded the same way (a pixel more than 110 from #00FF00, lowest pixel at y 240) onto 288 px cells, because the death splash is 254 px wide and would not fit a 256 px cell. Every green-dominant pixel left in the JPEG fringe was then snapped to #00FF00. Saved as PNG with no C2PA chunk. Cut at `sheetCell` 184 (the slime about 34 px across) on `props14`.

```text
Create one pixel-art animation sheet for a splitting slime enemy in a top-down 2D game. The creature is the big slime from the attached reference picture: a large wobbling dome of deep indigo-violet jelly (#3A2A8C body, #251A5E shadow, #7B6CE0 and #B3A8FF glossy highlights on its top-left) with a darker round core inside it and a few drips at its base. It faces right in every single frame: its core and highlights lean a little to the right. Copy only the big slime from the reference, never its floor, the hero, the small slimes or the other monsters.

The canvas is 1536 by 1024 pixels, a grid of 256 pixel square cells, 6 across and 4 down. In every cell the slime is about 180 pixels wide, centred left to right, with its base on the same line near the bottom of the cell in every frame.
Row 1 is a four-frame creeping loop in the first four cells: the dome squashes wide, stretches up, leans right, settles, and the drips shift. The last two cells of the row stay blank green.
Row 2 has one frame in the first cell: the slime flinches, squashed flat and drawn a shade paler. The other five cells stay blank green.
Row 3 is a four-frame death in the first four cells: the slime bulges and cracks open, it bursts into a flat splash of indigo jelly, the splash shrinks into a few droplets, the last small droplets fade. The last two cells stay blank green.
Row 4 is a four-frame spawn in the first four cells: a small indigo puddle on the ground, the slime half risen out of the puddle, the full dome, the dome settled in place. The last two cells stay blank green.

No green anywhere in the drawings; the slime's colours are indigo, violet and pale lilac highlights only.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference picture.
Background: the file is one sheet of flat pure green #00FF00 with the drawings sitting straight on it. Green runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise, vignette, drop shadow or ground shadow.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the green behind a drawing is the same green as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell with at least 30 pixels of plain green to every cell edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Give every cell that is not described as blank visible art.
Deliver one PNG (preferred; a JPEG on flat green is accepted), at the canvas size given above.
```

## 3. `enemy_splitling.png`: the small slime a splitter leaves — move, hurt, death, spawn (authored facing right)

Save as `docs/art/sheets/CO-104/enemy_splitling.png`, on flat green like its parent. Its spawn row is a splash pulling together, because a splitling is born out of its parent's burst, not out of the ground.

Delivered as: JPEG 1536x1024 px from `openai/gpt-image-2`, all 13 frames drawn, with the same drift. Re-gridded the same way (lowest pixel at y 230) onto 288 px cells, then the green fringe was snapped. Saved as PNG with no C2PA chunk. Cut at `sheetCell` 108 (the splitling about 15 px across) on `props14`.

```text
Create one pixel-art animation sheet for a small slime enemy in a top-down 2D game. The creature is one of the three small slimes from the attached reference picture, the children the big slime splits into: a small round blob of deep indigo-violet jelly (#3A2A8C body, #251A5E shadow, #7B6CE0 and #B3A8FF glossy highlights on its top-left) with a dark round core, simpler than the big slime, with one or two drips. It faces right in every single frame: its core and highlight lean a little to the right. Copy only a small slime from the reference, never its floor, the hero, the big slime or the other monsters.

The canvas is 1536 by 1024 pixels, a grid of 256 pixel square cells, 6 across and 4 down. In every cell the small slime is about 150 pixels wide, centred left to right, with its base on the same line near the bottom of the cell in every frame.
Row 1 is a four-frame hopping loop in the first four cells: the blob squashes, springs up round, lands leaning right, settles. The last two cells of the row stay blank green.
Row 2 has one frame in the first cell: the blob flinches, squashed flat and drawn a shade paler. The other five cells stay blank green.
Row 3 is a four-frame death in the first four cells: the blob pops, it bursts into a small splash of indigo jelly, the splash shrinks to a few droplets, the last droplets fade. The last two cells stay blank green.
Row 4 is a four-frame spawn in the first four cells: a small splash of indigo jelly flying outward, the splash pulling together into a lumpy blob, the round blob, the blob settled in place. The last two cells stay blank green.

No green anywhere in the drawings; the slime's colours are indigo, violet and pale lilac highlights only.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference picture.
Background: the file is one sheet of flat pure green #00FF00 with the drawings sitting straight on it. Green runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise, vignette, drop shadow or ground shadow.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the green behind a drawing is the same green as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell with at least 30 pixels of plain green to every cell edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Give every cell that is not described as blank visible art.
Deliver one PNG (preferred; a JPEG on flat green is accepted), at the canvas size given above.
```
