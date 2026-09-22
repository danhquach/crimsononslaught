# CO-124 Art: companion character sheets

Ticket: [#146](https://github.com/danhquach/crimsononslaught/issues/146) · Epic: [#122](https://github.com/danhquach/crimsononslaught/issues/122) · Spec: `docs/superpowers/specs/2026-09-18-phase2-spells.md` §9, §10

Eight sheets: a locomotion and an attack sheet for each of the four companions.
**One sheet per run**, so a bad one is redone on its own.

These are the only characters on the player's side; everything else that moves
is an enemy, so the set has to not read as one. They replace the single green
disc `src/config/colors.ts` draws for all four today — *"Green so an ally never
reads as an enemy at a glance."* The palette contract below carries that read
with drawing instead.

## How to run this

**Copy the whole `text` block under a sheet's heading and paste it as the
prompt.** Each block is complete on its own: subject, grid, character, palette,
frames, style, delivery. The shared rules are repeated verbatim in all eight.

Two things outside the block, same for every sheet:

- Attach `docs/art/sheets/CO-070/hero_locomotion.jpg` as the style reference —
  it fixes the livery, camera height and proportions. Not the prop sheet.
- Negative-prompt field, if the tool has one:

  ```text
  text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, background colour, white background, drop shadow, blur, gradient, jpeg artifacts
  ```

## Background: transparent, not keyed

**Every sheet is a PNG with a real alpha channel, transparent everywhere the
character is not.** No magenta, no white, no fill.

`isPreKeyed` in `scripts/lib/spriteCut.mjs` detects the alpha and routes the
sheet through `alphaCell`: no colour to sample, no despill to undo, no halo
where a keyed edge used to be.

One failure mode to watch: some tools *draw* the grey checkerboard into the
pixels instead of writing alpha. That sheet is unusable — the negative prompt
bans it and every block names it.

## Where the finished sheets go

```
docs/art/sheets/CO-124/<filename>.png
```

Folder does not exist yet; create it with the first sheet. Filenames exactly as
the table gives them — `docs/art/sheets/manifest.json` points at
`CO-124/<filename>.png` and the cutter reads only the manifest.

Never JPEG: every JPEG sheet so far came back with ~130k unique colours and a
halo on every hard edge, and a halo on a 24 px character is most of the
character. JPEG also has no alpha.

Drop them in as they land, in any order. Tell me which arrived and I will
measure them, add manifest entries and run `npm run art:cut`.

## Reading as friendly, not as another enemy

The one acceptance criterion art alone decides. In every block three ways —
livery, banned colours, silhouette.

- **Livery is the player's own**: white `#F5F5F5`, crimson trim `#DC143C`, the
  hero's cloak colours. White and crimson on screen means friendly.
- **One element accent each**, no other strong colour: fire `#FF6D00`, ice
  `#40C4FF`, lightning `#FFEE58`, earth `#8D6E63` — the Phase 1 FX hexes, so a
  companion matches what it casts.
- **Never the enemy colours**: swarm `#FF5252`, runner `#FFB300`, brute
  `#8E1B1B`, boss `#9C27B0`.
- **Never the hero's silhouette**: he is tall, hooded, with a staff. None of the
  four is hooded and none carries a staff.
- **No claws, fangs, horns or spikes**; upright and open-shouldered. Every enemy
  is hunched or horned.

## Sizes

| # | File | Grid | Canvas | cell | art ≤ | Plays |
|---|---|---|---|---|---|---|
| 1 | `companion_fire_locomotion.png` | 6 × 4 | 1536 × 1024 | 256 | 150 | loop |
| 2 | `companion_fire_attack.png` | 4 × 4 | 1024 × 1024 | 256 | 150 | once |
| 3 | `companion_ice_locomotion.png` | 6 × 4 | 1536 × 1024 | 256 | 150 | loop |
| 4 | `companion_ice_attack.png` | 4 × 4 | 1024 × 1024 | 256 | 150 | once |
| 5 | `companion_lightning_locomotion.png` | 6 × 4 | 1536 × 1024 | 256 | 150 | loop |
| 6 | `companion_lightning_attack.png` | 4 × 4 | 1024 × 1024 | 256 | 150 | once |
| 7 | `companion_earth_locomotion.png` | 6 × 4 | 1536 × 1024 | 256 | 150 | loop |
| 8 | `companion_earth_attack.png` | 4 × 4 | 1024 × 1024 | 256 | 150 | once |

Every cell holds a frame — no blanks anywhere, on purpose: "leave this one
empty" is what made an earlier model write the word *empty* into the picture.

`cell` is the authored cell, chosen for drawing quality; 24 distinct poses at
128 px come back as mush. It is not the delivered frame size. The manifest
declares `sheetCell` 160, so the native frame is 40 px and the figure lands at
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

No hurt or death sheet: a companion is not damageable (#133), so it is never hit
and never dies on screen. Spawned when its slot is filled, removed at end of run.

Wiring — manifest entries, `animations.ts`, swapping `CompanionSpell` off the
placeholder disc — is the rest of #146, not this document.

---

## 1. `companion_fire_locomotion.png` — fire companion, idle and walking

Save as `docs/art/sheets/CO-124/companion_fire_locomotion.png`.

```text
Pixel-art animation sheet for a top-down 2D game: a small friendly ally who fights alongside the player, idle and walking, in four facings. Draw only this character — no player, no enemies, no ground.

Canvas 1536x1024: a grid of 256px square cells, 6 across and 4 down, 24 in all, read left to right, top row first. The figure is about 150px tall, centred in its cell, at least 50px clear of every cell edge.

Character: a short, stocky acolyte in a white tunic and short shoulder cape, #F5F5F5, crimson trim #DC143C at collar and hem, dark grey boots, bare-headed with cropped dark hair. Its right hand holds a short iron rod topped with a small caged lantern; the flame inside the cage is ember orange #FF6D00, and the same orange glows at its belt.

It must read as friendly at a glance: the white-and-crimson livery is the largest thing on it and ember orange the only other strong colour. Never the enemy colours #FF5252, #FFB300, #8E1B1B or #9C27B0. No claws, fangs, horns or spikes; upright and open-shouldered, not hunched. No hood and no staff — the player's own character is a tall hooded figure with a staff and the two must never be confused.

Rows are facings: row 1 down, face to the viewer; row 2 up, back of the head; row 3 left; row 4 right.

Cells 1-2 are an idle, cells 3-6 a walk. The idle is one breath — shoulders lift and settle, cape and lantern sway, feet still. The walk is one full cycle — left foot forward, feet together, right foot forward, feet together — with the leg change large enough to read at a glance.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from top-left; grim fantasy colour on the subject only; original design; match the attached reference.
Background: fully transparent — a real alpha channel, alpha 0 everywhere the character is not. No background colour, white, magenta, checkerboard or transparency grid painted as pixels, no shadow, glow or vignette.
Cells are a measurement, not something to draw: no tile, panel, line, border, divider or frame marks where one ends. No text anywhere — one letter, number or watermark ruins the sheet.
Each row faces only its own direction: head, weapon and feet point that way in every cell. No row is a copy, mirror or rotation of another; the left and right rows are separate drawings and the lantern stays in the same hand in both.
Every drawing stays inside its cell at the margin above and never touches an edge; draw it smaller rather than spill, the margin is measured on the delivered file. The feet land on the same line and the same spot in every cell of a row so the animation does not slide. Every cell holds a full drawing.
Deliver one lossless PNG with alpha, never JPEG, at the canvas size above or the whole canvas scaled down proportionally but never below half. Report the exact pixel size.
```

## 2. `companion_fire_attack.png` — fire companion shooting

Save as `docs/art/sheets/CO-124/companion_fire_attack.png`.

```text
Pixel-art animation sheet for a top-down 2D game: a small friendly ally who fights alongside the player, firing a shot, in four facings. Draw only this character — no player, no enemies, no ground.

Canvas 1024x1024: a grid of 256px square cells, 4 across and 4 down, 16 in all, read left to right, top row first. The figure is about 150px tall, centred in its cell, at least 50px clear of every cell edge.

Character: a short, stocky acolyte in a white tunic and short shoulder cape, #F5F5F5, crimson trim #DC143C at collar and hem, dark grey boots, bare-headed with cropped dark hair. Its right hand holds a short iron rod topped with a small caged lantern; the flame inside the cage is ember orange #FF6D00, and the same orange glows at its belt.

It must read as friendly at a glance: the white-and-crimson livery is the largest thing on it and ember orange the only other strong colour. Never the enemy colours #FF5252, #FFB300, #8E1B1B or #9C27B0. No claws, fangs, horns or spikes; upright and open-shouldered, not hunched. No hood and no staff — the player's own character is a tall hooded figure with a staff and the two must never be confused.

Rows are facings: row 1 down, face to the viewer; row 2 up, back of the head; row 3 left; row 4 right.

The four cells of a row are one shot in time order. 1: feet planted, lantern swung back beside the shoulder. 2: the flame swells and a bright ember gathers at the top of the cage. 3: the lantern thrusts forward at arm's length and the ember leaves the cage as a small bright spark at its mouth. 4: settling back, lantern low, flame small again.

The shot itself is not drawn — the game draws the bolt that flies out. Nothing travels away from the figure, crosses the cell or leaves it; the spark in cell 3 touches the lantern and goes no further.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from top-left; grim fantasy colour on the subject only; original design; match the attached reference.
Background: fully transparent — a real alpha channel, alpha 0 everywhere the character is not. No background colour, white, magenta, checkerboard or transparency grid painted as pixels, no shadow, glow or vignette.
Cells are a measurement, not something to draw: no tile, panel, line, border, divider or frame marks where one ends. No text anywhere — one letter, number or watermark ruins the sheet.
Each row faces only its own direction: head, weapon and feet point that way in every cell. No row is a copy, mirror or rotation of another; the left and right rows are separate drawings and the lantern stays in the same hand in both.
Every drawing stays inside its cell at the margin above and never touches an edge; draw it smaller rather than spill, the margin is measured on the delivered file. The feet land on the same line and the same spot in every cell of a row so the animation does not slide. Every cell holds a full drawing.
Deliver one lossless PNG with alpha, never JPEG, at the canvas size above or the whole canvas scaled down proportionally but never below half. Report the exact pixel size.
```

## 3. `companion_ice_locomotion.png` — ice companion, idle and walking

Save as `docs/art/sheets/CO-124/companion_ice_locomotion.png`.

```text
Pixel-art animation sheet for a top-down 2D game: a small friendly ally who fights alongside the player, idle and walking, in four facings. Draw only this character — no player, no enemies, no ground.

Canvas 1536x1024: a grid of 256px square cells, 6 across and 4 down, 24 in all, read left to right, top row first. The figure is about 150px tall, centred in its cell, at least 50px clear of every cell edge.

Character: a slim archer in a white tabard, #F5F5F5, crimson trim #DC143C at hem and sleeves, pale grey leggings and dark grey boots, bare-headed with pale hair in one long braid. Its left hand holds a short recurve bow cut from blue-white ice crystal, #40C4FF, and a small quiver of ice shards of the same colour hangs at its hip.

It must read as friendly at a glance: the white-and-crimson livery is the largest thing on it and ice blue the only other strong colour. Never the enemy colours #FF5252, #FFB300, #8E1B1B or #9C27B0. No claws, fangs, horns or spikes; upright and open-shouldered, not hunched. No hood and no staff — the player's own character is a tall hooded figure with a staff and the two must never be confused.

Rows are facings: row 1 down, face to the viewer; row 2 up, back of the head and the braid; row 3 left; row 4 right.

Cells 1-2 are an idle, cells 3-6 a walk. The idle is one breath — shoulders lift and settle, braid and bow sway, feet still. The walk is one full cycle — left foot forward, feet together, right foot forward, feet together — with the leg change large enough to read at a glance.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from top-left; grim fantasy colour on the subject only; original design; match the attached reference.
Background: fully transparent — a real alpha channel, alpha 0 everywhere the character is not. No background colour, white, magenta, checkerboard or transparency grid painted as pixels, no shadow, glow or vignette.
Cells are a measurement, not something to draw: no tile, panel, line, border, divider or frame marks where one ends. No text anywhere — one letter, number or watermark ruins the sheet.
Each row faces only its own direction: head, bow and feet point that way in every cell. No row is a copy, mirror or rotation of another; the left and right rows are separate drawings and the bow stays in the same hand in both.
Every drawing stays inside its cell at the margin above and never touches an edge; draw it smaller rather than spill, the margin is measured on the delivered file. The feet land on the same line and the same spot in every cell of a row so the animation does not slide. Every cell holds a full drawing.
Deliver one lossless PNG with alpha, never JPEG, at the canvas size above or the whole canvas scaled down proportionally but never below half. Report the exact pixel size.
```

## 4. `companion_ice_attack.png` — ice companion shooting

Save as `docs/art/sheets/CO-124/companion_ice_attack.png`.

```text
Pixel-art animation sheet for a top-down 2D game: a small friendly ally who fights alongside the player, loosing an arrow, in four facings. Draw only this character — no player, no enemies, no ground.

Canvas 1024x1024: a grid of 256px square cells, 4 across and 4 down, 16 in all, read left to right, top row first. The figure is about 150px tall, centred in its cell, at least 50px clear of every cell edge.

Character: a slim archer in a white tabard, #F5F5F5, crimson trim #DC143C at hem and sleeves, pale grey leggings and dark grey boots, bare-headed with pale hair in one long braid. Its left hand holds a short recurve bow cut from blue-white ice crystal, #40C4FF, and a small quiver of ice shards of the same colour hangs at its hip.

It must read as friendly at a glance: the white-and-crimson livery is the largest thing on it and ice blue the only other strong colour. Never the enemy colours #FF5252, #FFB300, #8E1B1B or #9C27B0. No claws, fangs, horns or spikes; upright and open-shouldered, not hunched. No hood and no staff — the player's own character is a tall hooded figure with a staff and the two must never be confused.

Rows are facings: row 1 down, face to the viewer; row 2 up, back of the head and the braid; row 3 left; row 4 right.

The four cells of a row are one shot in time order. 1: the bow lifts and a shard is laid on the string. 2: the string draws back to the cheek and the shard grows into a bright crystal arrow. 3: the loose — string forward, arms open, a small bright flash at the bow itself. 4: the bow lowers and the string settles.

The arrow in flight is not drawn — the game draws the bolt that flies out. Nothing travels away from the figure, crosses the cell or leaves it; the flash in cell 3 touches the bow and goes no further.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from top-left; grim fantasy colour on the subject only; original design; match the attached reference.
Background: fully transparent — a real alpha channel, alpha 0 everywhere the character is not. No background colour, white, magenta, checkerboard or transparency grid painted as pixels, no shadow, glow or vignette.
Cells are a measurement, not something to draw: no tile, panel, line, border, divider or frame marks where one ends. No text anywhere — one letter, number or watermark ruins the sheet.
Each row faces only its own direction: head, bow and feet point that way in every cell. No row is a copy, mirror or rotation of another; the left and right rows are separate drawings and the bow stays in the same hand in both.
Every drawing stays inside its cell at the margin above and never touches an edge; draw it smaller rather than spill, the margin is measured on the delivered file. The feet land on the same line and the same spot in every cell of a row so the animation does not slide. Every cell holds a full drawing.
Deliver one lossless PNG with alpha, never JPEG, at the canvas size above or the whole canvas scaled down proportionally but never below half. Report the exact pixel size.
```

## 5. `companion_lightning_locomotion.png` — lightning companion, idle and walking

Save as `docs/art/sheets/CO-124/companion_lightning_locomotion.png`.

```text
Pixel-art animation sheet for a top-down 2D game: a small friendly ally who fights alongside the player, idle and walking, in four facings. Draw only this character — no player, no enemies, no ground.

Canvas 1536x1024: a grid of 256px square cells, 6 across and 4 down, 24 in all, read left to right, top row first. The figure is about 150px tall, centred in its cell, at least 50px clear of every cell edge.

Character: a lean, wiry squire in a white tabard, #F5F5F5, over a charcoal jerkin, crimson trim #DC143C at hem and shoulders, dark grey boots, bare-headed with short hair standing on end. It holds a short straight blade in each hand; the blades are pale yellow lightning, #FFEE58, with a white core, and a few small arcs of the same yellow jump between its shoulders.

It must read as friendly at a glance: the white-and-crimson livery is the largest thing on it and lightning yellow the only other strong colour. Never the enemy colours #FF5252, #FFB300, #8E1B1B or #9C27B0. No claws, fangs, horns or spikes; upright and open-shouldered, not hunched. No hood and no staff — the player's own character is a tall hooded figure with a staff and the two must never be confused.

Rows are facings: row 1 down, face to the viewer; row 2 up, back of the head; row 3 left; row 4 right.

Cells 1-2 are an idle, cells 3-6 a walk. The idle is one breath — shoulders lift and settle, blades dip, the arcs jump off a different part of each blade, feet still. The walk is one full cycle — left foot forward, feet together, right foot forward, feet together — with the leg change large enough to read at a glance.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from top-left; grim fantasy colour on the subject only; original design; match the attached reference.
Background: fully transparent — a real alpha channel, alpha 0 everywhere the character is not. No background colour, white, magenta, checkerboard or transparency grid painted as pixels, no shadow, glow or vignette.
Cells are a measurement, not something to draw: no tile, panel, line, border, divider or frame marks where one ends. No text anywhere — one letter, number or watermark ruins the sheet.
Each row faces only its own direction: head, blades and feet point that way in every cell. No row is a copy, mirror or rotation of another; the left and right rows are separate drawings and the same blade leads in both.
Every drawing stays inside its cell at the margin above and never touches an edge; draw it smaller rather than spill, the margin is measured on the delivered file. The feet land on the same line and the same spot in every cell of a row so the animation does not slide. Every cell holds a full drawing.
Deliver one lossless PNG with alpha, never JPEG, at the canvas size above or the whole canvas scaled down proportionally but never below half. Report the exact pixel size.
```

## 6. `companion_lightning_attack.png` — lightning companion striking

Save as `docs/art/sheets/CO-124/companion_lightning_attack.png`.

```text
Pixel-art animation sheet for a top-down 2D game: a small friendly ally who fights alongside the player, striking with two blades, in four facings. Draw only this character — no player, no enemies, no ground.

Canvas 1024x1024: a grid of 256px square cells, 4 across and 4 down, 16 in all, read left to right, top row first. The figure is about 150px tall, centred in its cell, at least 50px clear of every cell edge.

Character: a lean, wiry squire in a white tabard, #F5F5F5, over a charcoal jerkin, crimson trim #DC143C at hem and shoulders, dark grey boots, bare-headed with short hair standing on end. It holds a short straight blade in each hand; the blades are pale yellow lightning, #FFEE58, with a white core, and a few small arcs of the same yellow jump between its shoulders.

It must read as friendly at a glance: the white-and-crimson livery is the largest thing on it and lightning yellow the only other strong colour. Never the enemy colours #FF5252, #FFB300, #8E1B1B or #9C27B0. No claws, fangs, horns or spikes; upright and open-shouldered, not hunched. No hood and no staff — the player's own character is a tall hooded figure with a staff and the two must never be confused.

Rows are facings: row 1 down, face to the viewer; row 2 up, back of the head; row 3 left; row 4 right.

The four cells of a row are one strike in time order. 1: a crouch, both blades drawn back, the lightning on them brightening. 2: a step forward into the row's facing, leading blade rising. 3: the hit — both blades sweep across in front and leave one short bright arc of lightning hanging just past the hands. 4: a guard, blades low, lightning dim again.

Nothing struck is drawn — the game draws the enemy and the hit. Nothing is drawn where a target would be; the swing and its arc stay within arm's reach and never cross the cell or touch its edge.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from top-left; grim fantasy colour on the subject only; original design; match the attached reference.
Background: fully transparent — a real alpha channel, alpha 0 everywhere the character is not. No background colour, white, magenta, checkerboard or transparency grid painted as pixels, no shadow, glow or vignette.
Cells are a measurement, not something to draw: no tile, panel, line, border, divider or frame marks where one ends. No text anywhere — one letter, number or watermark ruins the sheet.
Each row faces only its own direction: head, blades and feet point that way in every cell. No row is a copy, mirror or rotation of another; the left and right rows are separate drawings and the same blade leads in both.
Every drawing stays inside its cell at the margin above and never touches an edge; draw it smaller rather than spill, the margin is measured on the delivered file. The feet land on the same line and the same spot in every cell of a row so the animation does not slide. Every cell holds a full drawing.
Deliver one lossless PNG with alpha, never JPEG, at the canvas size above or the whole canvas scaled down proportionally but never below half. Report the exact pixel size.
```

## 7. `companion_earth_locomotion.png` — earth companion, idle and walking

Save as `docs/art/sheets/CO-124/companion_earth_locomotion.png`.

```text
Pixel-art animation sheet for a top-down 2D game: a small friendly ally who fights alongside the player, idle and walking, in four facings. Draw only this character — no player, no enemies, no ground.

Canvas 1536x1024: a grid of 256px square cells, 6 across and 4 down, 24 in all, read left to right, top row first. The figure is about 150px tall, centred in its cell, at least 50px clear of every cell edge.

Character: a squat, round-shouldered guardian carved from pale stone, #F5F5F5, with the brown-grey of raw rock, #8D6E63, at its joints and along the seams of its arms. A crimson sash, #DC143C, is tied across its chest. It carries no weapon — its hands are two oversized stone fists. Its head is a smooth rounded block with two small warm-lit eyes and no mouth.

It must read as friendly at a glance: the pale stone and crimson sash are the largest things on it and rock brown the only other strong colour. Never the enemy colours #FF5252, #FFB300, #8E1B1B or #9C27B0. No claws, fangs, horns or spikes — its edges are worn round, not jagged. Upright and open-shouldered, not hunched. No hood and no staff — the player's own character is a tall hooded figure with a staff and the two must never be confused.

Rows are facings: row 1 down, eyes to the viewer; row 2 up, back of the head; row 3 left; row 4 right.

Cells 1-2 are an idle, cells 3-6 a walk. The idle is one slow settle — shoulders drop and rise, the sash sways, feet still. The walk is one full cycle — left foot forward, feet together, right foot forward, feet together — heavy and flat-footed, with the leg change large enough to read at a glance.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from top-left; grim fantasy colour on the subject only; original design; match the attached reference.
Background: fully transparent — a real alpha channel, alpha 0 everywhere the character is not. No background colour, white, magenta, checkerboard or transparency grid painted as pixels, no shadow, glow or vignette.
Cells are a measurement, not something to draw: no tile, panel, line, border, divider or frame marks where one ends. No text anywhere — one letter, number or watermark ruins the sheet.
Each row faces only its own direction: head, hands and feet point that way in every cell. No row is a copy, mirror or rotation of another; the left and right rows are separate drawings and the sash is knotted on the same side in both.
Every drawing stays inside its cell at the margin above and never touches an edge; draw it smaller rather than spill, the margin is measured on the delivered file. The feet land on the same line and the same spot in every cell of a row so the animation does not slide. Every cell holds a full drawing.
Deliver one lossless PNG with alpha, never JPEG, at the canvas size above or the whole canvas scaled down proportionally but never below half. Report the exact pixel size.
```

## 8. `companion_earth_attack.png` — earth companion slamming

Save as `docs/art/sheets/CO-124/companion_earth_attack.png`.

```text
Pixel-art animation sheet for a top-down 2D game: a small friendly ally who fights alongside the player, slamming both fists down, in four facings. Draw only this character — no player, no enemies, no ground.

Canvas 1024x1024: a grid of 256px square cells, 4 across and 4 down, 16 in all, read left to right, top row first. The figure is about 150px tall, centred in its cell, at least 50px clear of every cell edge.

Character: a squat, round-shouldered guardian carved from pale stone, #F5F5F5, with the brown-grey of raw rock, #8D6E63, at its joints and along the seams of its arms. A crimson sash, #DC143C, is tied across its chest. It carries no weapon — its hands are two oversized stone fists. Its head is a smooth rounded block with two small warm-lit eyes and no mouth.

It must read as friendly at a glance: the pale stone and crimson sash are the largest things on it and rock brown the only other strong colour. Never the enemy colours #FF5252, #FFB300, #8E1B1B or #9C27B0. No claws, fangs, horns or spikes — its edges are worn round, not jagged. Upright and open-shouldered, not hunched. No hood and no staff — the player's own character is a tall hooded figure with a staff and the two must never be confused.

Rows are facings: row 1 down, eyes to the viewer; row 2 up, back of the head; row 3 left; row 4 right.

The four cells of a row are one slam in time order. 1: both feet planted, both fists raised over the head, the shoulder seams opening as they lift. 2: held at the top of the wind-up, leaning back, the rock brown at the seams glowing a little. 3: both fists driven down in front and a few small chips of stone jumping up around them. 4: straightened back up, fists low, chips gone.

Nothing struck is drawn — the game draws the enemy and the hit. Nothing is drawn where a target would be; the fists and the chips stay within arm's reach and never cross the cell or touch its edge.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from top-left; grim fantasy colour on the subject only; original design; match the attached reference.
Background: fully transparent — a real alpha channel, alpha 0 everywhere the character is not. No background colour, white, magenta, checkerboard or transparency grid painted as pixels, no shadow, glow or vignette.
Cells are a measurement, not something to draw: no tile, panel, line, border, divider or frame marks where one ends. No text anywhere — one letter, number or watermark ruins the sheet.
Each row faces only its own direction: head, hands and feet point that way in every cell. No row is a copy, mirror or rotation of another; the left and right rows are separate drawings and the sash is knotted on the same side in both.
Every drawing stays inside its cell at the margin above and never touches an edge; draw it smaller rather than spill, the margin is measured on the delivered file. The feet land on the same line and the same spot in every cell of a row so the animation does not slide. Every cell holds a full drawing.
Deliver one lossless PNG with alpha, never JPEG, at the canvas size above or the whole canvas scaled down proportionally but never below half. Report the exact pixel size.
```

## Done when

All eight sheets are delivered at the grids above, as PNGs with a real alpha
channel, and measured against the delivered pixels. Manifest entries, the cut
and the engine wiring are the rest of #146 and land separately.
