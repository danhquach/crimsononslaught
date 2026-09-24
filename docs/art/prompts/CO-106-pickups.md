# CO-106 Art: floor pickups

Tickets: [#128](https://github.com/danhquach/crimsononslaught/issues/128) (consumables) · [#195](https://github.com/danhquach/crimsononslaught/issues/195) (Embers, relics) · Spec: `docs/superpowers/specs/2026-09-23-twenty-minute-run-design.md` §3–§5

Six sheets, one per floor pickup other than the gem: the four consumables — the
health flask, the magnet, the bomb and the chest — then the Ember and the relic.
**One sheet per run**, so a bad one is redone on its own.

They replace the placeholder shapes `src/config/colors.ts` draws today — a pink
square, a blue ring, a violet disc, an amber block, a small amber triangle and a
large gold ring. Each sheet keeps its
placeholder's colour as the object's main colour, so what a player learned
from the placeholder carries over.

## How to run this

**Copy the whole `text` block under a sheet's heading and paste it as the
prompt.** Each block is complete on its own: subject, grid, object, palette,
frames, style, delivery. The shared rules are repeated in all six, word for
word.

Two things outside the block, same for every sheet:

- Attach `docs/art/sheets/CO-075/gem.jpg` as the style reference. It is the one
  other thing that lies on the floor to be picked up, so it fixes the camera,
  the pixel density and the scale a floor pickup is drawn at. Only its
  treatment carries over — none of these is a crystal.
- Negative-prompt field, if the tool has one:

  ```text
  text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, background colour, white background, grid lines, cell borders, panels, drop shadow, blur, gradient, feathered edges, halo, coloured fringe, speckles, jpeg artifacts
  ```

## Background: transparent, not keyed

Every sheet is a PNG with a real alpha channel, alpha 0 or 255 and nothing
between, as the CO-124 sheets are. `isPreKeyed` in `scripts/lib/spriteCut.mjs`
routes an alpha sheet through `alphaCell`, with no key colour to sample. The
blocks carry every rule CO-124's two rounds of deliveries added: binary alpha,
no chequerboard or ruled grid drawn into the pixels, nothing crossing into a
neighbouring cell, never JPEG.

## Where the finished sheets go

```
docs/art/sheets/CO-106/<filename>.png
```

Folder does not exist yet; create it with the first sheet. Filenames exactly as
the table gives them: the texture keys are `pickup_health`, `pickup_magnet`,
`pickup_bomb`, `pickup_chest`, `pickup_ember` and `pickup_relic`, and the
filenames match them.

Drop them in as they land, in any order. Tell me which arrived and I will
measure them, add manifest entries and run `npm run art:cut`.

## Reading on a crowded floor

The acceptance criterion art alone decides: a pickup is readable at the enemy
cap, over 300 monsters, and none of the six is mistaken for a gem, a monster or
another pickup. In every block:

- **Never a gem.** Gems are mint-green `#69F0AE` faceted diamonds. No crystal,
  no diamond outline, no mint green.
- **Never the monster colours**: swarm `#FF5252`, runner `#FFB300`, brute
  `#8E1B1B`, boss `#9C27B0`.
- **One main colour each, from its placeholder**: health `#F50057`, magnet
  `#448AFF`, bomb `#D500F9`, chest `#FFC400`, Ember `#FFAB40`, relic `#FFD740`.
  Each is the largest area of colour on its object.
- **One silhouette each**, distinct at 14–36 px: a round flask, an open U, a
  ball with a fuse, a box wider than tall, a small flame point, and a large
  open ring. The chest is kept a box, never a ring or a coin, so it cannot pass
  for the relic, and the Ember is the smallest thing there.
- **Sizes carry meaning.** Embers lie in dozens, so they are the smallest and
  simplest. The relic is the largest pickup on the floor, because the player
  crosses the arena for it; it never drifts, so its idle is its whole life.
- **No symbols or writing.** The health flask carries no cross — a red cross is
  a protected emblem — and no heart or label.

## What came back

All six arrived together (2026-09-23) and all six were cut. Measured with the
cutter's own `gridSplit`, `alphaCell` and `opaqueBounds`:

- **Right grid, wrong size.** Every sheet is a 4 × 2 PNG with a real alpha
  channel, but at 1774 × 887 rather than 1024 × 512, so a cell is 443.5 px.
  Harmless: `gridSplit` rounds each boundary.
- **Near-binary alpha, not binary.** The drawing sits at alpha 224–254 and a
  faint haze under 32 surrounds it; almost no pixel is exactly 255.
  `alphaThreshold` 128 hardens it cleanly. The Ember needs 240: a pale glow
  egg sits round each flame up to alpha 239, and below 240 it cuts as a cream
  fringe. At 240 the Ember's last burst cell, faint sparks, is gone, so its
  `pickup` clip is three frames.
- **Two idles slid sideways.** The chest and the Ember were drawn on a ~424 px
  pitch, not 443.5, so their idle drifted up to 32 px across the row. Rescued by
  moving each column's pixels by one amount taken from row 1 (chest −22 −3 +8
  +33, Ember −28 −6 +17 +29), which keeps the rows aligned with each other.
