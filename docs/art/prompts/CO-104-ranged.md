# CO-104 Art: Ranged enemy and its shot

Ticket: [#126](https://github.com/danhquach/crimsononslaught/issues/126)

The ranged enemy keeps its distance and spits shots at the player. At review (2026-09-26) three concepts were generated over the arena (a spitter with pink acid, a hooded caster with a violet orb, a floating eye with a green glob), and concept A was chosen: a squat orange spitter whose shot is a hot-pink glob. Pink was kept because no player shot uses it (fire's orange, ice's blue, lightning's yellow, earth's brown), so the player can tell at a glance what to dodge; green was rejected because a green blob flying at the player reads as an XP gem drifting in. The concept picture was attached to both prompts below as the reference.

Two sheets. Copy each whole `text` block and paste it as the prompt, with the concept picture attached. Nothing else to add.

If the tool has a negative-prompt field, paste this into it for both:

```text
text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, floor tiles, drop shadow, blur, gradient, jpeg artifacts
```

## 1. `enemy_ranged.png`: the spitter — move, hurt, death, spawn (authored facing right)

Save as `docs/art/sheets/CO-104/enemy_ranged.png`. In game the engine mirrors it to face the player.

Delivered as: JPEG 1536x1024 px from `openai/gpt-image-2` (medium quality; high timed out), 6x4 of 256 px, every drawing as asked, no ruled grid band. The drawings drifted right along every row, so the death and spawn frames ran up to ~25 px into their neighbours. Rescued by moving pixels, not redrawing: each drawing was found as connected parts (a pixel more than 90 from #FF00FF, specks under 6 px dropped — each under one native pixel), the parts of a row grouped round its largest ones, and each drawing pasted onto a fresh flat #FF00FF canvas with its mass centre on its cell's centre line and every row shifted so its lowest pixel sits at y 200, so the standing body lands on the cell centre and the frame anchor on the body, not the shell. Saved as PNG with no C2PA chunk. Cut at `sheetCell` 144 (the creature about 24 px across), `maxMagenta` 20, on its own atlas page (`props13`) so no other page re-quantises.

```text
Create one pixel-art animation sheet for a ranged enemy in a top-down 2D game. The creature is the orange spitter from the attached reference picture: a squat, hunched toad-like spitter on short legs, deep burnt orange (#D84315) with a lumpy charcoal (#3E2723) back and a pale peach swollen throat sac (#FFCCBC), a wide mouth, and it faces right in every single frame. Copy only the creature from the reference, never its floor, the hero or the other monsters.

The canvas is 1536 by 1024 pixels, a grid of 256 pixel square cells, 6 across and 4 down. In every cell the creature is about 150 pixels wide, centred left to right, with its feet on the same line near the bottom of the cell in every frame.
Row 1 is a four-frame walking loop in the first four cells: the short legs step and the throat sac bobs. The last two cells of the row stay blank magenta.
Row 2 has one frame in the first cell: the creature flinches, drawn a shade paler, still facing right. The other five cells stay blank magenta.
Row 3 is a four-frame death in the first four cells: it staggers, the throat sac bursts, it slumps flat, the remains shrink to a small dark smear. The last two cells stay blank magenta.
Row 4 is a four-frame spawn in the first four cells: a small crack of orange light in the ground, half the body risen out of it, the full body, the body settled in place. The last two cells stay blank magenta.

No pink, rose, purple or violet anywhere on the creature; its colours are burnt orange, charcoal, peach and dark brown only.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference picture.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise, vignette, drop shadow or ground shadow.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell with at least 30 pixels of plain magenta to every cell edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Give every cell that is not described as blank visible art.
Deliver one PNG (preferred; a JPEG on flat magenta is accepted), at the canvas size given above.
```

## 2. `ranged_shot.png`: the pink acid glob in flight (authored flying right)

Save as `docs/art/sheets/CO-104/ranged_shot.png`. In game the shot is turned to its heading.

The glob is pink, so this sheet is drawn on flat green, not the house magenta: on magenta the key would eat the art. The cutter samples each cell's key from its corners, so either works.

Delivered as: JPEG 1408x480 px (asked 1024x256) from `openai/gpt-image-2`, four globs as asked, each inside its own 352x480 cell. Re-gridded by moving pixels onto four 480x480 cells (1920x480): each cell's parts (a pixel more than 110 from #00FF00) pasted with the orb's centre (front edge less its 50 px radius) on the cell centre, so the orb holds still and only the flicker moves; then every green-dominant pixel left in the JPEG fringe snapped to #00FF00. Saved as PNG with no C2PA chunk. Cut `centred` at `sheetCell` 220 (the orb about 12 px across, the size of the `proj_enemy` placeholder the hit circle is sized from), on `props13` with the spitter.

```text
Create one pixel-art animation sheet for an enemy's projectile in a top-down 2D game: the glowing hot-pink acid glob the orange spitter fires in the attached reference picture. Copy only the glob, never the floor or any creature.

The canvas is 1024 by 256 pixels, a grid of 256 pixel square cells, 4 across and 1 down, read left to right. Each cell holds one glob flying to the right: a round orb about 90 pixels across, hot pink (#FF2BD6 and #E0109E) with a thick dark plum outline (#4A0033) and a small white-hot centre (#FFE6FA), with a short tail of three or four pink droplets trailing behind it to the left, the whole drawing about 170 pixels long. The orb sits at the same spot, the centre of the cell, in all four cells. The four drawings are one flicker that loops: the white centre brightens and dims a little and the trailing droplets sit in slightly different places.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference picture. No soft glow, halo or haze: every edge is a hard pixel edge against the background.
Background: the file is one sheet of flat pure green #00FF00 with the drawings sitting straight on it. Green runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette. No green anywhere in the drawings.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the green behind a drawing is the same green as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell with at least 30 pixels of plain green to every cell edge; draw it smaller rather than let it spill. Give every cell visible art.
Deliver one PNG (preferred; a JPEG on flat green is accepted), at the canvas size given above.
```
