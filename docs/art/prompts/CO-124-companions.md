# CO-124 Art: companion character sheets

Ticket: [#146](https://github.com/danhquach/crimsononslaught/issues/146) · Epic: [#122](https://github.com/danhquach/crimsononslaught/issues/122) · Spec: `docs/superpowers/specs/2026-09-18-phase2-spells.md` §9, §10

Eight sheets: a locomotion and an attack sheet for each of the four companions.
**One sheet per run**, so a bad one is redone on its own.

The four companions are **elemental creatures, not people**: a fire kirin, an
ice serpent, a thunderbird and an earth golem. They are the only things on the
player's side, and everything else that moves is an enemy — so the whole job of
the set is that four beasts do not read as four more monsters. They replace the
single green disc `src/config/colors.ts` draws for all four today — *"Green so
an ally never reads as an enemy at a glance."* The palette contract below
carries that read with drawing instead.

Attack types come from the spec and do not change with the redesign: fire and
ice are ranged allies, lightning and earth are melee (§9 spell tables).

## How to run this

**Copy the whole `text` block under a sheet's heading and paste it as the
prompt.** Each block is complete on its own: subject, grid, creature, palette,
frames, style, delivery. The shared rules are repeated in all eight, word for
word except where a sentence has to name the creature's own anatomy — hooves,
coils, wings, feet.

Two things outside the block, same for every sheet:

- Attach `docs/art/sheets/CO-070/hero_locomotion.jpg` as the style reference —
  it fixes the camera height, the pixel density and the crimson-and-white the
  creatures are marked in. The hero is a human; only his palette and camera
  carry over, not his proportions.
- Negative-prompt field, if the tool has one:

  ```text
  text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, background colour, white background, grid lines, cell borders, panels, drop shadow, blur, gradient, feathered edges, halo, coloured fringe, speckles, jpeg artifacts
  ```

## Background: transparent, not keyed

**Every sheet is a PNG with a real alpha channel, transparent everywhere the
creature is not.** No magenta, no white, no fill.

`isPreKeyed` in `scripts/lib/spriteCut.mjs` detects the alpha and routes the
sheet through `alphaCell`: no colour to sample, no despill to undo, no halo
where a keyed edge used to be.

One failure mode to watch: some tools *draw* the grey checkerboard into the
pixels instead of writing alpha. That sheet is unusable — the negative prompt
bans it and every block names it. Check the alpha on the first sheet back
before commissioning the other seven.

## What came back — round one

All eight were delivered and measured against their declared grids with the
cutter's own key, split and edge tests (`scripts/lib/spriteCut.mjs`). **One is
cuttable.** The blocks below have been rewritten against what actually failed;
nothing else in the file changed.

| Sheet | Canvas | Format | Background as delivered | Verdict |
|---|---|---|---|---|
| `companion_earth_locomotion` | 1536 × 1024 ✓ | PNG | real alpha | **accepted** — 0 problems, 7.8% margin |
| `companion_fire_attack` | 1024 × 1024 ✓ | JPEG | flat grey `#525252` | keys cleanly, but no alpha and a JPEG halo |
| `companion_earth_attack` | 1254 × 1254 | PNG | real alpha | 6 cells overrun; red and yellow fringe on every alpha edge |
| `companion_lightning_locomotion` | 1536 × 1024 ✓ | PNG | alpha, but a blurred haze fills it | rows 1 and 2 bleed into each other, 8 cells |
| `companion_lightning_attack` | 1254 × 1254 | PNG | alpha carrying yellow/red speckle throughout | gaps are full of semi-opaque junk |
| `companion_fire_locomotion` | 1264 × 848 | JPEG | chequerboard **drawn** + ruled black cell borders | 24 of 24 cells fail |
| `companion_ice_locomotion` | 1264 × 848 | JPEG | chequerboard drawn + ruled borders | 24 of 24 fail |
| `companion_ice_attack` | 1024 × 1024 ✓ | JPEG | chequerboard drawn + ruled borders | 16 of 16 fail |

Four rules come straight out of that table and are now in every block:

- **Binary alpha.** Alpha 0 or 255 and nothing between. A feathered matte is
  what left the fringe on `earth_attack`, and partial alpha is what let the
  speckle survive on `lightning_attack`.
- **The chequerboard and the ruled border are named together** as things drawn
  into the pixels, in the same breath as the painted background. All three
  chequerboard sheets arrived as JPEG, which cannot carry alpha at all — so the
  format rule and the background rule are now one argument rather than two
  paragraphs apart.
- **Nothing crosses into a neighbouring cell**, and the glow around a creature
  counts as part of the drawing. That is what bled `lightning_locomotion`.
- **One size across the whole sheet.** On the accepted earth sheet the side rows
  are drawn at about 60% of the front and back rows, so the golem will shrink
  when it turns.

A JPEG renamed to `.png` is also called out, after one arrived byte-identical to
its `.jpg` twin: the cutter trusts the extension, hands the bytes to `pngjs` and
dies on `unrecognised content at end of stream`.

## What came back — round two

The four chequerboard JPEGs were re-run against the rewritten blocks. **Every
format fault is gone**: real PNG signatures, real alpha channels, no
chequerboard drawn as art, no ruled cell borders, and the locomotion sheets came
back at the asked-for 1536 × 1024 on a clean 6 × 4 with four distinct facings.

One fault replaced them, and it is why the size rule above now has a paragraph
of its own. The creatures were drawn at **75–85% of their cell** against the
59% the prompt asked for, so they overran into their neighbours:

| Sheet | Art height | Sprites overflowing | Worst overflow |
|---|---|---|---|
| `companion_fire_locomotion` | 82% of cell | 9 | **78px** |
| `companion_ice_locomotion` | 80% | 10 | 22px |
| `companion_fire_attack` | 85% | 4 | 9px |
| `companion_ice_attack` | 75% | 9 | 21px |

Size alone would not have mattered — `sheetCell` absorbs scale, which is what it
is for. The overflow is what cannot be absorbed.

Three of the four were recovered by sliding the art back inside its cells, per
row and per column so that each row keeps whatever alignment it had, and all
three now pass every cell check at `alphaThreshold` 240. `fire_locomotion` was
not recoverable: 78px of overrun cannot be slid into a cell that is already 82%
full, so it is the one sheet still to re-run.

The attack sheets also arrive at 1254 × 1254 rather than 1024 × 1024. Harmless —
the grid shape is what matters and the cutter divides by `cols × rows` — but it
is why the delivery rule now says "never larger".

**Accepted, as committed:** all eight are PNG with a real alpha channel. The
four locomotion sheets are 1536 × 1024 (asked 1536 × 1024) and the four attack
sheets are 1254 × 1254 (asked 1024 × 1024).

## Where the finished sheets go

```
docs/art/sheets/CO-124/<filename>.png
```

Folder does not exist yet; create it with the first sheet. Filenames exactly as
the table gives them — `docs/art/sheets/manifest.json` points at
`CO-124/<filename>.png` and the cutter reads only the manifest. The filenames
stay element-keyed (`companion_fire_*`), not creature-keyed, so the manifest
and `animations.ts` are unaffected by the redesign.

Never JPEG: every JPEG sheet so far came back with ~130k unique colours and a
halo on every hard edge, and a halo on a 24 px creature is most of the creature.
JPEG also has no alpha.

Drop them in as they land, in any order. Tell me which arrived and I will
measure them, add manifest entries and run `npm run art:cut`.

## Reading as friendly, not as another monster

The one acceptance criterion art alone decides, and it got harder with the
redesign: the enemies are beasts too, so a beast on the player's side has to be
marked as one. In every block three ways — markings, banned colours, bearing.

- **The player's colours, worn as markings**: a white body `#F5F5F5` with
  crimson `#DC143C` markings — a chest band, a crest, a sash. White and
  crimson on screen means friendly, exactly as it does on the hero's cloak.
- **One element accent each**, no other strong colour: fire `#FF6D00`, ice
  `#40C4FF`, lightning `#FFEE58`, earth `#8D6E63` — the Phase 1 FX hexes, so a
  companion matches what it casts.
- **Never the enemy colours**: swarm `#FF5252`, runner `#FFB300`, brute
  `#8E1B1B`, boss `#9C27B0`.
- **Tame bearing, not predatory.** Every enemy is hunched, horned or jagged, so
  these are the opposite: rounded forms, head up and alert rather than lowered
  and stalking, warm-lit friendly eyes, no red eyes, no bared fangs, no spikes,
  no gore. An animal has claws and teeth — the rule is that they are never
  *displayed*.
- **No horns, with one deliberate exception.** The boss is a huge horned demon
  lord, so horns read as hostile. The kirin keeps the single blunt brow horn its
  myth requires and nothing else: one short forward-curving horn, rounded at the
  tip, never a pair and never swept back. The other three carry no horns at all.
- **Never mistakable for the hero**: he is a tall hooded human with a staff.
  Four beasts cannot be confused with him, so this rule costs nothing now, but
  no companion is given a hood, a cloak or a staff.
- **Two silhouettes sit close to an existing enemy and are pushed apart on
  purpose.** The runner is a *"lean, pointed, dart-shaped flyer"* that points
  straight up in every frame ([CO-072](CO-072-fast.md)), so the thunderbird is
  written as the opposite shape: wings always open and wider than the body is
  long, tail fanned, head visible between them, no fins, never a rigid arrow.
  The brute is a *"heavy squat armored brute"* in iron-grey plate with shoulder
  spikes ([CO-073](CO-073-tank.md)), so the golem is bare pale stone with
  smooth rounded shoulders — no plate, no metal, no rivets, no helmet, no
  spikes. Both contrasts are stated positively inside the blocks; the enemies
  themselves are never described to the image model, which would only invite it
  to draw one.

## Sizes

Unchanged by the redesign.

| # | File | Creature | Grid | Canvas | cell | art ≤ | Plays |
|---|---|---|---|---|---|---|---|
| 1 | `companion_fire_locomotion.png` | fire kirin | 6 × 4 | 1536 × 1024 | 256 | 150 | loop |
| 2 | `companion_fire_attack.png` | fire kirin | 4 × 4 | 1024 × 1024 | 256 | 150 | once |
| 3 | `companion_ice_locomotion.png` | ice serpent | 6 × 4 | 1536 × 1024 | 256 | 150 | loop |
| 4 | `companion_ice_attack.png` | ice serpent | 4 × 4 | 1024 × 1024 | 256 | 150 | once |
| 5 | `companion_lightning_locomotion.png` | thunderbird | 6 × 4 | 1536 × 1024 | 256 | 150 | loop |
| 6 | `companion_lightning_attack.png` | thunderbird | 4 × 4 | 1024 × 1024 | 256 | 150 | once |
| 7 | `companion_earth_locomotion.png` | earth golem | 6 × 4 | 1536 × 1024 | 256 | 150 | loop |
| 8 | `companion_earth_attack.png` | earth golem | 4 × 4 | 1024 × 1024 | 256 | 150 | once |

Every cell holds a frame — no blanks anywhere, on purpose: "leave this one
empty" is what made an earlier model write the word *empty* into the picture.

The 150 px limit is the creature's longest dimension, not its height: the kirin
and the serpent are wider than they are tall, and the serpent is measured across
its coiled length.

`cell` is the authored cell, chosen for drawing quality; 24 distinct poses at
128 px come back as mush. It is not the delivered frame size. The manifest
declares `sheetCell` 160, so the native frame is 40 px and the creature lands at
about 24 px — the size the placeholder disc holds today. The cutter divides the
delivered image by `cols × rows` and never reads the authored cell size, so a
proportionally smaller delivery is fine as long as the grid is still 6 × 4 or
4 × 4.

At 40 px native the set is 160 frames — 4 × (24 + 16) — or 256,000 native
pixels, about a fifth of CO-123's sixteen sheets (1,178,536). The atlas runs
four pages, each with its own 400 KB budget
([#173](https://github.com/danhquach/crimsononslaught/issues/173)), so these
take a fifth page rather than crowd an existing one. Pages carry their own
palettes, so a new page also leaves the shipped sheets' exact pixel colours
untouched.

## What the engine does with them

Manifest keys `companionFire`, `companionIce`, `companionLightning`,
`companionEarth`, one per pair. Row layout is the hero's, so `facings()` in
`src/config/animations.ts` applies unchanged:

| Sheet | Rows | Animations |
|---|---|---|
| `_locomotion` | down, up, left, right | `idle` cols 1–2 (loop), `move` cols 3–6 (loop) |
| `_attack` | down, up, left, right | `attack` cols 1–4 (once) |

A creature that flies or slithers still needs four facings and the same
six-then-four split, so nothing in `animations.ts` changes; only the pose inside
each cell does.

No hurt or death sheet: a companion is not damageable (#133), so it is never hit
and never dies on screen. Spawned when its slot is filled, removed at end of run.

Wiring — manifest entries, `animations.ts`, swapping `CompanionSpell` off the
placeholder disc — is the rest of #146, not this document.

---

## 1. `companion_fire_locomotion.png` — fire kirin, idle and trotting

Save as `docs/art/sheets/CO-124/companion_fire_locomotion.png`.

```text
Pixel-art animation sheet for a top-down 2D game: a small friendly kirin, a gentle deer-like beast that carries fire, fighting alongside the player, idle and trotting, in four facings. Draw only this creature — no player, no people, no enemies, no ground.

Canvas 1536x1024: a grid of 256px square cells, 6 across and 4 down, 24 in all, read left to right, top row first. The creature is about 150px along its longest side, centred in its cell.

Creature: a slender hooved quadruped the size of a large hound, deer-like, with a long neck, a deep chest and cloven hooves. Its coat is white, #F5F5F5, turning to fine white scales at the shoulders and haunches, with crimson markings, #DC143C — a band across its chest and a blaze down its brow. Ember orange fire, #FF6D00, burns as a mane along its neck, as a plume at its tail, and as a low flame above each hoof. It has one short forward-curving horn on its brow, rounded at the tip, and warm gold eyes.

It must read as friendly at a glance, because the enemies are beasts too: the white coat and crimson markings are the largest thing on it and ember orange the only other strong colour. Never the enemy colours #FF5252, #FFB300, #8E1B1B or #9C27B0, and never red eyes. Rounded forms, head carried high and alert, never lowered and stalking. No bared fangs, no spikes, no gore. The single blunt brow horn is the only horn on it — never a pair, never swept back, nothing like a horned demon. It wears no hood, cloak, armour, saddle or harness.

Rows are facings: row 1 trotting towards the viewer, face and chest visible; row 2 away, the tail plume and haunches towards the viewer; row 3 left; row 4 right.

Cells 1-2 are an idle, cells 3-6 a trot. The idle is one breath — the chest rises and settles, the mane fire flickers to a different shape, the tail plume sways, hooves still. The trot is one full four-legged cycle — near foreleg reaching, legs gathered under the body, far foreleg reaching, gathered again — with the leg change large enough to read at a glance and the mane and tail moving with it.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from top-left; grim fantasy colour on the subject only; original design; match the attached reference.
Background: transparent, as a real alpha channel — alpha 0 everywhere the creature is not, alpha 255 everywhere it is, nothing in between. Do not paint a background: no colour, white, magenta, grey, panel or vignette, and above all no chequered pattern — the grey-and-white chequerboard is how an editor displays emptiness, and drawn into the pixels it is simply art, which throws the sheet away. A format that cannot carry alpha is already the wrong format. Outside the creature's own outline there are no pixels at all: no shadow, no vignette, no halo or coloured fringe along its edge, no soft or feathered edge, and no stray specks, dust or drifting colour anywhere in the empty space.
Size, measured on the delivered file, and the rule most often broken: the creature fits inside a box 150 pixels square at the centre of its 256 pixel cell, which leaves 53 pixels of empty space between that box and every cell edge. Nothing of it reaches outside that box — not a tail, a wing, a flame, a horn, a raised limb, and not the glow around it. If a pose will not fit, draw the whole creature smaller; never let it grow to fill the cell, and never let one pose be drawn larger than another. Drawn any bigger it runs into the neighbouring cells, and the sheet cannot be cut.
Cells are a measurement, not something to draw. Nothing whatever marks where one cell ends and the next begins: no line, border, divider, frame, panel, tile, box or square of colour, and no change of tone between a cell and its neighbour. A ruled grid drawn over the sheet is as fatal as a painted background; the grid exists only so a script can cut the frames at fixed positions. No text anywhere either — one letter, number, label or watermark ruins the sheet.
Each row faces only its own direction: head, body and hooves point that way in every cell. No row is a copy, mirror or rotation of another; the left and right rows are separate drawings and the crimson chest band and brow blaze sit the same way round in both.
Every drawing belongs to one cell and stays inside it at the margin above, never touching an edge; draw it smaller rather than spill, the margin is measured on the delivered file. Nothing crosses into a neighbouring cell — not a wing, a tail, a raised limb, and not the fire, frost or lightning around the creature, which counts as part of the drawing. The hooves land on the same line and the body holds the same spot in every cell of a row so the animation does not slide. Every cell holds a full drawing, and the creature is drawn at one size across the whole sheet — the side-facing rows at the same scale as the front and back rows, never smaller.
Deliver one lossless PNG carrying a real alpha channel — an actual PNG file, not a JPEG renamed to .png, and never JPEG in any form: it cannot hold alpha and it leaves a halo on every hard edge. Deliver it at exactly the canvas size above; if it must be smaller, scale the whole canvas down proportionally and keep the same number of cells, never below half, never larger, and never a different shape. Report the exact pixel size.
```

## 2. `companion_fire_attack.png` — fire kirin breathing an ember

Save as `docs/art/sheets/CO-124/companion_fire_attack.png`.

```text
Pixel-art animation sheet for a top-down 2D game: a small friendly kirin, a gentle deer-like beast that carries fire, fighting alongside the player, breathing a small ember, in four facings. Draw only this creature — no player, no people, no enemies, no ground.

Canvas 1024x1024: a grid of 256px square cells, 4 across and 4 down, 16 in all, read left to right, top row first. The creature is about 150px along its longest side, centred in its cell.

Creature: a slender hooved quadruped the size of a large hound, deer-like, with a long neck, a deep chest and cloven hooves. Its coat is white, #F5F5F5, turning to fine white scales at the shoulders and haunches, with crimson markings, #DC143C — a band across its chest and a blaze down its brow. Ember orange fire, #FF6D00, burns as a mane along its neck, as a plume at its tail, and as a low flame above each hoof. It has one short forward-curving horn on its brow, rounded at the tip, and warm gold eyes.

It must read as friendly at a glance, because the enemies are beasts too: the white coat and crimson markings are the largest thing on it and ember orange the only other strong colour. Never the enemy colours #FF5252, #FFB300, #8E1B1B or #9C27B0, and never red eyes. Rounded forms, head carried high and alert, never lowered and stalking. No bared fangs, no spikes, no gore. The single blunt brow horn is the only horn on it — never a pair, never swept back, nothing like a horned demon. It wears no hood, cloak, armour, saddle or harness.

Rows are facings: row 1 facing the viewer; row 2 facing away, the tail plume towards the viewer; row 3 left; row 4 right.

The four cells of a row are one shot in time order. 1: it braces, forehooves planted, head drawn back and the mane fire swelling. 2: it draws breath and a bright ember gathers behind its closed mouth, the throat glowing orange. 3: the head thrusts forward and the ember sits right at its muzzle as a small bright spark, the whole mane flaring. 4: it settles back, head high, mouth closed, mane fire small again.

The shot itself is not drawn — the game draws the bolt that flies out. Nothing travels away from the creature, crosses the cell or leaves it; the spark in cell 3 touches the muzzle and goes no further. The mouth opens only enough to let the ember out; no teeth are shown. The brow horn is never used to strike.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from top-left; grim fantasy colour on the subject only; original design; match the attached reference.
Background: transparent, as a real alpha channel — alpha 0 everywhere the creature is not, alpha 255 everywhere it is, nothing in between. Do not paint a background: no colour, white, magenta, grey, panel or vignette, and above all no chequered pattern — the grey-and-white chequerboard is how an editor displays emptiness, and drawn into the pixels it is simply art, which throws the sheet away. A format that cannot carry alpha is already the wrong format. Outside the creature's own outline there are no pixels at all: no shadow, no vignette, no halo or coloured fringe along its edge, no soft or feathered edge, and no stray specks, dust or drifting colour anywhere in the empty space.
Size, measured on the delivered file, and the rule most often broken: the creature fits inside a box 150 pixels square at the centre of its 256 pixel cell, which leaves 53 pixels of empty space between that box and every cell edge. Nothing of it reaches outside that box — not a tail, a wing, a flame, a horn, a raised limb, and not the glow around it. If a pose will not fit, draw the whole creature smaller; never let it grow to fill the cell, and never let one pose be drawn larger than another. Drawn any bigger it runs into the neighbouring cells, and the sheet cannot be cut.
Cells are a measurement, not something to draw. Nothing whatever marks where one cell ends and the next begins: no line, border, divider, frame, panel, tile, box or square of colour, and no change of tone between a cell and its neighbour. A ruled grid drawn over the sheet is as fatal as a painted background; the grid exists only so a script can cut the frames at fixed positions. No text anywhere either — one letter, number, label or watermark ruins the sheet.
Each row faces only its own direction: head, body and hooves point that way in every cell. No row is a copy, mirror or rotation of another; the left and right rows are separate drawings and the crimson chest band and brow blaze sit the same way round in both.
Every drawing belongs to one cell and stays inside it at the margin above, never touching an edge; draw it smaller rather than spill, the margin is measured on the delivered file. Nothing crosses into a neighbouring cell — not a wing, a tail, a raised limb, and not the fire, frost or lightning around the creature, which counts as part of the drawing. The hooves land on the same line and the body holds the same spot in every cell of a row so the animation does not slide. Every cell holds a full drawing, and the creature is drawn at one size across the whole sheet — the side-facing rows at the same scale as the front and back rows, never smaller.
Deliver one lossless PNG carrying a real alpha channel — an actual PNG file, not a JPEG renamed to .png, and never JPEG in any form: it cannot hold alpha and it leaves a halo on every hard edge. Deliver it at exactly the canvas size above; if it must be smaller, scale the whole canvas down proportionally and keep the same number of cells, never below half, never larger, and never a different shape. Report the exact pixel size.
```

## 3. `companion_ice_locomotion.png` — ice serpent, idle and gliding

Save as `docs/art/sheets/CO-124/companion_ice_locomotion.png`.

```text
Pixel-art animation sheet for a top-down 2D game: a small friendly serpent made of ice that fights alongside the player, idle and gliding, in four facings. Draw only this creature — no player, no people, no enemies, no ground.

Canvas 1536x1024: a grid of 256px square cells, 6 across and 4 down, 24 in all, read left to right, top row first. The creature is about 150px along its longest side measured across its curved body, centred in its cell.

Creature: a slender legless serpent held in a loose S-curve, thick as a wrist and long enough to coil. Its scales are white, #F5F5F5, with crimson bands, #DC143C, just behind the head and again near the tail. A crest of blue-white ice crystal, #40C4FF, runs the length of its spine and its underside is frosted the same blue. Its head is a smooth rounded wedge with warm pale-blue eyes and a closed mouth.

It must read as friendly at a glance, because the enemies are beasts too: the white scales and crimson bands are the largest thing on it and ice blue the only other strong colour. Never the enemy colours #FF5252, #FFB300, #8E1B1B or #9C27B0, and never red eyes. Rounded forms, head up and alert, never lowered and stalking. No bared fangs, no forked tongue, no horns, no spikes beyond the smooth crystal crest, no gore. It wears no hood, cloak, armour or harness.

Rows are facings: row 1 head towards the viewer, face visible, body trailing behind it; row 2 head away, the crest and back towards the viewer; row 3 head left; row 4 head right.

Cells 1-2 are an idle, cells 3-6 a glide. The idle is one slow breath — the coil rises and settles, the crystal crest catches the light differently, the head sways a little. The glide is one full cycle of a wave travelling from head to tail: the S-curve shifts one quarter of its length along the body in each cell and returns to the first shape, so the loop is seamless and the change of curve reads at a glance.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from top-left; grim fantasy colour on the subject only; original design; match the attached reference.
Background: transparent, as a real alpha channel — alpha 0 everywhere the creature is not, alpha 255 everywhere it is, nothing in between. Do not paint a background: no colour, white, magenta, grey, panel or vignette, and above all no chequered pattern — the grey-and-white chequerboard is how an editor displays emptiness, and drawn into the pixels it is simply art, which throws the sheet away. A format that cannot carry alpha is already the wrong format. Outside the creature's own outline there are no pixels at all: no shadow, no vignette, no halo or coloured fringe along its edge, no soft or feathered edge, and no stray specks, dust or drifting colour anywhere in the empty space.
Size, measured on the delivered file, and the rule most often broken: the creature fits inside a box 150 pixels square at the centre of its 256 pixel cell, which leaves 53 pixels of empty space between that box and every cell edge. Nothing of it reaches outside that box — not a tail, a wing, a flame, a horn, a raised limb, and not the glow around it. If a pose will not fit, draw the whole creature smaller; never let it grow to fill the cell, and never let one pose be drawn larger than another. Drawn any bigger it runs into the neighbouring cells, and the sheet cannot be cut.
Cells are a measurement, not something to draw. Nothing whatever marks where one cell ends and the next begins: no line, border, divider, frame, panel, tile, box or square of colour, and no change of tone between a cell and its neighbour. A ruled grid drawn over the sheet is as fatal as a painted background; the grid exists only so a script can cut the frames at fixed positions. No text anywhere either — one letter, number, label or watermark ruins the sheet.
Each row faces only its own direction: the head points that way in every cell of the row. No row is a copy, mirror or rotation of another; the left and right rows are separate drawings and the crimson bands sit the same distance behind the head in both.
Every drawing belongs to one cell and stays inside it at the margin above, never touching an edge; draw it smaller rather than spill, the margin is measured on the delivered file. Nothing crosses into a neighbouring cell — not a wing, a tail, a raised limb, and not the fire, frost or lightning around the creature, which counts as part of the drawing. The lowest coil of the body rests on the same line and the head holds the same spot in every cell of a row so the animation does not slide. Every cell holds a full drawing, and the creature is drawn at one size across the whole sheet — the side-facing rows at the same scale as the front and back rows, never smaller.
Deliver one lossless PNG carrying a real alpha channel — an actual PNG file, not a JPEG renamed to .png, and never JPEG in any form: it cannot hold alpha and it leaves a halo on every hard edge. Deliver it at exactly the canvas size above; if it must be smaller, scale the whole canvas down proportionally and keep the same number of cells, never below half, never larger, and never a different shape. Report the exact pixel size.
```

## 4. `companion_ice_attack.png` — ice serpent spitting a shard

Save as `docs/art/sheets/CO-124/companion_ice_attack.png`.

```text
Pixel-art animation sheet for a top-down 2D game: a small friendly serpent made of ice that fights alongside the player, spitting a frost shard, in four facings. Draw only this creature — no player, no people, no enemies, no ground.

Canvas 1024x1024: a grid of 256px square cells, 4 across and 4 down, 16 in all, read left to right, top row first. The creature is about 150px along its longest side measured across its curved body, centred in its cell.

Creature: a slender legless serpent held in a loose S-curve, thick as a wrist and long enough to coil. Its scales are white, #F5F5F5, with crimson bands, #DC143C, just behind the head and again near the tail. A crest of blue-white ice crystal, #40C4FF, runs the length of its spine and its underside is frosted the same blue. Its head is a smooth rounded wedge with warm pale-blue eyes and a closed mouth.

It must read as friendly at a glance, because the enemies are beasts too: the white scales and crimson bands are the largest thing on it and ice blue the only other strong colour. Never the enemy colours #FF5252, #FFB300, #8E1B1B or #9C27B0, and never red eyes. Rounded forms, head up and alert, never lowered and stalking. No bared fangs, no forked tongue, no horns, no spikes beyond the smooth crystal crest, no gore. It wears no hood, cloak, armour or harness.

Rows are facings: row 1 head towards the viewer; row 2 head away, the crest towards the viewer; row 3 head left; row 4 head right.

The four cells of a row are one shot in time order. 1: the body gathers into a tight coil and the head draws back over it. 2: the crest brightens and frost gathers at the closed mouth as a pale bloom. 3: the head darts forward to the full length of the neck and a small bright shard of ice sits right at its mouth. 4: the head draws back over the coil, the crest dim again.

The shard in flight is not drawn — the game draws the bolt that flies out. Nothing travels away from the creature, crosses the cell or leaves it; the shard in cell 3 touches the mouth and goes no further. The mouth opens only enough to let the shard out; no fangs are shown.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from top-left; grim fantasy colour on the subject only; original design; match the attached reference.
Background: transparent, as a real alpha channel — alpha 0 everywhere the creature is not, alpha 255 everywhere it is, nothing in between. Do not paint a background: no colour, white, magenta, grey, panel or vignette, and above all no chequered pattern — the grey-and-white chequerboard is how an editor displays emptiness, and drawn into the pixels it is simply art, which throws the sheet away. A format that cannot carry alpha is already the wrong format. Outside the creature's own outline there are no pixels at all: no shadow, no vignette, no halo or coloured fringe along its edge, no soft or feathered edge, and no stray specks, dust or drifting colour anywhere in the empty space.
Size, measured on the delivered file, and the rule most often broken: the creature fits inside a box 150 pixels square at the centre of its 256 pixel cell, which leaves 53 pixels of empty space between that box and every cell edge. Nothing of it reaches outside that box — not a tail, a wing, a flame, a horn, a raised limb, and not the glow around it. If a pose will not fit, draw the whole creature smaller; never let it grow to fill the cell, and never let one pose be drawn larger than another. Drawn any bigger it runs into the neighbouring cells, and the sheet cannot be cut.
Cells are a measurement, not something to draw. Nothing whatever marks where one cell ends and the next begins: no line, border, divider, frame, panel, tile, box or square of colour, and no change of tone between a cell and its neighbour. A ruled grid drawn over the sheet is as fatal as a painted background; the grid exists only so a script can cut the frames at fixed positions. No text anywhere either — one letter, number, label or watermark ruins the sheet.
Each row faces only its own direction: the head points that way in every cell of the row. No row is a copy, mirror or rotation of another; the left and right rows are separate drawings and the crimson bands sit the same distance behind the head in both.
Every drawing belongs to one cell and stays inside it at the margin above, never touching an edge; draw it smaller rather than spill, the margin is measured on the delivered file. Nothing crosses into a neighbouring cell — not a wing, a tail, a raised limb, and not the fire, frost or lightning around the creature, which counts as part of the drawing. The lowest coil of the body rests on the same line and the coil holds the same spot in every cell of a row so the animation does not slide. Every cell holds a full drawing, and the creature is drawn at one size across the whole sheet — the side-facing rows at the same scale as the front and back rows, never smaller.
Deliver one lossless PNG carrying a real alpha channel — an actual PNG file, not a JPEG renamed to .png, and never JPEG in any form: it cannot hold alpha and it leaves a halo on every hard edge. Deliver it at exactly the canvas size above; if it must be smaller, scale the whole canvas down proportionally and keep the same number of cells, never below half, never larger, and never a different shape. Report the exact pixel size.
```

## 5. `companion_lightning_locomotion.png` — thunderbird, hovering and flying

Save as `docs/art/sheets/CO-124/companion_lightning_locomotion.png`.

```text
Pixel-art animation sheet for a top-down 2D game: a small friendly thunderbird, a bird that carries lightning, fighting alongside the player, hovering and flying, in four facings. Draw only this creature — no player, no people, no enemies, no ground.

Canvas 1536x1024: a grid of 256px square cells, 6 across and 4 down, 24 in all, read left to right, top row first. The creature is about 150px across its open wings, centred in its cell.

Creature: a hawk-sized bird seen from above and slightly behind, wings open, tail fanned. Its plumage is white, #F5F5F5, with a crimson crest and a crimson bar across the tail, #DC143C. Pale yellow lightning, #FFEE58, with a white core arcs along the trailing edge of each wing and sparks at its talons. Its beak is short and blunt and its eyes are warm gold. Its silhouette is unmistakably a bird: the open wings span wider than the body is long, the tail is fanned, and the head is clearly visible between them. It is never a lean pointed dart or a rigid arrow shape, it has no fins, and its wings stay open and separate from the body rather than folding into one streamlined point.

It must read as friendly at a glance, because the enemies are beasts too: the white plumage and crimson crest are the largest thing on it and lightning yellow the only other strong colour. Never the enemy colours #FF5252, #FFB300, #8E1B1B or #9C27B0, and never red eyes. Rounded forms, head up and alert, never lowered and stalking. No bared talons held forward, no horns, no spikes, no gore. It wears no hood, cloak, armour or harness.

Rows are facings: row 1 flying towards the viewer, head and breast visible; row 2 flying away, the back and tail towards the viewer; row 3 flying left; row 4 flying right.

Cells 1-2 are a hover, cells 3-6 a flight cycle. The hover is two shallow wingbeats in place — wings high, then level — with the arcs flickering to a different shape and the body barely rising. The flight is one full wingbeat cycle — wings high, wings level with the body reaching forward, wings down and swept, wings rising again — large enough to read at a glance, with the tail fanning and closing with the beat.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from top-left; grim fantasy colour on the subject only; original design; match the attached reference.
Background: transparent, as a real alpha channel — alpha 0 everywhere the creature is not, alpha 255 everywhere it is, nothing in between. Do not paint a background: no colour, white, magenta, grey, panel or vignette, and above all no chequered pattern — the grey-and-white chequerboard is how an editor displays emptiness, and drawn into the pixels it is simply art, which throws the sheet away. A format that cannot carry alpha is already the wrong format. Outside the creature's own outline there are no pixels at all: no shadow, no vignette, no halo or coloured fringe along its edge, no soft or feathered edge, and no stray specks, dust or drifting colour anywhere in the empty space.
Size, measured on the delivered file, and the rule most often broken: the creature fits inside a box 150 pixels square at the centre of its 256 pixel cell, which leaves 53 pixels of empty space between that box and every cell edge. Nothing of it reaches outside that box — not a tail, a wing, a flame, a horn, a raised limb, and not the glow around it. If a pose will not fit, draw the whole creature smaller; never let it grow to fill the cell, and never let one pose be drawn larger than another. Drawn any bigger it runs into the neighbouring cells, and the sheet cannot be cut.
Cells are a measurement, not something to draw. Nothing whatever marks where one cell ends and the next begins: no line, border, divider, frame, panel, tile, box or square of colour, and no change of tone between a cell and its neighbour. A ruled grid drawn over the sheet is as fatal as a painted background; the grid exists only so a script can cut the frames at fixed positions. No text anywhere either — one letter, number, label or watermark ruins the sheet.
Each row faces only its own direction: the head, the body and the fanned tail point that way in every cell. No row is a copy, mirror or rotation of another; the left and right rows are separate drawings and the crimson crest sits the same way round in both.
Every drawing belongs to one cell and stays inside it at the margin above, never touching an edge; draw it smaller rather than spill, the margin is measured on the delivered file. Nothing crosses into a neighbouring cell — not a wing, a tail, a raised limb, and not the fire, frost or lightning around the creature, which counts as part of the drawing. The bird flies rather than walks, so its body holds the same spot in every cell of a row — only the wings and tail move — and the animation does not slide. Every cell holds a full drawing, and the creature is drawn at one size across the whole sheet — the side-facing rows at the same scale as the front and back rows, never smaller.
Deliver one lossless PNG carrying a real alpha channel — an actual PNG file, not a JPEG renamed to .png, and never JPEG in any form: it cannot hold alpha and it leaves a halo on every hard edge. Deliver it at exactly the canvas size above; if it must be smaller, scale the whole canvas down proportionally and keep the same number of cells, never below half, never larger, and never a different shape. Report the exact pixel size.
```

## 6. `companion_lightning_attack.png` — thunderbird diving

Save as `docs/art/sheets/CO-124/companion_lightning_attack.png`.

```text
Pixel-art animation sheet for a top-down 2D game: a small friendly thunderbird, a bird that carries lightning, fighting alongside the player, diving and striking with its talons, in four facings. Draw only this creature — no player, no people, no enemies, no ground.

Canvas 1024x1024: a grid of 256px square cells, 4 across and 4 down, 16 in all, read left to right, top row first. The creature is about 150px across its open wings, centred in its cell.

Creature: a hawk-sized bird seen from above and slightly behind, wings open, tail fanned. Its plumage is white, #F5F5F5, with a crimson crest and a crimson bar across the tail, #DC143C. Pale yellow lightning, #FFEE58, with a white core arcs along the trailing edge of each wing and sparks at its talons. Its beak is short and blunt and its eyes are warm gold. Its silhouette is unmistakably a bird: the open wings span wider than the body is long, the tail is fanned, and the head is clearly visible between them. It is never a lean pointed dart or a rigid arrow shape, it has no fins, and its wings stay open and separate from the body rather than folding into one streamlined point.

It must read as friendly at a glance, because the enemies are beasts too: the white plumage and crimson crest are the largest thing on it and lightning yellow the only other strong colour. Never the enemy colours #FF5252, #FFB300, #8E1B1B or #9C27B0, and never red eyes. Rounded forms, head up and alert, never lowered and stalking. No horns, no spikes, no gore.

Rows are facings: row 1 diving towards the viewer; row 2 diving away, the back towards the viewer; row 3 diving left; row 4 diving right.

The four cells of a row are one strike in time order. 1: it rears back, wings thrown high and swept, the lightning on them brightening. 2: it pitches forward into the row's facing, wings half folded, talons swinging down and ahead. 3: the hit — the talons rake through and one short bright arc of lightning hangs in the air just past them, the wings snapped wide. 4: it recovers, wings level, talons tucked, lightning dim again.

Nothing struck is drawn — the game draws the enemy and the hit. Nothing is drawn where a target would be; the talons and the arc stay within a wing's reach of the body and never cross the cell or touch its edge.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from top-left; grim fantasy colour on the subject only; original design; match the attached reference.
Background: transparent, as a real alpha channel — alpha 0 everywhere the creature is not, alpha 255 everywhere it is, nothing in between. Do not paint a background: no colour, white, magenta, grey, panel or vignette, and above all no chequered pattern — the grey-and-white chequerboard is how an editor displays emptiness, and drawn into the pixels it is simply art, which throws the sheet away. A format that cannot carry alpha is already the wrong format. Outside the creature's own outline there are no pixels at all: no shadow, no vignette, no halo or coloured fringe along its edge, no soft or feathered edge, and no stray specks, dust or drifting colour anywhere in the empty space.
Size, measured on the delivered file, and the rule most often broken: the creature fits inside a box 150 pixels square at the centre of its 256 pixel cell, which leaves 53 pixels of empty space between that box and every cell edge. Nothing of it reaches outside that box — not a tail, a wing, a flame, a horn, a raised limb, and not the glow around it. If a pose will not fit, draw the whole creature smaller; never let it grow to fill the cell, and never let one pose be drawn larger than another. Drawn any bigger it runs into the neighbouring cells, and the sheet cannot be cut.
Cells are a measurement, not something to draw. Nothing whatever marks where one cell ends and the next begins: no line, border, divider, frame, panel, tile, box or square of colour, and no change of tone between a cell and its neighbour. A ruled grid drawn over the sheet is as fatal as a painted background; the grid exists only so a script can cut the frames at fixed positions. No text anywhere either — one letter, number, label or watermark ruins the sheet.
Each row faces only its own direction: the head, the body and the fanned tail point that way in every cell. No row is a copy, mirror or rotation of another; the left and right rows are separate drawings and the crimson crest sits the same way round in both.
Every drawing belongs to one cell and stays inside it at the margin above, never touching an edge; draw it smaller rather than spill, the margin is measured on the delivered file. Nothing crosses into a neighbouring cell — not a wing, a tail, a raised limb, and not the fire, frost or lightning around the creature, which counts as part of the drawing. The bird flies rather than walks, so its body holds the same spot in every cell of a row and the animation does not slide. Every cell holds a full drawing, and the creature is drawn at one size across the whole sheet — the side-facing rows at the same scale as the front and back rows, never smaller.
Deliver one lossless PNG carrying a real alpha channel — an actual PNG file, not a JPEG renamed to .png, and never JPEG in any form: it cannot hold alpha and it leaves a halo on every hard edge. Deliver it at exactly the canvas size above; if it must be smaller, scale the whole canvas down proportionally and keep the same number of cells, never below half, never larger, and never a different shape. Report the exact pixel size.
```

## 7. `companion_earth_locomotion.png` — earth golem, idle and walking

Save as `docs/art/sheets/CO-124/companion_earth_locomotion.png`.

```text
Pixel-art animation sheet for a top-down 2D game: a small friendly golem made of stone that fights alongside the player, idle and walking, in four facings. Draw only this creature — no player, no people, no enemies, no ground.

Canvas 1536x1024: a grid of 256px square cells, 6 across and 4 down, 24 in all, read left to right, top row first. The golem is about 150px tall, centred in its cell.

Creature: a squat, round-shouldered golem carved from pale stone, #F5F5F5, with the brown-grey of raw rock, #8D6E63, at its joints and along the seams of its arms. A crimson sash, #DC143C, is bound across its chest. It has no weapon — its hands are two oversized stone fists. Its head is a smooth rounded block with two small warm-lit eyes and no mouth. It is bare carved stone and never armoured: no plate, no metal, no rivets, no helmet and no shoulder spikes — its shoulders are smooth rounded stone. Its surface stays pale and chalky, never dark and never metallic, and the crimson sash is the only thing it wears.

It must read as friendly at a glance, because the enemies are beasts too: the pale stone and crimson sash are the largest things on it and rock brown the only other strong colour. Never the enemy colours #FF5252, #FFB300, #8E1B1B or #9C27B0, and never red eyes. Its edges are worn round, never jagged. Upright and open-shouldered, not hunched. No claws, fangs, horns, spikes or gore. It wears no hood, cloak or armour, and carries no staff.

Rows are facings: row 1 down, eyes to the viewer; row 2 up, back of the head; row 3 left; row 4 right.

Cells 1-2 are an idle, cells 3-6 a walk. The idle is one slow settle — the shoulders drop and rise, the sash sways, feet still. The walk is one full cycle — left foot forward, feet together, right foot forward, feet together — heavy and flat-footed, with the leg change large enough to read at a glance.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from top-left; grim fantasy colour on the subject only; original design; match the attached reference.
Background: transparent, as a real alpha channel — alpha 0 everywhere the golem is not, alpha 255 everywhere it is, nothing in between. Do not paint a background: no colour, white, magenta, grey, panel or vignette, and above all no chequered pattern — the grey-and-white chequerboard is how an editor displays emptiness, and drawn into the pixels it is simply art, which throws the sheet away. A format that cannot carry alpha is already the wrong format. Outside the golem's own outline there are no pixels at all: no shadow, no vignette, no halo or coloured fringe along its edge, no soft or feathered edge, and no stray specks, dust or drifting colour anywhere in the empty space.
Size, measured on the delivered file, and the rule most often broken: the creature fits inside a box 150 pixels square at the centre of its 256 pixel cell, which leaves 53 pixels of empty space between that box and every cell edge. Nothing of it reaches outside that box — not a tail, a wing, a flame, a horn, a raised limb, and not the glow around it. If a pose will not fit, draw the whole creature smaller; never let it grow to fill the cell, and never let one pose be drawn larger than another. Drawn any bigger it runs into the neighbouring cells, and the sheet cannot be cut.
Cells are a measurement, not something to draw. Nothing whatever marks where one cell ends and the next begins: no line, border, divider, frame, panel, tile, box or square of colour, and no change of tone between a cell and its neighbour. A ruled grid drawn over the sheet is as fatal as a painted background; the grid exists only so a script can cut the frames at fixed positions. No text anywhere either — one letter, number, label or watermark ruins the sheet.
Each row faces only its own direction: head, hands and feet point that way in every cell. No row is a copy, mirror or rotation of another; the left and right rows are separate drawings and the sash is knotted on the same side in both.
Every drawing belongs to one cell and stays inside it at the margin above, never touching an edge; draw it smaller rather than spill, the margin is measured on the delivered file. Nothing crosses into a neighbouring cell — not a wing, a tail, a raised limb, and not the fire, frost or lightning around the creature, which counts as part of the drawing. The feet land on the same line and the same spot in every cell of a row so the animation does not slide. Every cell holds a full drawing, and the creature is drawn at one size across the whole sheet — the side-facing rows at the same scale as the front and back rows, never smaller.
Deliver one lossless PNG carrying a real alpha channel — an actual PNG file, not a JPEG renamed to .png, and never JPEG in any form: it cannot hold alpha and it leaves a halo on every hard edge. Deliver it at exactly the canvas size above; if it must be smaller, scale the whole canvas down proportionally and keep the same number of cells, never below half, never larger, and never a different shape. Report the exact pixel size.
```

## 8. `companion_earth_attack.png` — earth golem slamming

Save as `docs/art/sheets/CO-124/companion_earth_attack.png`.

```text
Pixel-art animation sheet for a top-down 2D game: a small friendly golem made of stone that fights alongside the player, slamming both fists down, in four facings. Draw only this creature — no player, no people, no enemies, no ground.

Canvas 1024x1024: a grid of 256px square cells, 4 across and 4 down, 16 in all, read left to right, top row first. The golem is about 150px tall, centred in its cell.

Creature: a squat, round-shouldered golem carved from pale stone, #F5F5F5, with the brown-grey of raw rock, #8D6E63, at its joints and along the seams of its arms. A crimson sash, #DC143C, is bound across its chest. It has no weapon — its hands are two oversized stone fists. Its head is a smooth rounded block with two small warm-lit eyes and no mouth. It is bare carved stone and never armoured: no plate, no metal, no rivets, no helmet and no shoulder spikes — its shoulders are smooth rounded stone. Its surface stays pale and chalky, never dark and never metallic, and the crimson sash is the only thing it wears.

It must read as friendly at a glance, because the enemies are beasts too: the pale stone and crimson sash are the largest things on it and rock brown the only other strong colour. Never the enemy colours #FF5252, #FFB300, #8E1B1B or #9C27B0, and never red eyes. Its edges are worn round, never jagged. Upright and open-shouldered, not hunched. No claws, fangs, horns, spikes or gore. It wears no hood, cloak or armour, and carries no staff.

Rows are facings: row 1 down, eyes to the viewer; row 2 up, back of the head; row 3 left; row 4 right.

The four cells of a row are one slam in time order. 1: both feet planted, both fists raised over the head, the shoulder seams opening as they lift. 2: held at the top of the wind-up, leaning back, the rock brown at the seams glowing a little. 3: both fists driven down in front and a few small chips of stone jumping up around them. 4: straightened back up, fists low, chips gone.

Nothing struck is drawn — the game draws the enemy and the hit. Nothing is drawn where a target would be; the fists and the chips stay within arm's reach and never cross the cell or touch its edge.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from top-left; grim fantasy colour on the subject only; original design; match the attached reference.
Background: transparent, as a real alpha channel — alpha 0 everywhere the golem is not, alpha 255 everywhere it is, nothing in between. Do not paint a background: no colour, white, magenta, grey, panel or vignette, and above all no chequered pattern — the grey-and-white chequerboard is how an editor displays emptiness, and drawn into the pixels it is simply art, which throws the sheet away. A format that cannot carry alpha is already the wrong format. Outside the golem's own outline there are no pixels at all: no shadow, no vignette, no halo or coloured fringe along its edge, no soft or feathered edge, and no stray specks, dust or drifting colour anywhere in the empty space.
Size, measured on the delivered file, and the rule most often broken: the creature fits inside a box 150 pixels square at the centre of its 256 pixel cell, which leaves 53 pixels of empty space between that box and every cell edge. Nothing of it reaches outside that box — not a tail, a wing, a flame, a horn, a raised limb, and not the glow around it. If a pose will not fit, draw the whole creature smaller; never let it grow to fill the cell, and never let one pose be drawn larger than another. Drawn any bigger it runs into the neighbouring cells, and the sheet cannot be cut.
Cells are a measurement, not something to draw. Nothing whatever marks where one cell ends and the next begins: no line, border, divider, frame, panel, tile, box or square of colour, and no change of tone between a cell and its neighbour. A ruled grid drawn over the sheet is as fatal as a painted background; the grid exists only so a script can cut the frames at fixed positions. No text anywhere either — one letter, number, label or watermark ruins the sheet.
Each row faces only its own direction: head, hands and feet point that way in every cell. No row is a copy, mirror or rotation of another; the left and right rows are separate drawings and the sash is knotted on the same side in both.
Every drawing belongs to one cell and stays inside it at the margin above, never touching an edge; draw it smaller rather than spill, the margin is measured on the delivered file. Nothing crosses into a neighbouring cell — not a wing, a tail, a raised limb, and not the fire, frost or lightning around the creature, which counts as part of the drawing. The feet land on the same line and the same spot in every cell of a row so the animation does not slide. Every cell holds a full drawing, and the creature is drawn at one size across the whole sheet — the side-facing rows at the same scale as the front and back rows, never smaller.
Deliver one lossless PNG carrying a real alpha channel — an actual PNG file, not a JPEG renamed to .png, and never JPEG in any form: it cannot hold alpha and it leaves a halo on every hard edge. Deliver it at exactly the canvas size above; if it must be smaller, scale the whole canvas down proportionally and keep the same number of cells, never below half, never larger, and never a different shape. Report the exact pixel size.
```

## Done when

All eight sheets are delivered at the grids above, as PNGs with a real alpha
channel, and measured against the delivered pixels. Manifest entries, the cut
and the engine wiring are the rest of #146 and land separately.