- **Art smaller than asked.** Row 1 fills 50–60% of its cell rather than 59%
  of the 256 px plan, so `sheetCell` in the table below is set from the
  measured art, not from the plan, to land each object at its placeholder's
  size.
- **Margins held.** No cell overruns, the smallest margin is 22 px (the open
  chest's rising sparks), and every sheet's corners are empty: no watermark.
  The bomb's runes are angular marks that echo an X and a Y at sheet size;
  at 14 px in game they are a few violet pixels.

Two art calls are left open. The bomb is a charcoal ball on a near-black
floor, so at the enemy cap only its violet fuse and runes show. The Ember reads
close to the Fire kit's own flames and burn overlay.

## Sizes

| # | File | Object | Grid | Canvas | cell | art ≤ | In game | `sheetCell` |
|---|---|---|---|---|---|---|---|---|
| 1 | `pickup_health.png` | health flask | 4 × 2 | 1024 × 512 | 256 | 150 | 14 px | 112 |
| 2 | `pickup_magnet.png` | magnet | 4 × 2 | 1024 × 512 | 256 | 150 | 20 px | 164 |
| 3 | `pickup_bomb.png` | bomb | 4 × 2 | 1024 × 512 | 256 | 150 | 14 px | 132 |
| 4 | `pickup_chest.png` | treasure chest | 4 × 2 | 1024 × 512 | 256 | 150 | 20 px | 160 |
| 5 | `pickup_ember.png` | Ember | 4 × 2 | 1024 × 512 | 256 | 150 | 14 px | 240 |
| 6 | `pickup_relic.png` | relic | 4 × 2 | 1024 × 512 | 256 | 150 | 36 px | 252 |

Every cell holds a frame — no blanks anywhere, on purpose: "leave this one
empty" is what made an earlier model write the word *empty* into the picture.

`cell` is the authored cell, chosen for drawing quality; it is not the frame
size. `sheetCell` in the last column is the value in the manifest, set from the
art as delivered (above), and lands each object at its placeholder's size in
game (`nativeCell` is
`sheetCell` / 4). `installAtlas` builds each texture at its frame's size, so
the clip must match the placeholder the pickup's body was sized against. The
cutter divides the delivered image by `cols × rows` and never reads the authored
cell size, so a proportionally smaller delivery is fine as long as the grid is
still 4 × 2.

## What the engine does with them

| Row | Animation | Plays |
|---|---|---|
| 1 | `idle`, cols 1–4 | loop, while the pickup lies on the floor or drifts in (a relic never drifts) |
| 2 | `pickup`, cols 1–4 | once, where it was taken |

Wired with #128: manifest entries on atlas page 6 (`props6`), the clips in
`src/config/animations.ts`, each key's first idle frame in `STATIC_FRAMES`, and
`entities/Pickup.ts` playing `idle` on the floor and `pickup` once taken, as
the gem does.

---

## 1. `pickup_health.png` — health flask

Save as `docs/art/sheets/CO-106/pickup_health.png`. Copy the whole block below; it is the complete prompt.

```text
Pixel-art animation sheet for a top-down 2D game: a small healing flask lying on the ground, waiting for the player to walk over it, then being picked up. Draw only this object — no player, no people, no monsters, no ground.

Canvas 1024x512: a grid of 256px square cells, 4 across and 2 down, 8 in all, read left to right, top row first. The object is about 150px along its longest side, centred in its cell.

Object: a small round glass flask with a short neck and a dark cork stopper, about as wide as it is tall. It is filled with glowing rose-red liquid, #F50057, lighter at the centre where the light catches it, and a thin white highlight curves across the glass on the top-left. A few pale bubbles hang in the liquid. No cross, heart symbol, label or writing anywhere on it.

It lies on a dark arena floor among hundreds of monsters and must read as a pickup at a glance, and as this pickup and no other. It is not a gem: no faceted crystal, no diamond shape, and never mint green #69F0AE. It never uses the monster colours #FF5252, #FFB300, #8E1B1B or #9C27B0. Rose-red and pale glass are its only colours; it is the only round flask on the floor, rounder and squatter than anything else there, and never shaped like a cross.

Row 1, cells 1-4, is an idle loop: the flask bobs gently up and down by a few pixels, the liquid sloshes a little so its surface tilts one way then the other, and one bright glint travels across the glass from left to right. Cell 4 leads back into cell 1.

Row 2, cells 1-4, is the pickup, played once: 1, the whole flask flashes near-white; 2, it breaks into five or six small rose-red droplets flying outward from the centre; 3, the droplets are spread wider and smaller; 4, only three or four tiny faint droplets remain near where the flask was.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from top-left; grim fantasy colour on the subject only; original design; match the attached reference.
Background: transparent, as a real alpha channel — alpha 0 everywhere the object is not, alpha 255 everywhere it is, nothing in between. Do not paint a background: no colour, white, magenta, grey, panel or vignette, and above all no chequered pattern — the grey-and-white chequerboard is how an editor displays emptiness, and drawn into the pixels it is simply art, which throws the sheet away. A format that cannot carry alpha is already the wrong format. Outside the object's own outline there are no pixels at all: no shadow, no vignette, no halo or coloured fringe along its edge, no soft or feathered edge, and no stray specks, dust or drifting colour anywhere in the empty space.
Size, measured on the delivered file, and the rule most often broken: the object fits inside a box 150 pixels square at the centre of its 256 pixel cell, which leaves 53 pixels of empty space between that box and every cell edge. Nothing of it reaches outside that box — not a spark, a glint, a flame, a burst fragment, and not the glow around it. If a frame will not fit, draw the whole object smaller; never let it grow to fill the cell. Drawn any bigger it runs into the neighbouring cells, and the sheet cannot be cut.
Cells are a measurement, not something to draw. Nothing whatever marks where one cell ends and the next begins: no line, border, divider, frame, panel, tile, box or square of colour, and no change of tone between a cell and its neighbour. A ruled grid drawn over the sheet is as fatal as a painted background; the grid exists only so a script can cut the frames at fixed positions. No text anywhere either — one letter, number, label or watermark ruins the sheet.
Every drawing belongs to one cell and stays inside it at the margin above, never touching an edge; draw it smaller rather than spill, the margin is measured on the delivered file. Nothing crosses into a neighbouring cell — not a spark, a fragment, and not the glow around the object, which counts as part of the drawing. The object's centre holds the same spot in every cell of a row so the animation does not slide. Every cell holds a full drawing, and the object is drawn at one size across the whole of row 1.
Deliver one lossless PNG carrying a real alpha channel — an actual PNG file, not a JPEG renamed to .png, and never JPEG in any form: it cannot hold alpha and it leaves a halo on every hard edge. Deliver it at exactly the canvas size above; if it must be smaller, scale the whole canvas down proportionally and keep the same number of cells, never below half, never larger, and never a different shape. Report the exact pixel size.
```

## 2. `pickup_magnet.png` — magnet

Save as `docs/art/sheets/CO-106/pickup_magnet.png`. Copy the whole block below; it is the complete prompt.

```text
Pixel-art animation sheet for a top-down 2D game: a small horseshoe magnet lying on the ground, waiting for the player to walk over it, then being picked up. Draw only this object — no player, no people, no monsters, no ground.

Canvas 1024x512: a grid of 256px square cells, 4 across and 2 down, 8 in all, read left to right, top row first. The object is about 150px along its longest side, centred in its cell.

Object: a chunky horseshoe magnet, the curve at the top and the two arms pointing down, about as wide as it is tall. Its body is bright blue enamel, #448AFF, with a darker blue edge on the shadow side, and its two flat tips are bare polished silver. Two or three short curved arcs of pale blue force float just below the tips, close to the metal.

It lies on a dark arena floor among hundreds of monsters and must read as a pickup at a glance, and as this pickup and no other. It is not a gem: no faceted crystal, no diamond shape, and never mint green #69F0AE. It never uses the monster colours #FF5252, #FFB300, #8E1B1B or #9C27B0. Blue and silver are its only colours; the open U shape is its whole silhouette and must survive at 20 pixels, so the gap between the arms stays clearly open.

Row 1, cells 1-4, is an idle loop: the magnet bobs gently up and down by a few pixels and the arcs of force below its tips pulse — small, larger, largest, smaller — while one glint travels across the blue enamel. Cell 4 leads back into cell 1.

Row 2, cells 1-4, is the pickup, played once: 1, the whole magnet flashes near-white; 2, a thin blue ring of force expands around it as the magnet itself shrinks; 3, the ring is wider and fainter and the magnet is a small blue spark; 4, only a faint thin blue ring remains at the edge of the drawing box.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from top-left; grim fantasy colour on the subject only; original design; match the attached reference.
Background: transparent, as a real alpha channel — alpha 0 everywhere the object is not, alpha 255 everywhere it is, nothing in between. Do not paint a background: no colour, white, magenta, grey, panel or vignette, and above all no chequered pattern — the grey-and-white chequerboard is how an editor displays emptiness, and drawn into the pixels it is simply art, which throws the sheet away. A format that cannot carry alpha is already the wrong format. Outside the object's own outline there are no pixels at all: no shadow, no vignette, no halo or coloured fringe along its edge, no soft or feathered edge, and no stray specks, dust or drifting colour anywhere in the empty space.
Size, measured on the delivered file, and the rule most often broken: the object fits inside a box 150 pixels square at the centre of its 256 pixel cell, which leaves 53 pixels of empty space between that box and every cell edge. Nothing of it reaches outside that box — not a spark, a glint, a flame, a burst fragment, and not the glow around it. If a frame will not fit, draw the whole object smaller; never let it grow to fill the cell. Drawn any bigger it runs into the neighbouring cells, and the sheet cannot be cut.
Cells are a measurement, not something to draw. Nothing whatever marks where one cell ends and the next begins: no line, border, divider, frame, panel, tile, box or square of colour, and no change of tone between a cell and its neighbour. A ruled grid drawn over the sheet is as fatal as a painted background; the grid exists only so a script can cut the frames at fixed positions. No text anywhere either — one letter, number, label or watermark ruins the sheet.
Every drawing belongs to one cell and stays inside it at the margin above, never touching an edge; draw it smaller rather than spill, the margin is measured on the delivered file. Nothing crosses into a neighbouring cell — not a spark, a fragment, and not the glow around the object, which counts as part of the drawing. The object's centre holds the same spot in every cell of a row so the animation does not slide. Every cell holds a full drawing, and the object is drawn at one size across the whole of row 1.
Deliver one lossless PNG carrying a real alpha channel — an actual PNG file, not a JPEG renamed to .png, and never JPEG in any form: it cannot hold alpha and it leaves a halo on every hard edge. Deliver it at exactly the canvas size above; if it must be smaller, scale the whole canvas down proportionally and keep the same number of cells, never below half, never larger, and never a different shape. Report the exact pixel size.
```

## 3. `pickup_bomb.png` — bomb

Save as `docs/art/sheets/CO-106/pickup_bomb.png`. Copy the whole block below; it is the complete prompt.

```text
Pixel-art animation sheet for a top-down 2D game: a small round bomb with a lit fuse lying on the ground, waiting for the player to walk over it, then being picked up. Draw only this object — no player, no people, no monsters, no ground.

Canvas 1024x512: a grid of 256px square cells, 4 across and 2 down, 8 in all, read left to right, top row first. The object is about 150px along its longest side, centred in its cell.

Object: a round black-iron bomb, a ball a little wider than tall, with a short iron collar on top and a curled fuse rising from it. Glowing violet runes, #D500F9, are etched in a ring around its middle, and the tip of the fuse burns with a small bright violet-white spark. The iron is charcoal with a cool grey highlight on the top-left.

It lies on a dark arena floor among hundreds of monsters and must read as a pickup at a glance, and as this pickup and no other. It is not a gem: no faceted crystal, no diamond shape, and never mint green #69F0AE. It never uses the monster colours #FF5252, #FFB300, #8E1B1B or #9C27B0. Charcoal iron with violet runes and a violet spark are its only colours; it is the only dark round object on the floor with a lit fuse.

Row 1, cells 1-4, is an idle loop: the bomb sits still, the fuse spark flickers through four different small shapes, and the runes brighten and dim once across the loop. It does not bob. Cell 4 leads back into cell 1.

Row 2, cells 1-4, is the pickup, played once: 1, the whole bomb flashes near-white; 2, it shrinks to a bright violet core with four short rays; 3, the rays are longer and thinner and the core is small; 4, only a few faint violet sparks remain near the centre. This is the pickup being taken, not the screen-wide blast, which the game draws separately.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from top-left; grim fantasy colour on the subject only; original design; match the attached reference.
Background: transparent, as a real alpha channel — alpha 0 everywhere the object is not, alpha 255 everywhere it is, nothing in between. Do not paint a background: no colour, white, magenta, grey, panel or vignette, and above all no chequered pattern — the grey-and-white chequerboard is how an editor displays emptiness, and drawn into the pixels it is simply art, which throws the sheet away. A format that cannot carry alpha is already the wrong format. Outside the object's own outline there are no pixels at all: no shadow, no vignette, no halo or coloured fringe along its edge, no soft or feathered edge, and no stray specks, dust or drifting colour anywhere in the empty space.
Size, measured on the delivered file, and the rule most often broken: the object fits inside a box 150 pixels square at the centre of its 256 pixel cell, which leaves 53 pixels of empty space between that box and every cell edge. Nothing of it reaches outside that box — not a spark, a glint, a flame, a burst fragment, and not the glow around it. If a frame will not fit, draw the whole object smaller; never let it grow to fill the cell. Drawn any bigger it runs into the neighbouring cells, and the sheet cannot be cut.
Cells are a measurement, not something to draw. Nothing whatever marks where one cell ends and the next begins: no line, border, divider, frame, panel, tile, box or square of colour, and no change of tone between a cell and its neighbour. A ruled grid drawn over the sheet is as fatal as a painted background; the grid exists only so a script can cut the frames at fixed positions. No text anywhere either — one letter, number, label or watermark ruins the sheet.
Every drawing belongs to one cell and stays inside it at the margin above, never touching an edge; draw it smaller rather than spill, the margin is measured on the delivered file. Nothing crosses into a neighbouring cell — not a spark, a fragment, and not the glow around the object, which counts as part of the drawing. The object's centre holds the same spot in every cell of a row so the animation does not slide. Every cell holds a full drawing, and the object is drawn at one size across the whole of row 1.
Deliver one lossless PNG carrying a real alpha channel — an actual PNG file, not a JPEG renamed to .png, and never JPEG in any form: it cannot hold alpha and it leaves a halo on every hard edge. Deliver it at exactly the canvas size above; if it must be smaller, scale the whole canvas down proportionally and keep the same number of cells, never below half, never larger, and never a different shape. Report the exact pixel size.
```

## 4. `pickup_chest.png` — treasure chest

Save as `docs/art/sheets/CO-106/pickup_chest.png`. Copy the whole block below; it is the complete prompt.

```text
Pixel-art animation sheet for a top-down 2D game: a small treasure chest lying on the ground, waiting for the player to walk over it, then being picked up. Draw only this object — no player, no people, no monsters, no ground.

Canvas 1024x512: a grid of 256px square cells, 4 across and 2 down, 8 in all, read left to right, top row first. The object is about 150px along its longest side, centred in its cell.

Object: a small wooden treasure chest, wider than it is tall, with a rounded lid. The wood is dark walnut, #4E342E, with visible planks, and it is bound by two bright amber-gold metal bands, #FFC400, with a round amber-gold clasp at the front. A thin line of warm amber light glows along the seam under the lid.

It lies on a dark arena floor among hundreds of monsters and must read as a pickup at a glance, and as this pickup and no other. It is not a gem: no faceted crystal, no diamond shape, and never mint green #69F0AE. It never uses the monster colours #FF5252, #FFB300, #8E1B1B or #9C27B0. Dark wood and amber-gold are its only colours; it is the only box shape on the floor, wider than tall, and never a ring or a coin.

Row 1, cells 1-4, is an idle loop: the chest sits still, the light along the lid seam brightens and dims once across the loop, and one glint travels along the front band from left to right. It does not bob. Cell 4 leads back into cell 1.

Row 2, cells 1-4, is the pickup, played once: 1, the lid lifts open a little and warm amber light pours up from inside; 2, the lid is fully open and five or six small amber-gold sparks rise out of it; 3, the chest flashes near-white and the sparks are higher and smaller; 4, only three or four faint amber sparks remain above where the chest was.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from top-left; grim fantasy colour on the subject only; original design; match the attached reference.
Background: transparent, as a real alpha channel — alpha 0 everywhere the object is not, alpha 255 everywhere it is, nothing in between. Do not paint a background: no colour, white, magenta, grey, panel or vignette, and above all no chequered pattern — the grey-and-white chequerboard is how an editor displays emptiness, and drawn into the pixels it is simply art, which throws the sheet away. A format that cannot carry alpha is already the wrong format. Outside the object's own outline there are no pixels at all: no shadow, no vignette, no halo or coloured fringe along its edge, no soft or feathered edge, and no stray specks, dust or drifting colour anywhere in the empty space.
Size, measured on the delivered file, and the rule most often broken: the object fits inside a box 150 pixels square at the centre of its 256 pixel cell, which leaves 53 pixels of empty space between that box and every cell edge. Nothing of it reaches outside that box — not a spark, a glint, a flame, a burst fragment, and not the glow around it. If a frame will not fit, draw the whole object smaller; never let it grow to fill the cell. Drawn any bigger it runs into the neighbouring cells, and the sheet cannot be cut.
Cells are a measurement, not something to draw. Nothing whatever marks where one cell ends and the next begins: no line, border, divider, frame, panel, tile, box or square of colour, and no change of tone between a cell and its neighbour. A ruled grid drawn over the sheet is as fatal as a painted background; the grid exists only so a script can cut the frames at fixed positions. No text anywhere either — one letter, number, label or watermark ruins the sheet.
Every drawing belongs to one cell and stays inside it at the margin above, never touching an edge; draw it smaller rather than spill, the margin is measured on the delivered file. Nothing crosses into a neighbouring cell — not a spark, a fragment, and not the glow around the object, which counts as part of the drawing. The object's centre holds the same spot in every cell of a row so the animation does not slide. Every cell holds a full drawing, and the object is drawn at one size across the whole of row 1.
Deliver one lossless PNG carrying a real alpha channel — an actual PNG file, not a JPEG renamed to .png, and never JPEG in any form: it cannot hold alpha and it leaves a halo on every hard edge. Deliver it at exactly the canvas size above; if it must be smaller, scale the whole canvas down proportionally and keep the same number of cells, never below half, never larger, and never a different shape. Report the exact pixel size.
```

## 5. `pickup_ember.png` — Ember

Save as `docs/art/sheets/CO-106/pickup_ember.png`. Copy the whole block below; it is the complete prompt.

```text
Pixel-art animation sheet for a top-down 2D game: a single glowing Ember, the currency a slain monster drops, lying on the ground, waiting for the player to walk over it, then being picked up. Draw only this object — no player, no people, no monsters, no ground.

Canvas 1024x512: a grid of 256px square cells, 4 across and 2 down, 8 in all, read left to right, top row first. The object is about 150px along its longest side, centred in its cell.

Object: one small glowing ember of hot coal, shaped like a teardrop flame standing point up, a little taller than it is wide. Its body is warm amber, #FFAB40, with a bright pale-yellow core low in the middle and a thin darker burnt-orange rim along its lower edge. Two or three tiny sparks float just above its point, close to it.

It lies on a dark arena floor among hundreds of monsters and must read as a pickup at a glance, and as this pickup and no other. It is not a gem: no faceted crystal, no diamond shape, and never mint green #69F0AE. It never uses the monster colours #FF5252, #FFB300, #8E1B1B or #9C27B0. Amber and pale yellow are its only colours; it is the smallest pickup on the floor and the only one shaped like a flame point, and there are often dozens lying together, so it stays simple and small.

Row 1, cells 1-4, is an idle loop: the ember flickers — its point leans a little left, stands straight, leans a little right, stands straight — the core brightens and dims, and the sparks above it drift upward and are replaced. It does not bob. Cell 4 leads back into cell 1.

Row 2, cells 1-4, is the pickup, played once: 1, the whole ember flashes near-white; 2, it breaks into four or five small amber sparks flying upward and outward; 3, the sparks are higher, wider and smaller; 4, only two or three tiny faint sparks remain above where the ember was.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from top-left; grim fantasy colour on the subject only; original design; match the attached reference.
Background: transparent, as a real alpha channel — alpha 0 everywhere the object is not, alpha 255 everywhere it is, nothing in between. Do not paint a background: no colour, white, magenta, grey, panel or vignette, and above all no chequered pattern — the grey-and-white chequerboard is how an editor displays emptiness, and drawn into the pixels it is simply art, which throws the sheet away. A format that cannot carry alpha is already the wrong format. Outside the object's own outline there are no pixels at all: no shadow, no vignette, no halo or coloured fringe along its edge, no soft or feathered edge, and no stray specks, dust or drifting colour anywhere in the empty space.
Size, measured on the delivered file, and the rule most often broken: the object fits inside a box 150 pixels square at the centre of its 256 pixel cell, which leaves 53 pixels of empty space between that box and every cell edge. Nothing of it reaches outside that box — not a spark, a glint, a flame, a burst fragment, and not the glow around it. If a frame will not fit, draw the whole object smaller; never let it grow to fill the cell. Drawn any bigger it runs into the neighbouring cells, and the sheet cannot be cut.
Cells are a measurement, not something to draw. Nothing whatever marks where one cell ends and the next begins: no line, border, divider, frame, panel, tile, box or square of colour, and no change of tone between a cell and its neighbour. A ruled grid drawn over the sheet is as fatal as a painted background; the grid exists only so a script can cut the frames at fixed positions. No text anywhere either — one letter, number, label or watermark ruins the sheet.
Every drawing belongs to one cell and stays inside it at the margin above, never touching an edge; draw it smaller rather than spill, the margin is measured on the delivered file. Nothing crosses into a neighbouring cell — not a spark, a fragment, and not the glow around the object, which counts as part of the drawing. The object's centre holds the same spot in every cell of a row so the animation does not slide. Every cell holds a full drawing, and the object is drawn at one size across the whole of row 1.
Deliver one lossless PNG carrying a real alpha channel — an actual PNG file, not a JPEG renamed to .png, and never JPEG in any form: it cannot hold alpha and it leaves a halo on every hard edge. Deliver it at exactly the canvas size above; if it must be smaller, scale the whole canvas down proportionally and keep the same number of cells, never below half, never larger, and never a different shape. Report the exact pixel size.
```

## 6. `pickup_relic.png` — relic

Save as `docs/art/sheets/CO-106/pickup_relic.png`. Copy the whole block below; it is the complete prompt.

```text
Pixel-art animation sheet for a top-down 2D game: an ancient golden relic lying on the ground, rare and worth crossing the arena for, waiting for the player to walk over it, then being picked up. Draw only this object — no player, no people, no monsters, no ground.

Canvas 1024x512: a grid of 256px square cells, 4 across and 2 down, 8 in all, read left to right, top row first. The object is about 150px along its longest side, centred in its cell.

Object: a large, heavy ring of old gold, #FFD740, lying flat on the ground and seen from above at a slight angle, so it reads as a thick round band with an open centre. Its band is broad and engraved with a ring of simple angular runes, with darker gold in the grooves and a bright highlight along the top-left of the band. A soft pale-gold light hovers in the open centre of the ring.

It lies on a dark arena floor among hundreds of monsters and must read as a pickup at a glance, and as this pickup and no other. It is not a gem: no faceted crystal, no diamond shape, and never mint green #69F0AE. It never uses the monster colours #FF5252, #FFB300, #8E1B1B or #9C27B0. Gold and pale-gold light are its only colours; it is the largest pickup on the floor and the only ring, and the open centre must stay clearly open at 36 pixels so the ring shape survives.

Row 1, cells 1-4, is an idle loop: the ring lies still, the light in its centre swells and fades once across the loop, and a bright glint runs round the band one quarter of the way in each cell, so it has gone all the way round by cell 4. It does not bob. Cell 4 leads back into cell 1.

Row 2, cells 1-4, is the pickup, played once: 1, the whole ring flashes near-white; 2, the ring rises a little and the light in its centre flares; 3, the ring shrinks toward its centre in a burst of six or seven small gold sparks; 4, only a few faint gold sparks remain around where the ring lay.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from top-left; grim fantasy colour on the subject only; original design; match the attached reference.
Background: transparent, as a real alpha channel — alpha 0 everywhere the object is not, alpha 255 everywhere it is, nothing in between. Do not paint a background: no colour, white, magenta, grey, panel or vignette, and above all no chequered pattern — the grey-and-white chequerboard is how an editor displays emptiness, and drawn into the pixels it is simply art, which throws the sheet away. A format that cannot carry alpha is already the wrong format. Outside the object's own outline there are no pixels at all: no shadow, no vignette, no halo or coloured fringe along its edge, no soft or feathered edge, and no stray specks, dust or drifting colour anywhere in the empty space.
Size, measured on the delivered file, and the rule most often broken: the object fits inside a box 150 pixels square at the centre of its 256 pixel cell, which leaves 53 pixels of empty space between that box and every cell edge. Nothing of it reaches outside that box — not a spark, a glint, a flame, a burst fragment, and not the glow around it. If a frame will not fit, draw the whole object smaller; never let it grow to fill the cell. Drawn any bigger it runs into the neighbouring cells, and the sheet cannot be cut.
Cells are a measurement, not something to draw. Nothing whatever marks where one cell ends and the next begins: no line, border, divider, frame, panel, tile, box or square of colour, and no change of tone between a cell and its neighbour. A ruled grid drawn over the sheet is as fatal as a painted background; the grid exists only so a script can cut the frames at fixed positions. No text anywhere either — one letter, number, label or watermark ruins the sheet.
Every drawing belongs to one cell and stays inside it at the margin above, never touching an edge; draw it smaller rather than spill, the margin is measured on the delivered file. Nothing crosses into a neighbouring cell — not a spark, a fragment, and not the glow around the object, which counts as part of the drawing. The object's centre holds the same spot in every cell of a row so the animation does not slide. Every cell holds a full drawing, and the object is drawn at one size across the whole of row 1.
Deliver one lossless PNG carrying a real alpha channel — an actual PNG file, not a JPEG renamed to .png, and never JPEG in any form: it cannot hold alpha and it leaves a halo on every hard edge. Deliver it at exactly the canvas size above; if it must be smaller, scale the whole canvas down proportionally and keep the same number of cells, never below half, never larger, and never a different shape. Report the exact pixel size.
```
