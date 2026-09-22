# CO-123 Art: FX sheets for the Phase 2 spell roster

Ticket: [#145](https://github.com/danhquach/crimsononslaught/issues/145) · Epic: [#122](https://github.com/danhquach/crimsononslaught/issues/122) · Spec: `docs/superpowers/specs/2026-09-18-phase2-spells.md` §9

Nineteen sheets, **one object per sheet**, so every sheet can be cut on its own grid and a bad one is redone on its own. Nothing here shares a file with anything else.

## What already exists — do not re-draw

These spells reuse frames that are already in the atlas, so they are not in the list below:

| Spell | Reuses |
|---|---|
| Fire Bolt (`fire`) | `fire.fly`, `fire.spawn`, `fire.explode` |
| Meteor's impact | `fire.explode` (drawn at `aoeRadius / 40`, so a 110 px blast is the same art at 2.75×) |
| Fire Dragon's impact | `fire.explode` at 0.75× (30 px blast) |
| Lightning Bolt, Chain Lightning | `lightning.strike`, `lightning.impact`, `lightning.chain`, `lightning.stun` |
| Boulder | `earth.spin`, `earth.impact`, `earth.dust` |
| Frost Nova Bomb's detonation | `ice.nova` |
| Companions (all four) | [#146](https://github.com/danhquach/crimsononslaught/issues/146), a separate ticket |

## How to run this

**One sheet per run. Copy the whole `text` block under that sheet's heading — everything between the two ``` lines — and paste it as the prompt. Nothing else to add.** Each block is complete on its own: subject, grid, style and delivery. The style and grid rules are repeated word for word in all nineteen blocks on purpose, so there is never a second thing to remember to paste.

Two things that live outside the block, the same for every sheet:

- Attach the approved prop sheet (`docs/art/prop-sheet-prompt-v1.md`, or any
  accepted sheet in `docs/art/sheets/`) as the style reference.
- If the tool has a negative-prompt field, paste this into it:

  ```text
  text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, drop shadow, blur, gradient, jpeg artifacts
  ```

Then save the result as **PNG** under the filename the heading gives, and keep the pixel size the tool reports.

## Where to put the finished sheets

```
docs/art/sheets/CO-123/<filename>.png
```

The folder already exists in this branch. Filenames are the ones in the table below, exactly — `docs/art/sheets/manifest.json` will point at `CO-123/<filename>.png`, and the cutter reads only the manifest. PNG, not JPEG: every JPEG sheet so far came back with ~130k unique colours and a halo on every hard edge.

Drop them in as they come; they do not have to arrive together. Tell me which ones landed and I will measure them, add the manifest entries and run `npm run art:cut`.

## The sheets

`cell` is the authored cell size; the cutter's native frame is `cell / 4`, which is the size the effect is drawn at in game before the engine scales it. `art` is how wide the drawing may be inside its cell — the rest is margin.

| # | File | Grid | Canvas | cell | art ≤ | Plays |
|---|---|---|---|---|---|---|
| 1 | `fire_meteor_telegraph.png` | 2 × 2 | 1536 × 1536 | 768 | 520 | loop |
| 2 | `fire_meteor_body.png` | 4 × 1 | 2048 × 512 | 512 | 300 | loop |
| 3 | `fire_column_body.png` | 4 × 1 | 2048 × 512 | 512 | 320 | loop |
| 4 | `fire_column_impact.png` | 4 × 1 | 2048 × 512 | 512 | 320 | once |
| 5 | `fire_dragon_body.png` | 4 × 1 | 2048 × 512 | 512 | 300 | loop |
| 6 | `ice_arrow_body.png` | 4 × 1 | 1024 × 256 | 256 | 150 | loop |
| 7 | `ice_arrow_impact.png` | 4 × 1 | 1024 × 256 | 256 | 150 | once |
| 8 | `ice_bomb_body.png` | 4 × 1 | 1024 × 256 | 256 | 140 | loop |
| 9 | `ice_shield_body.png` | 4 × 1 | 1536 × 384 | 384 | 240 | loop |
| 10 | `ice_shield_break.png` | 4 × 1 | 2048 × 512 | 512 | 360 | once |
| 11 | `ice_blizzard_area.png` | 2 × 2 | 1536 × 1536 | 768 | 520 | loop |
| 12 | `lightning_tornado.png` | 2 × 2 | 1536 × 1536 | 768 | 520 | loop |
| 13 | `lightning_sword.png` | 4 × 1 | 1024 × 256 | 256 | 150 | loop |
| 14 | `earth_spike.png` | 5 × 1 | 2560 × 512 | 512 | 300 | once |
| 15 | `earth_shield_stone.png` | 4 × 1 | 1024 × 256 | 256 | 130 | loop |
| 16 | `earth_shield_break.png` | 4 × 1 | 2048 × 512 | 512 | 320 | once |
| 17 | `earth_quake_area.png` | 2 × 2 | 1536 × 1536 | 768 | 520 | loop |
| 18 | `status_bleed.png` | 4 × 1 | 640 × 160 | 160 | 80 | loop |
| 19 | `status_stagger.png` | 4 × 1 | 640 × 160 | 160 | 80 | loop |

Every cell of every sheet holds a frame. There are no blank cells anywhere in this ticket, on purpose: "leave this one empty" is what made an earlier model write the word *empty* into the picture.

---

## 1. `fire_meteor_telegraph.png` — the warning ring under a falling meteor

Save as `docs/art/sheets/CO-123/fire_meteor_telegraph.png`. Copy the whole block below; it is the complete prompt.

```text
Create one pixel-art animation sheet for a top-down 2D game: the warning mark that burns on the ground where a meteor is about to land. Draw only the mark on the ground, no meteor and no creatures.

The canvas is 1536 by 1536 pixels, a grid of 768 pixel square cells, two cells across and two cells down, so there are four cells in total. They read left to right along the top row and then left to right along the bottom row. Each drawing is about 520 pixels across and is centred in its cell, which leaves about 120 pixels of plain magenta between the drawing and every cell edge.

The mark is a flat circular ring of ember orange, hex #FF8A65, seen from straight above, as if scorched into the dirt: a bright rim about twelve pixels thick, a darker charred interior, and a few glowing cracks running inward.

The four drawings are one pulse that repeats. First the ring glows faintly and the cracks are dull. Second the ring is brighter and the cracks glow orange. Third the ring is at its brightest, with small embers lifting off the rim. Fourth the ring has dimmed back toward the first drawing so the loop is smooth. The ring keeps the same diameter and the same centre in all four cells.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Keep the effect's centre and its size the same in every cell unless told otherwise, and give every cell visible art: a fading last frame never goes empty.
Deliver one lossless PNG, not JPEG, at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```

## 2. `fire_meteor_body.png` — the meteor itself, falling

Save as `docs/art/sheets/CO-123/fire_meteor_body.png`. Copy the whole block below; it is the complete prompt.

```text
Create one pixel-art animation sheet for a top-down 2D game: a burning meteor seen from above as it falls toward the ground. Draw only the meteor, no ground, no target mark and no creatures.

The canvas is 2048 by 512 pixels, a grid of 512 pixel square cells, four cells across and one cell down. They read left to right. Each drawing is about 300 pixels across and is centred in its cell, which leaves about 100 pixels of plain magenta between the drawing and every cell edge.

The meteor is a jagged dark rock, charcoal grey with molten orange seams, wrapped in flame. Because it is seen from above while it falls toward the viewer, its flame trail streams away from the rock toward the top of the cell and the rock sits slightly below the centre of the cell.

The four drawings are one loop of the same falling meteor, at the same size and the same position in every cell: the flame licks shift, the molten seams brighten and dim, and a few embers peel off the trail in different places. The rock itself does not rotate and does not change size.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Keep the effect's centre and its size the same in every cell unless told otherwise, and give every cell visible art: a fading last frame never goes empty.
Deliver one lossless PNG, not JPEG, at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```

## 3. `fire_column_body.png` — the travelling column of fire

Save as `docs/art/sheets/CO-123/fire_column_body.png`. Copy the whole block below; it is the complete prompt.

```text
Create one pixel-art animation sheet for a top-down 2D game: a roaring column of fire that slides across the ground. Draw only the fire, no ground texture and no creatures.

The canvas is 2048 by 512 pixels, a grid of 512 pixel square cells, four cells across and one cell down. They read left to right. Each drawing is about 320 pixels across and is centred in its cell, which leaves about 96 pixels of plain magenta between the drawing and every cell edge.

The column is a standing pillar of flame seen from the three-quarter camera: a white-hot core, a body of deep orange, hex #FF6D00, darkening to crimson at the outer licks, and a ring of embers and soot around its base. It is taller than it is wide, about 320 pixels tall and about 190 pixels wide.

The four drawings are one loop of the same column burning in place, at the same size and the same base position in every cell: the licks rise and curl in different shapes, the core pulses brighter and dimmer, and embers lift from the base at different points. The column never leans over or moves off its base.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Keep the effect's centre and its size the same in every cell unless told otherwise, and give every cell visible art: a fading last frame never goes empty.
Deliver one lossless PNG, not JPEG, at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```

## 4. `fire_column_impact.png` — what the column does to what it touches

Save as `docs/art/sheets/CO-123/fire_column_impact.png`. Copy the whole block below; it is the complete prompt.

```text
Create one pixel-art animation sheet for a top-down 2D game: the burst of fire that marks the moment the fire column burns a creature. Draw only the fire, no creature and no ground.

The canvas is 2048 by 512 pixels, a grid of 512 pixel square cells, four cells across and one cell down. They read left to right. Each drawing is centred in its cell and none is wider than 320 pixels, which leaves at least 96 pixels of plain magenta between the drawing and every cell edge.

The colours are white-hot at the centre, orange, hex #FF6D00, through the body and dark crimson at the edges.

The four drawings play once, in this order. First a small hard flash of white-hot fire about 120 pixels across. Second it blooms into a rough ball of flame about 300 pixels across with ragged edges. Third the ball breaks into eight to ten separate embers thrown outward with short soot trails behind them. Fourth the embers are smaller, further out and dimmer, with thin smoke between them. The fourth drawing is faint but still clearly visible; it never fades to nothing. All four drawings share the same centre point.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Keep the effect's centre and its size the same in every cell unless told otherwise, and give every cell visible art: a fading last frame never goes empty.
Deliver one lossless PNG, not JPEG, at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```

## 5. `fire_dragon_body.png` — the homing fire dragon

Save as `docs/art/sheets/CO-123/fire_dragon_body.png`. Copy the whole block below; it is the complete prompt.

```text
Create one pixel-art animation sheet for a top-down 2D game: a small dragon made of fire that flies at its target. Draw only the dragon, no ground and no creatures.

The canvas is 2048 by 512 pixels, a grid of 512 pixel square cells, four cells across and one cell down. They read left to right. Each drawing is about 300 pixels long and is centred in its cell, which leaves about 100 pixels of plain magenta between the drawing and every cell edge.

The dragon is seen from above, flying toward the right edge of the cell: a serpentine body of living flame with a blunt horned head at the front, two short swept wings, and a tail that thins into embers behind it. The head and body are orange, hex #FF6D00, with a white-hot mouth and dark crimson edges. Every drawing faces right; do not mirror or copy a drawing.

The four drawings are one loop of the same dragon in flight, its head at the same point in every cell: the wings beat down and up across the four drawings, the body undulates slightly, and the tail embers scatter differently each time. The dragon does not change size and never turns.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Keep the effect's centre and its size the same in every cell unless told otherwise, and give every cell visible art: a fading last frame never goes empty.
Deliver one lossless PNG, not JPEG, at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```

## 6. `ice_arrow_body.png` — the ice arrow in flight

Save as `docs/art/sheets/CO-123/ice_arrow_body.png`. Copy the whole block below; it is the complete prompt.

```text
Create one pixel-art animation sheet for a top-down 2D game: a sharp arrow of ice in flight. Draw only the arrow, no ground and no creatures.

The canvas is 1024 by 256 pixels, a grid of 256 pixel square cells, four cells across and one cell down. They read left to right. Each drawing is about 150 pixels long and about 60 pixels tall, centred in its cell, which leaves at least 50 pixels of plain magenta between the drawing and every cell edge.

The arrow is a tapered icicle pointing at the right edge of the cell: a white core, pale blue faces, hex #80D8FF, a darker cyan underside, hex #40C4FF, and a few chipped facets along its length. Every drawing points right.

The four drawings are one loop of the same arrow flying, its tip at the same point in every cell: small frost motes and a short vapour wisp trail behind the tail and shift from drawing to drawing, and the white core glints in a different facet each time. The arrow does not change size or angle.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Keep the effect's centre and its size the same in every cell unless told otherwise, and give every cell visible art: a fading last frame never goes empty.
Deliver one lossless PNG, not JPEG, at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```

## 7. `ice_arrow_impact.png` — the arrow landing

Save as `docs/art/sheets/CO-123/ice_arrow_impact.png`. Copy the whole block below; it is the complete prompt.

```text
Create one pixel-art animation sheet for a top-down 2D game: the small burst of frost where an ice arrow strikes. Draw only the frost, no creature and no arrow.

The canvas is 1024 by 256 pixels, a grid of 256 pixel square cells, four cells across and one cell down. They read left to right. Each drawing is centred in its cell and none is wider than 150 pixels, which leaves at least 50 pixels of plain magenta between the drawing and every cell edge.

The colours are white at the centre, pale blue, hex #80D8FF, through the body and deeper cyan, hex #40C4FF, at the tips.

The four drawings play once, in this order. First a small white star of frost about 50 pixels across. Second it opens into six to eight angular shards pointing outward, about 140 pixels across. Third the shards are further out, thinner, with small ice crystals hanging between them. Fourth only three or four faint crystals are left, still clearly visible and never fully gone. All four drawings share the same centre point.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Keep the effect's centre and its size the same in every cell unless told otherwise, and give every cell visible art: a fading last frame never goes empty.
Deliver one lossless PNG, not JPEG, at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```

## 8. `ice_bomb_body.png` — the frost bomb in flight

Save as `docs/art/sheets/CO-123/ice_bomb_body.png`. Copy the whole block below; it is the complete prompt.

```text
Create one pixel-art animation sheet for a top-down 2D game: a round frost bomb tumbling through the air. Draw only the bomb, no ground and no creatures.

The canvas is 1024 by 256 pixels, a grid of 256 pixel square cells, four cells across and one cell down. They read left to right. Each drawing is about 140 pixels across and is centred in its cell, which leaves about 58 pixels of plain magenta between the drawing and every cell edge.

The bomb is a rough ball of packed frost: a pale blue body, hex #80D8FF, a crust of white rime on top, darker cyan hollows, hex #40C4FF, and a few small icicles hanging off it. A thin curl of cold vapour comes off it.

The four drawings are one spin loop: the bomb turns a quarter turn clockwise in each drawing, so the rime crust and the icicles travel around it and the fourth drawing leads back into the first. The centre of the bomb stays at the same point in every cell and its size does not change.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Keep the effect's centre and its size the same in every cell unless told otherwise, and give every cell visible art: a fading last frame never goes empty.
Deliver one lossless PNG, not JPEG, at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```

## 9. `ice_shield_body.png` — the ice bubble around the player

Save as `docs/art/sheets/CO-123/ice_shield_body.png`. Copy the whole block below; it is the complete prompt.

```text
Create one pixel-art animation sheet for a top-down 2D game: a bubble of ice that wraps around the player. Draw only the bubble, no player and no ground; the inside of the bubble is empty so the player would stand inside it and show through.

The canvas is 1536 by 384 pixels, a grid of 384 pixel square cells, four cells across and one cell down. They read left to right. Each drawing is about 240 pixels across and is centred in its cell, which leaves about 72 pixels of plain magenta between the drawing and every cell edge.

The bubble is one closed shell of clear ice seen from the three-quarter camera: a slightly squashed circle about 240 pixels wide and about 180 pixels tall, so it sits over a figure rather than beside one. Its wall is a thin unbroken rim, about 14 pixels thick, in pale ice, hex #B3E5FC, with a white line along the upper edge where the light strikes it and a deeper cyan line along the lower edge, hex #40C4FF. Inside the rim, two or three thin curved sheen streaks in that same pale ice arc across the upper left of the shell, and a handful of small rime crystals cling to the lower rim. Everything else inside the shell is plain magenta: the bubble is a wall of glass with nothing filling it, and it must stay open enough that a figure standing in it would be plainly visible.

Draw the rim, the streaks and the crystals at full strength, in flat opaque pixels. The game fades the whole bubble down as the shield is worn away, so nothing here is drawn faded, hazy or see-through, no part of it is stippled, dotted or checkered to suggest glass, and the shell is never filled in.

The four drawings are one loop of the same bubble holding steady: the sheen streaks slide a little way around the shell and back, a different rime crystal glints white in each drawing, and one or two small frost motes drift just outside the rim in different places. The shell keeps the same centre, the same size and the same unbroken outline in all four cells.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Keep the effect's centre and its size the same in every cell unless told otherwise, and give every cell visible art: a fading last frame never goes empty.
Deliver one lossless PNG, not JPEG, at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```

## 10. `ice_shield_break.png` — the bubble bursting

Save as `docs/art/sheets/CO-123/ice_shield_break.png`. Copy the whole block below; it is the complete prompt.

```text
Create one pixel-art animation sheet for a top-down 2D game: the bubble of ice around the player bursting. Draw only the ice, no player and no ground.

The canvas is 2048 by 512 pixels, a grid of 512 pixel square cells, four cells across and one cell down. They read left to right. Each drawing is centred in its cell and none is wider than 360 pixels, which leaves at least 76 pixels of plain magenta between the drawing and every cell edge.

The ice is pale, hex #B3E5FC, with white break faces and deeper cyan shadows, hex #40C4FF.

The four drawings play once, in this order. First the same bubble as the shield sheet, a closed shell about 240 pixels wide and 180 pixels tall with a thin rim and an empty middle, now with white cracks webbing right around the rim. Second the shell splits along those cracks into six or seven curved pieces that have just come apart, the outline broken and about 290 pixels across, with the first puff of frost mist escaping through the gaps. Third the pieces have flown outward and snapped into ten to fourteen shards, about 360 pixels across, through a ring of frost mist. Fourth the shards are near the outer edge of that spread, smaller and thinner, with a haze of frost between them; still clearly visible and never fully gone. All four drawings share the same centre point.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Keep the effect's centre and its size the same in every cell unless told otherwise, and give every cell visible art: a fading last frame never goes empty.
Deliver one lossless PNG, not JPEG, at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```

## 11. `ice_blizzard_area.png` — the blizzard on the ground

Save as `docs/art/sheets/CO-123/ice_blizzard_area.png`. Copy the whole block below; it is the complete prompt.

```text
Create one pixel-art animation sheet for a top-down 2D game: a circular patch of blizzard lying on the ground, seen from straight above. Draw only the blizzard, no ground texture and no creatures.

The canvas is 1536 by 1536 pixels, a grid of 768 pixel square cells, two cells across and two cells down, so there are four cells in total. They read left to right along the top row and then left to right along the bottom row. Each drawing is about 520 pixels across and is centred in its cell, which leaves about 120 pixels of plain magenta between the drawing and every cell edge.

The patch is not a solid disc and has no filled middle. It is an ice storm seen from above, driven by a strong wind, falling inside a circle about 520 pixels across in the middle of the cell. Nothing at all is drawn outside that circle: the corners of the cell stay plain magenta.

The wind blows from the upper left to the lower right, and every single mark obeys it. There are no vertical marks anywhere on the sheet. Each flake or pellet is a small hard-edged head four to eight pixels wide in white and pale blue, hex #80D8FF — some six-point flakes, some blunt pellets — with a straight streak twelve to twenty pixels long trailing behind it up and to the left, all of them lying on the same diagonal, about thirty degrees off vertical. No streak is longer than thirty pixels.

Keep the storm thin. Twenty-four to thirty marks in the whole circle, spread out with wide gaps of plain magenta between them, so that most of the circle is still bare magenta and a creature standing in the patch is clearly visible through the storm. Every drawing holds the same number of marks: no drawing is emptier or busier than the others. Four or five small white splash puffs, about ten pixels wide, sit in the lower right part of the circle where pellets have just struck.

A thin broken ring of pale blue frost, about eight pixels thick, marks the edge of the circle so the patch's reach is readable; it is a dashed, crystalline edge, not a solid outline, and nothing is drawn beyond it.

The four drawings are one driving loop. Every mark sits on an invisible diagonal track running the way the wind blows, and in each drawing all of them slide a quarter of the distance between one mark and the next along those tracks, so after the fourth drawing the pattern has moved exactly one spacing and the first drawing follows it seamlessly. A mark that would leave the circle at the lower right reappears at the upper left of the same track. The splash puffs pop in a different place in each drawing, and the frost ring keeps the same diameter and the same centre in all four cells.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Keep the effect's centre and its size the same in every cell unless told otherwise, and give every cell visible art: a fading last frame never goes empty.
Deliver one lossless PNG, not JPEG, at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```

## 12. `lightning_tornado.png` — the drifting vortex

Save as `docs/art/sheets/CO-123/lightning_tornado.png`. Copy the whole block below; it is the complete prompt.

```text
Create one pixel-art animation sheet for a top-down 2D game: a crackling tornado that drifts across the battlefield. Draw only the tornado, no ground and no creatures.

The canvas is 1536 by 1536 pixels, a grid of 768 pixel square cells, two cells across and two cells down, so there are four cells in total. They read left to right along the top row and then left to right along the bottom row. Each drawing is about 520 pixels tall and about 420 pixels wide, centred in its cell, which leaves at least 120 pixels of plain magenta between the drawing and every cell edge.

The tornado is a funnel seen from the three-quarter camera: wide at the top, narrow where it meets the ground, built from stacked bands of charcoal grey wind with pale yellow lightning arcs, hex #FFEE58, running through them, and a scatter of grit and sparks orbiting the base.

The four drawings are one loop of the same funnel, its base at the same point in every cell: the wind bands rotate, the lightning arcs jump to different places in the funnel, and the grit orbits round. The funnel keeps the same height and width and never leans over.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Keep the effect's centre and its size the same in every cell unless told otherwise, and give every cell visible art: a fading last frame never goes empty.
Deliver one lossless PNG, not JPEG, at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```

## 13. `lightning_sword.png` — the orbiting blade, one facing only

Save as `docs/art/sheets/CO-123/lightning_sword.png`. Copy the whole block below; it is the complete prompt.

```text
Create one pixel-art animation sheet for a top-down 2D game: a lightning sword that circles the player. Draw only the sword, no player and no ground.

The canvas is 1024 by 256 pixels, a grid of 256 pixel square cells, four cells across and one cell down. They read left to right. Each drawing is about 150 pixels long and about 40 pixels tall, centred in its cell, which leaves at least 50 pixels of plain magenta between the drawing and every cell edge.

The sword lies flat, seen from above, and points to the right in every drawing: the pommel is at the left end, then a charcoal grip, a small charcoal crossguard, and the blade running to a point at the right end. The blade is hard-edged pale yellow lightning, hex #FFEE58, with a white core down its length and small arcs jumping off its edges.

The sword is drawn in this one facing and no other. It is never turned, tilted, mirrored or angled: the game itself turns the sprite as the sword travels around the player, keeping the hilt pointing at the player and the tip pointing outward, so a drawing that is already angled would be turned twice and point the wrong way. Every cell holds the same sword at the same size, lying along the same horizontal line, with the middle of the sword at exactly the same point in its cell.

The four drawings are one crackle loop: the steel, the grip and the crossguard are identical in all four, and only the lightning changes. The white core pulses along the blade, and the arcs jump off different parts of the edge in each drawing, so the blade reads as live current while it is held perfectly still.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Keep the effect's centre and its size the same in every cell unless told otherwise, and give every cell visible art: a fading last frame never goes empty.
Deliver one lossless PNG, not JPEG, at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```

## 14. `earth_spike.png` — the spike erupting

Save as `docs/art/sheets/CO-123/earth_spike.png`. Copy the whole block below; it is the complete prompt.

```text
Create one pixel-art animation sheet for a top-down 2D game: a stone spike erupting out of the ground. Draw only the spike, the broken dirt at its base and the dust it throws; no creatures.

The canvas is 2560 by 512 pixels, a grid of 512 pixel square cells, five cells across and one cell down. They read left to right. Each drawing is centred in its cell and none is wider than 300 pixels or taller than 320 pixels, which leaves at least 96 pixels of plain magenta between the drawing and every cell edge.

The spike is rough grey-brown rock, hex #8D6E63, with darker cracks, lighter chipped faces catching the top-left light, and earthy brown clods and dust around its base.

The five drawings play once, in this order. First the ground cracks and bulges: a low mound of broken dirt about 160 pixels wide and 40 pixels tall. Second the tip of the spike breaks through, about 90 pixels tall, with clods thrown out to the sides. Third the spike is halfway out, about 190 pixels tall, leaning very slightly, with a ring of dust around its base. Fourth the spike is at full height, about 300 pixels tall, sharp and clean, the dust starting to settle. Fifth the spike is cracked across and sinking a little, with thin dust drifting off it; still clearly visible and never fading to nothing. The base of the spike sits at the same point in every cell, a little below the middle.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Keep the effect's centre and its size the same in every cell unless told otherwise, and give every cell visible art: a fading last frame never goes empty.
Deliver one lossless PNG, not JPEG, at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```

## 15. `earth_shield_stone.png` — one orbiting stone

Save as `docs/art/sheets/CO-123/earth_shield_stone.png`. Copy the whole block below; it is the complete prompt.

```text
Create one pixel-art animation sheet for a top-down 2D game: a single stone plate that circles the player. Draw only the stone, no player and no ground.

The canvas is 1024 by 256 pixels, a grid of 256 pixel square cells, four cells across and one cell down. They read left to right. Each drawing is about 130 pixels across and is centred in its cell, which leaves about 63 pixels of plain magenta between the drawing and every cell edge.

The stone is a chunky angular slab of grey-brown rock, hex #8D6E63, seen from above: darker cracks across its face, a lighter chipped edge catching the top-left light, and a little moss in one hollow.

The four drawings are one spin loop: the slab turns a quarter turn clockwise in each drawing, so its cracks and moss travel around it and the fourth drawing leads back into the first. The centre of the slab stays at exactly the same point in every cell and its size does not change.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Keep the effect's centre and its size the same in every cell unless told otherwise, and give every cell visible art: a fading last frame never goes empty.
Deliver one lossless PNG, not JPEG, at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```

## 16. `earth_shield_break.png` — the stones breaking

Save as `docs/art/sheets/CO-123/earth_shield_break.png`. Copy the whole block below; it is the complete prompt.

```text
Create one pixel-art animation sheet for a top-down 2D game: the ring of stones around the player breaking apart. Draw only the stone and dust, no player and no ground.

The canvas is 2048 by 512 pixels, a grid of 512 pixel square cells, four cells across and one cell down. They read left to right. Each drawing is centred in its cell and none is wider than 320 pixels, which leaves at least 96 pixels of plain magenta between the drawing and every cell edge.

The stone is grey-brown, hex #8D6E63, with pale break faces and brown-grey dust.

The four drawings play once, in this order. First three chunky stone slabs sit in a ring about 200 pixels across, with white-hot cracks flashing across them. Second the slabs split into halves, the ring now about 250 pixels across, with the first puff of dust between them. Third ten to fourteen rock chips fly outward, about 320 pixels across, through a thick ring of brown-grey dust. Fourth the chips are near the outer edge of that spread, small and tumbling, with the dust thinning around them; still clearly visible and never fully gone. All four drawings share the same centre point.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Keep the effect's centre and its size the same in every cell unless told otherwise, and give every cell visible art: a fading last frame never goes empty.
Deliver one lossless PNG, not JPEG, at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```

## 17. `earth_quake_area.png` — the earthquake on the ground

Save as `docs/art/sheets/CO-123/earth_quake_area.png`. Copy the whole block below; it is the complete prompt.

```text
Create one pixel-art animation sheet for a top-down 2D game: a circular patch of cracked, rumbling ground, seen from straight above. This is drawn as a layer over the arena floor, the way cracks would show on whatever is already there, so draw only the cracking and the debris: no soil fill, no grass, no stone texture and no creatures.

The canvas is 1536 by 1536 pixels, a grid of 768 pixel square cells, two cells across and two cells down, so there are four cells in total. They read left to right along the top row and then left to right along the bottom row. Each drawing is about 520 pixels across and is centred in its cell, which leaves about 120 pixels of plain magenta between the drawing and every cell edge.

The patch is a circle about 520 pixels across, marked out by a broken rim of upheaved grey-brown rock, hex #8D6E63, about twenty pixels thick, with a web of hard-edged dark cracks running inward from it toward the centre, a dull ember glow deep inside the widest cracks, and small loose stones and grey-brown dust puffs scattered between them. Everything the cracks, stones and dust do not cover stays plain magenta: the floor beneath shows through, and a creature standing in the patch is plainly visible.

The four drawings are one rumble that repeats. The cracks widen and narrow and throw off a few short new splinters in different places, the ember glow in them brightens and dims, the loose stones hop a pixel or two to different spots as the ground shakes under them, and dust puffs rise in a different part of the circle each drawing. The rim and the circle it marks do not move: the patch keeps exactly the same diameter and the same centre in all four cells, because that edge is what tells a player where the ground is dangerous. The shaking is in the cracks, the stones and the dust, never in the outline.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Keep the effect's centre and its size the same in every cell unless told otherwise, and give every cell visible art: a fading last frame never goes empty.
Deliver one lossless PNG, not JPEG, at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```

## 18. `status_bleed.png` — the bleed overlay

Save as `docs/art/sheets/CO-123/status_bleed.png`. Copy the whole block below; it is the complete prompt.

```text
Create one pixel-art animation sheet of a status effect for a top-down 2D game. No creature is drawn anywhere on this sheet: the effect floats alone on magenta, with no body, blob, silhouette or shading beneath it, and nothing left empty or transparent.

The canvas is 640 by 160 pixels, a grid of 160 pixel square cells, four cells across and one cell down. They read left to right. Each drawing covers an invisible creature about 80 pixels wide and about 60 pixels tall in the middle of its cell, which leaves at least 40 pixels of plain magenta between the drawing and every cell edge.

The effect is bleeding: four or five deep crimson droplets, hex #B71C1C, with darker cores and a small bright highlight on each, plus a short spatter of fine red specks low in the area the creature would occupy.

The four drawings are one loop: the droplets fall a little further in each drawing, the lowest one breaking into specks as it lands, and a new droplet forms at the top, so the fourth drawing leads back into the first. The droplets sit over the creature's area and never spread beyond it.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Keep the effect's centre and its size the same in every cell unless told otherwise, and give every cell visible art: a fading last frame never goes empty.
Deliver one lossless PNG, not JPEG, at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```

## 19. `status_stagger.png` — the stagger overlay

Save as `docs/art/sheets/CO-123/status_stagger.png`. Copy the whole block below; it is the complete prompt.

Written without the word "cell": three deliveries in a row drew the grid instead of ignoring it — panels, dividers, a creature — so this one describes an image with four groups of marks on it and never mentions a grid at all.

```text
One pixel-art image, 640 by 160 pixels, filled edge to edge with flat magenta #FF00FF. The only things painted on that magenta are four small groups of yellow marks. The magenta is identical everywhere behind and between them, fully opaque: no panels, tiles, boxes, frames, lines, borders, shading, text or transparency anywhere in the image.

The four groups sit in a row, centred at 80, 240, 400 and 560 pixels across and 80 pixels down, each fitting inside about 80 by 60 pixels so magenta is clear all around it. A group is three short jagged spark ticks in pale yellow #FFF59D with white centres, arranged in an arc over the top of the group, plus two small curved flick marks at its left and right sides. Chunky hard-edged pixels: no blur, no anti-aliasing, no gradients, no outlines.

The four groups are one four-step loop of the same effect: the sparks flash in turn, and the flick marks swap from the left side to the right and back, so the fourth group leads into the first. Every group has visible marks in it; none is empty.

Deliver one lossless PNG, exactly 640 by 160 pixels, and report the pixel size.
```
