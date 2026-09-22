# CO-123 Art: FX sheets for the Phase 2 spell roster

Ticket: [#145](https://github.com/danhquach/crimsononslaught/issues/145) · Epic:
[#122](https://github.com/danhquach/crimsononslaught/issues/122) · Spec:
`docs/superpowers/specs/2026-09-18-phase2-spells.md` §9

Nineteen sheets, **one object per sheet**, so every sheet can be cut on its own
grid and a bad one is redone on its own. Nothing here shares a file with
anything else.

## What already exists — do not re-draw

These spells reuse frames that are already in the atlas, so they are not in the
list below:

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

1. Generate **one sheet per run**. For each sheet: paste its own block, then
   paste the **House rules** block underneath it, in the same prompt.
2. Attach the approved prop sheet (`docs/art/prop-sheet-prompt-v1.md`, or any
   accepted sheet in `docs/art/sheets/`) as the style reference for every run.
3. If the tool has a negative-prompt field, paste this into it every time:

   ```text
   text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, drop shadow, blur, gradient, jpeg artifacts
   ```

4. Save the result as **PNG** under the exact filename given, and record the
   pixel size the tool reports.

## Where to put the finished sheets

```
docs/art/sheets/CO-123/<filename>.png
```

The folder already exists in this branch. Filenames are the ones in the table
below, exactly — `docs/art/sheets/manifest.json` will point at
`CO-123/<filename>.png`, and the cutter reads only the manifest. PNG, not JPEG:
every JPEG sheet so far came back with ~130k unique colours and a halo on every
hard edge.

Drop them in as they come; they do not have to arrive together. Tell me which
ones landed and I will measure them, add the manifest entries and run
`npm run art:cut`.

## The sheets

`cell` is the authored cell size; the cutter's native frame is `cell / 4`, which
is the size the effect is drawn at in game before the engine scales it. `art` is
how wide the drawing may be inside its cell — the rest is margin.

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
| 13 | `lightning_sword.png` | 6 × 1 | 1536 × 256 | 256 | 150 | loop |
| 14 | `earth_spike.png` | 5 × 1 | 2560 × 512 | 512 | 300 | once |
| 15 | `earth_shield_stone.png` | 4 × 1 | 1024 × 256 | 256 | 130 | loop |
| 16 | `earth_shield_break.png` | 4 × 1 | 2048 × 512 | 512 | 320 | once |
| 17 | `earth_quake_area.png` | 2 × 2 | 1536 × 1536 | 768 | 520 | loop |
| 18 | `status_bleed.png` | 4 × 1 | 640 × 160 | 160 | 80 | loop |
| 19 | `status_stagger.png` | 4 × 1 | 640 × 160 | 160 | 80 | loop |

Every cell of every sheet holds a frame. There are no blank cells anywhere in
this ticket, on purpose: "leave this one empty" is what made an earlier model
write the word *empty* into the picture.

---

## House rules — paste this under every sheet block

```text
Style, the same for every sheet in this project.
Chunky pixel art with crisp hard pixel edges. No blur, no anti-aliasing, no
soft gradients, no outline thinner than one art pixel. The camera is
three-quarter top-down, slightly above and in front, and the light comes from
the top-left in every frame. Dark crimson and charcoal fantasy mood. Original
design that imitates no existing game. Match the look of the reference sheet
attached to this request.

The background is one flat solid colour over the whole canvas: pure bright
magenta, red 255 green 0 blue 255, hex #FF00FF. The same exact magenta fills
every part of every cell that the drawing does not cover, with no vignette, no
texture, no noise, no pattern and no checkerboard.

The canvas holds nothing but the drawings on that magenta. It holds no text of
any kind: no words, letters, numbers, titles, captions, frame names, cell codes
or labels. A single character of text anywhere ruins the whole sheet and it has
to be drawn again.

The canvas is a uniform grid of square cells at the size given above, and the
cells are the same size across the whole canvas. There are no grid lines, no
borders, no frames, no dividers and no watermark drawn anywhere: the cells are
invisible and only the spacing marks them. One drawing per cell, and the cells
read in time order from left to right, and then the next row down.

Every drawing stays well inside its own cell, with a wide band of plain magenta
between the drawing and all four cell edges, at the margin given above. No part
of a drawing touches a cell edge, overlaps a neighbouring cell or bleeds into
one, however large the effect looks. A drawing that would not fit is drawn
smaller, never cropped and never allowed to spill.

The centre of the effect sits at exactly the same point in every cell so the
animation does not drift or jitter as it plays, and the drawing keeps roughly
the same size from cell to cell unless the description asks it to grow.

Every cell holds a drawing. A fading last frame still has clearly visible
pixels in it; it never fades to bare magenta.

Deliver one PNG file, not JPEG, lossless, at the exact canvas size given above.
If the tool cannot render that size, scale the whole canvas down proportionally
and keep the same number of cells, but never deliver less than half the stated
size. Report the exact pixel size of the file.
```

---

## 1. `fire_meteor_telegraph.png` — the warning ring under a falling meteor

```text
Create one pixel-art animation sheet for a top-down 2D game: the warning mark
that burns on the ground where a meteor is about to land. Draw only the mark on
the ground, no meteor and no creatures.

The canvas is 1536 by 1536 pixels, a grid of 768 pixel square cells, two cells
across and two cells down, so there are four cells in total. They read left to
right along the top row and then left to right along the bottom row. Each
drawing is about 520 pixels across and is centred in its cell, which leaves
about 120 pixels of plain magenta between the drawing and every cell edge.

The mark is a flat circular ring of ember orange, hex #FF8A65, seen from
straight above, as if scorched into the dirt: a bright rim about twelve pixels
thick, a darker charred interior, and a few glowing cracks running inward.

The four drawings are one pulse that repeats. First the ring glows faintly and
the cracks are dull. Second the ring is brighter and the cracks glow orange.
Third the ring is at its brightest, with small embers lifting off the rim.
Fourth the ring has dimmed back toward the first drawing so the loop is smooth.
The ring keeps the same diameter and the same centre in all four cells.
```

## 2. `fire_meteor_body.png` — the meteor itself, falling

```text
Create one pixel-art animation sheet for a top-down 2D game: a burning meteor
seen from above as it falls toward the ground. Draw only the meteor, no ground,
no target mark and no creatures.

The canvas is 2048 by 512 pixels, a grid of 512 pixel square cells, four cells
across and one cell down. They read left to right. Each drawing is about 300
pixels across and is centred in its cell, which leaves about 100 pixels of
plain magenta between the drawing and every cell edge.

The meteor is a jagged dark rock, charcoal grey with molten orange seams,
wrapped in flame. Because it is seen from above while it falls toward the
viewer, its flame trail streams away from the rock toward the top of the cell
and the rock sits slightly below the centre of the cell.

The four drawings are one loop of the same falling meteor, at the same size and
the same position in every cell: the flame licks shift, the molten seams
brighten and dim, and a few embers peel off the trail in different places.
The rock itself does not rotate and does not change size.
```

## 3. `fire_column_body.png` — the travelling column of fire

```text
Create one pixel-art animation sheet for a top-down 2D game: a roaring column
of fire that slides across the ground. Draw only the fire, no ground texture and
no creatures.

The canvas is 2048 by 512 pixels, a grid of 512 pixel square cells, four cells
across and one cell down. They read left to right. Each drawing is about 320
pixels across and is centred in its cell, which leaves about 96 pixels of plain
magenta between the drawing and every cell edge.

The column is a standing pillar of flame seen from the three-quarter camera:
a white-hot core, a body of deep orange, hex #FF6D00, darkening to crimson at
the outer licks, and a ring of embers and soot around its base. It is taller
than it is wide, about 320 pixels tall and about 190 pixels wide.

The four drawings are one loop of the same column burning in place, at the same
size and the same base position in every cell: the licks rise and curl in
different shapes, the core pulses brighter and dimmer, and embers lift from the
base at different points. The column never leans over or moves off its base.
```

## 4. `fire_column_impact.png` — what the column does to what it touches

```text
Create one pixel-art animation sheet for a top-down 2D game: the burst of fire
that marks the moment the fire column burns a creature. Draw only the fire, no
creature and no ground.

The canvas is 2048 by 512 pixels, a grid of 512 pixel square cells, four cells
across and one cell down. They read left to right. Each drawing is centred in
its cell and none is wider than 320 pixels, which leaves at least 96 pixels of
plain magenta between the drawing and every cell edge.

The colours are white-hot at the centre, orange, hex #FF6D00, through the body
and dark crimson at the edges.

The four drawings play once, in this order. First a small hard flash of
white-hot fire about 120 pixels across. Second it blooms into a rough ball of
flame about 300 pixels across with ragged edges. Third the ball breaks into
eight to ten separate embers thrown outward with short soot trails behind them.
Fourth the embers are smaller, further out and dimmer, with thin smoke between
them. The fourth drawing is faint but still clearly visible; it never fades to
nothing. All four drawings share the same centre point.
```

## 5. `fire_dragon_body.png` — the homing fire dragon

```text
Create one pixel-art animation sheet for a top-down 2D game: a small dragon made
of fire that flies at its target. Draw only the dragon, no ground and no
creatures.

The canvas is 2048 by 512 pixels, a grid of 512 pixel square cells, four cells
across and one cell down. They read left to right. Each drawing is about 300
pixels long and is centred in its cell, which leaves about 100 pixels of plain
magenta between the drawing and every cell edge.

The dragon is seen from above, flying toward the right edge of the cell: a
serpentine body of living flame with a blunt horned head at the front, two
short swept wings, and a tail that thins into embers behind it. The head and
body are orange, hex #FF6D00, with a white-hot mouth and dark crimson edges.
Every drawing faces right; do not mirror or copy a drawing.

The four drawings are one loop of the same dragon in flight, its head at the
same point in every cell: the wings beat down and up across the four drawings,
the body undulates slightly, and the tail embers scatter differently each time.
The dragon does not change size and never turns.
```

## 6. `ice_arrow_body.png` — the ice arrow in flight

```text
Create one pixel-art animation sheet for a top-down 2D game: a sharp arrow of
ice in flight. Draw only the arrow, no ground and no creatures.

The canvas is 1024 by 256 pixels, a grid of 256 pixel square cells, four cells
across and one cell down. They read left to right. Each drawing is about 150
pixels long and about 60 pixels tall, centred in its cell, which leaves at
least 50 pixels of plain magenta between the drawing and every cell edge.

The arrow is a tapered icicle pointing at the right edge of the cell: a white
core, pale blue faces, hex #80D8FF, a darker cyan underside, hex #40C4FF, and a
few chipped facets along its length. Every drawing points right.

The four drawings are one loop of the same arrow flying, its tip at the same
point in every cell: small frost motes and a short vapour wisp trail behind the
tail and shift from drawing to drawing, and the white core glints in a
different facet each time. The arrow does not change size or angle.
```

## 7. `ice_arrow_impact.png` — the arrow landing

```text
Create one pixel-art animation sheet for a top-down 2D game: the small burst of
frost where an ice arrow strikes. Draw only the frost, no creature and no arrow.

The canvas is 1024 by 256 pixels, a grid of 256 pixel square cells, four cells
across and one cell down. They read left to right. Each drawing is centred in
its cell and none is wider than 150 pixels, which leaves at least 50 pixels of
plain magenta between the drawing and every cell edge.

The colours are white at the centre, pale blue, hex #80D8FF, through the body
and deeper cyan, hex #40C4FF, at the tips.

The four drawings play once, in this order. First a small white star of frost
about 50 pixels across. Second it opens into six to eight angular shards
pointing outward, about 140 pixels across. Third the shards are further out,
thinner, with small ice crystals hanging between them. Fourth only three or
four faint crystals are left, still clearly visible and never fully gone. All
four drawings share the same centre point.
```

## 8. `ice_bomb_body.png` — the frost bomb in flight

```text
Create one pixel-art animation sheet for a top-down 2D game: a round frost bomb
tumbling through the air. Draw only the bomb, no ground and no creatures.

The canvas is 1024 by 256 pixels, a grid of 256 pixel square cells, four cells
across and one cell down. They read left to right. Each drawing is about 140
pixels across and is centred in its cell, which leaves about 58 pixels of plain
magenta between the drawing and every cell edge.

The bomb is a rough ball of packed frost: a pale blue body, hex #80D8FF, a
crust of white rime on top, darker cyan hollows, hex #40C4FF, and a few small
icicles hanging off it. A thin curl of cold vapour comes off it.

The four drawings are one spin loop: the bomb turns a quarter turn clockwise in
each drawing, so the rime crust and the icicles travel around it and the fourth
drawing leads back into the first. The centre of the bomb stays at the same
point in every cell and its size does not change.
```

## 9. `ice_shield_body.png` — the ice shield around the player

```text
Create one pixel-art animation sheet for a top-down 2D game: a shield of ice
plates that surrounds the player. Draw only the shield, no player and no ground;
the middle of the shield is hollow so the player would show through it.

The canvas is 1536 by 384 pixels, a grid of 384 pixel square cells, four cells
across and one cell down. They read left to right. Each drawing is about 240
pixels across and is centred in its cell, which leaves about 72 pixels of plain
magenta between the drawing and every cell edge.

The shield is a ring of six overlapping plates of pale ice, hex #B3E5FC, with
white highlights along their upper edges and thin cyan seams between them, hex
#40C4FF. The ring is drawn as a slightly squashed circle because of the
three-quarter camera: about 240 pixels wide and about 180 pixels tall. Its
centre is empty magenta, about 120 pixels across.

The four drawings are one loop: the plates rotate a little clockwise in each
drawing and the highlights travel around the ring with them, and small frost
motes drift near the plates in different places. The ring keeps the same centre
and the same size in all four cells.
```

## 10. `ice_shield_break.png` — the shield shattering

```text
Create one pixel-art animation sheet for a top-down 2D game: the ice shield
breaking apart. Draw only the ice, no player and no ground.

The canvas is 2048 by 512 pixels, a grid of 512 pixel square cells, four cells
across and one cell down. They read left to right. Each drawing is centred in
its cell and none is wider than 360 pixels, which leaves at least 76 pixels of
plain magenta between the drawing and every cell edge.

The ice is pale, hex #B3E5FC, with white break faces and deeper cyan shadows,
hex #40C4FF.

The four drawings play once, in this order. First the same ring of six ice
plates as the shield sheet, about 240 pixels across, with white cracks flashing
across every plate. Second the plates split apart along those cracks, the ring
now broken and about 290 pixels across. Third twelve to sixteen shards fly
outward, about 360 pixels across, with a burst of frost mist between them.
Fourth the shards are near the outer edge of that spread, smaller and thinner,
with a haze of frost between them; still clearly visible and never fully gone.
All four drawings share the same centre point.
```

## 11. `ice_blizzard_area.png` — the blizzard on the ground

```text
Create one pixel-art animation sheet for a top-down 2D game: a circular patch of
blizzard lying on the ground, seen from straight above. Draw only the blizzard,
no ground texture and no creatures.

The canvas is 1536 by 1536 pixels, a grid of 768 pixel square cells, two cells
across and two cells down, so there are four cells in total. They read left to
right along the top row and then left to right along the bottom row. Each
drawing is about 520 pixels across and is centred in its cell, which leaves
about 120 pixels of plain magenta between the drawing and every cell edge.

The patch is a disc of driving snow and frost: a rim of angular ice crystals
about twenty pixels thick in pale blue, hex #80D8FF, curved bands of white snow
sweeping around the inside, and a thinner, paler middle so a creature standing
in the patch would still read clearly through it.

The four drawings are one loop: the snow bands sweep a quarter turn clockwise
in each drawing, the rim crystals glitter in different places, and loose flakes
drift across the disc. The disc keeps the same diameter and the same centre in
all four cells.
```

## 12. `lightning_tornado.png` — the drifting vortex

```text
Create one pixel-art animation sheet for a top-down 2D game: a crackling tornado
that drifts across the battlefield. Draw only the tornado, no ground and no
creatures.

The canvas is 1536 by 1536 pixels, a grid of 768 pixel square cells, two cells
across and two cells down, so there are four cells in total. They read left to
right along the top row and then left to right along the bottom row. Each
drawing is about 520 pixels tall and about 420 pixels wide, centred in its cell,
which leaves at least 120 pixels of plain magenta between the drawing and every
cell edge.

The tornado is a funnel seen from the three-quarter camera: wide at the top,
narrow where it meets the ground, built from stacked bands of charcoal grey wind
with pale yellow lightning arcs, hex #FFEE58, running through them, and a
scatter of grit and sparks orbiting the base.

The four drawings are one loop of the same funnel, its base at the same point in
every cell: the wind bands rotate, the lightning arcs jump to different places
in the funnel, and the grit orbits round. The funnel keeps the same height and
width and never leans over.
```

## 13. `lightning_sword.png` — the orbiting blade

```text
Create one pixel-art animation sheet for a top-down 2D game: a lightning blade
that circles the player. Draw only the blade, no player and no ground.

The canvas is 1536 by 256 pixels, a grid of 256 pixel square cells, six cells
across and one cell down. They read left to right. Each drawing is about 150
pixels long and is centred in its cell, which leaves at least 50 pixels of plain
magenta between the drawing and every cell edge.

The blade is a short straight sword seen from above: a charcoal hilt with a
small crossguard, and a blade of hard-edged pale yellow lightning, hex #FFEE58,
with a white core and small arcs jumping off the edges.

The six drawings are one spin loop: the sword rotates sixty degrees clockwise
in each drawing, turning about the middle of the blade, so the sixth drawing
leads back into the first. The middle of the blade stays at exactly the same
point in every cell and the sword does not change size. The arcs jumping off
the edges land in different places in each drawing.
```

## 14. `earth_spike.png` — the spike erupting

```text
Create one pixel-art animation sheet for a top-down 2D game: a stone spike
erupting out of the ground. Draw only the spike, the broken dirt at its base and
the dust it throws; no creatures.

The canvas is 2560 by 512 pixels, a grid of 512 pixel square cells, five cells
across and one cell down. They read left to right. Each drawing is centred in
its cell and none is wider than 300 pixels or taller than 320 pixels, which
leaves at least 96 pixels of plain magenta between the drawing and every cell
edge.

The spike is rough grey-brown rock, hex #8D6E63, with darker cracks, lighter
chipped faces catching the top-left light, and earthy brown clods and dust
around its base.

The five drawings play once, in this order. First the ground cracks and bulges:
a low mound of broken dirt about 160 pixels wide and 40 pixels tall. Second the
tip of the spike breaks through, about 90 pixels tall, with clods thrown out to
the sides. Third the spike is halfway out, about 190 pixels tall, leaning very
slightly, with a ring of dust around its base. Fourth the spike is at full
height, about 300 pixels tall, sharp and clean, the dust starting to settle.
Fifth the spike is cracked across and sinking a little, with thin dust drifting
off it; still clearly visible and never fading to nothing. The base of the spike
sits at the same point in every cell, a little below the middle.
```

## 15. `earth_shield_stone.png` — one orbiting stone

```text
Create one pixel-art animation sheet for a top-down 2D game: a single stone
plate that circles the player. Draw only the stone, no player and no ground.

The canvas is 1024 by 256 pixels, a grid of 256 pixel square cells, four cells
across and one cell down. They read left to right. Each drawing is about 130
pixels across and is centred in its cell, which leaves about 63 pixels of plain
magenta between the drawing and every cell edge.

The stone is a chunky angular slab of grey-brown rock, hex #8D6E63, seen from
above: darker cracks across its face, a lighter chipped edge catching the
top-left light, and a little moss in one hollow.

The four drawings are one spin loop: the slab turns a quarter turn clockwise in
each drawing, so its cracks and moss travel around it and the fourth drawing
leads back into the first. The centre of the slab stays at exactly the same
point in every cell and its size does not change.
```

## 16. `earth_shield_break.png` — the stones breaking

```text
Create one pixel-art animation sheet for a top-down 2D game: the ring of stones
around the player breaking apart. Draw only the stone and dust, no player and no
ground.

The canvas is 2048 by 512 pixels, a grid of 512 pixel square cells, four cells
across and one cell down. They read left to right. Each drawing is centred in
its cell and none is wider than 320 pixels, which leaves at least 96 pixels of
plain magenta between the drawing and every cell edge.

The stone is grey-brown, hex #8D6E63, with pale break faces and brown-grey dust.

The four drawings play once, in this order. First three chunky stone slabs sit
in a ring about 200 pixels across, with white-hot cracks flashing across them.
Second the slabs split into halves, the ring now about 250 pixels across, with
the first puff of dust between them. Third ten to fourteen rock chips fly
outward, about 320 pixels across, through a thick ring of brown-grey dust.
Fourth the chips are near the outer edge of that spread, small and tumbling,
with the dust thinning around them; still clearly visible and never fully gone.
All four drawings share the same centre point.
```

## 17. `earth_quake_area.png` — the earthquake on the ground

```text
Create one pixel-art animation sheet for a top-down 2D game: a circular patch of
shaking broken ground, seen from straight above. Draw only the broken ground, no
ground texture outside the patch and no creatures.

The canvas is 1536 by 1536 pixels, a grid of 768 pixel square cells, two cells
across and two cells down, so there are four cells in total. They read left to
right along the top row and then left to right along the bottom row. Each
drawing is about 520 pixels across and is centred in its cell, which leaves
about 120 pixels of plain magenta between the drawing and every cell edge.

The patch is a disc of cracked earth: a rim of upheaved grey-brown rock, hex
#8D6E63, about twenty-five pixels thick, a web of dark cracks running inward
with a dull ember glow deep inside them, and small stones and dust puffs
scattered over the disc. The middle is broken but open enough that a creature
standing in the patch would still read clearly through it.

The four drawings are one loop: the cracks widen and narrow, the ember glow in
them brightens and dims, the loose stones bounce to different positions, and
dust puffs rise in different places. The disc keeps the same diameter and the
same centre in all four cells.
```

## 18. `status_bleed.png` — the bleed overlay

```text
Create one pixel-art animation sheet of a status effect for a top-down 2D game.
This is drawn on top of a creature, so draw only the effect with no creature
underneath it.

The canvas is 640 by 160 pixels, a grid of 160 pixel square cells, four cells
across and one cell down. They read left to right. Each drawing covers an
invisible creature about 80 pixels wide and about 60 pixels tall in the middle
of its cell, which leaves at least 40 pixels of plain magenta between the
drawing and every cell edge.

The effect is bleeding: four or five deep crimson droplets, hex #B71C1C, with
darker cores and a small bright highlight on each, plus a short spatter of fine
red specks low in the area the creature would occupy.

The four drawings are one loop: the droplets fall a little further in each
drawing, the lowest one breaking into specks as it lands, and a new droplet
forms at the top, so the fourth drawing leads back into the first. The droplets
sit over the creature's area and never spread beyond it.
```

## 19. `status_stagger.png` — the stagger overlay

```text
Create one pixel-art animation sheet of a status effect for a top-down 2D game.
This is drawn on top of a creature, so draw only the effect with no creature
underneath it.

The canvas is 640 by 160 pixels, a grid of 160 pixel square cells, four cells
across and one cell down. They read left to right. Each drawing covers an
invisible creature about 80 pixels wide and about 60 pixels tall in the middle
of its cell, which leaves at least 40 pixels of plain magenta between the
drawing and every cell edge.

The effect is a brief interrupt: three short pale yellow spark marks, hex
#FFF59D, arranged around the top of the area the creature would occupy, each a
hard-edged jagged tick with a white core, plus two small wobble arcs at the
sides suggesting the creature being rocked.

The four drawings are one loop: the sparks flick in and out in turn and the
wobble arcs swap from the left side to the right side and back, so the fourth
drawing leads back into the first. The marks sit over the creature's area and
never spread beyond it.
```

---

## Before a sheet is accepted

Measured against the pixels, not against this document — every sheet delivered
for tickets #53–#62 diverged from its prompt, and none of it was caught at
acceptance time (#102, #103, #106, #107 are all that cost).

1. **Read the real pixel size** and divide it by the stated columns and rows.
   The cell size is whatever that division gives; never assume the number above.
2. **Count the frames in each row.** More frames than asked for is the common
   failure; the manifest and `animations.ts` have to agree with the sheet, so a
   drifted count is a redo or a manifest change, decided per sheet.
3. **Check every cell's margin.** Art touching or crossing a cell edge fails the
   cutter, and `allowEdge` is not a fix here — nothing in this ticket is meant
   to run off its cell.
4. **Check for drawn grid lines**, ruled borders and any text. Any text at all
   is an automatic redo.
5. **Check the last frame of every `once` animation** actually has pixels in it;
   an empty cell fails the cutter.

## After a sheet is accepted

Per sheet: manifest entry in `docs/art/sheets/manifest.json` (`sheetCell` is the
authored cell from the table above; the cutter's native frame is a quarter of
it, whatever size the file actually arrives at), `npm run art:cut`, an
`animations.ts` spec whose frame count equals the manifest's, then
`?debug=textures`.

The three ground areas and the meteor telegraph are drawn radiating from the
cell centre, so their manifest rows get `centred: true`, the way `ice.nova`
does.

**Atlas budget.** The atlas is one 2048 × 2048 PNG under 400 KB
(`scripts/cut-sheets.mjs:207,248`), currently 192.8 KB for 216 frames, which is
about 0.33 bytes per native pixel. The nineteen sheets above come to roughly
500k native pixels, about 165 KB, landing the atlas near 360 KB — under the cap
but with little room left. The companion sheets in #146 will not fit after
that, so a second atlas page is a #146 problem, not this ticket's, provided
nothing here is authored larger than the table says.
