# CO-124 Art: companion character sheets

Ticket: [#146](https://github.com/danhquach/crimsononslaught/issues/146) · Epic: [#122](https://github.com/danhquach/crimsononslaught/issues/122) · Spec: `docs/superpowers/specs/2026-09-18-phase2-spells.md` §9, §10

Eight sheets: a locomotion sheet and an attack sheet for each of the four
companions. **One sheet per run**, so a bad one is redone on its own and never
takes its pair down with it.

These are the only characters in the game on the player's side. Everything else
that moves is an enemy, so the whole point of the set is that it does not read
as one.

## What they replace

`src/config/colors.ts` draws all four companions today as one green disc, 24 px
across, and says so in place: *"Green so an ally never reads as an enemy at a
glance."* That green is the placeholder's entire friendly read. These sheets
have to carry it with drawing instead, which is what the palette contract below
is for.

## How to run this

**Copy the whole `text` block under a sheet's heading — everything between the
two ``` lines — and paste it as the prompt. Nothing else to add.** Each block is
complete on its own: subject, canvas and grid, character, palette, frames, style
and delivery. The style and grid rules are repeated word for word in all eight
blocks on purpose, so there is never a second thing to remember to paste.

Two things that live outside the block, the same for every sheet:

- Attach `docs/art/sheets/CO-070/hero_locomotion.jpg` as the style reference.
  Not the prop sheet: these are characters in the player's own livery, and the
  hero sheet is the one that fixes the livery, the camera height and the
  proportions they have to match.
- If the tool has a negative-prompt field, paste this into it:

  ```text
  text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, drop shadow, blur, gradient, jpeg artifacts
  ```

Then save the result as **PNG** under the filename the heading gives, and keep
the pixel size the tool reports.

## Where to put the finished sheets

```
docs/art/sheets/CO-124/<filename>.png
```

Filenames are the ones in the table below, exactly —
`docs/art/sheets/manifest.json` will point at `CO-124/<filename>.png`, and the
cutter reads only the manifest. PNG, not JPEG: every JPEG sheet so far came back
with ~130k unique colours and a halo on every hard edge, and a halo on a 24 px
character is most of the character.

Drop them in as they come; they do not have to arrive together. Tell me which
ones landed and I will measure them, add the manifest entries and run
`npm run art:cut`.

## Reading as friendly, not as another enemy

This is the acceptance criterion that art alone decides, so it is written into
every block three ways: the livery, the banned colours, and the silhouette.

- **The livery is the player's own.** White, hex `#F5F5F5`, with crimson trim,
  hex `#DC143C` — the hero's cloak colours, worn by all four so they read as one
  household. Anything on screen wearing white and crimson is on your side.
- **One element accent each**, and no other strong colour: fire `#FF6D00`, ice
  `#40C4FF`, lightning `#FFEE58`, earth `#8D6E63`. These are the same hexes the
  Phase 1 FX sheets use, so a companion matches the effects it produces.
- **Never the enemy colours**: the swarm's bright red `#FF5252`, the runner's
  amber `#FFB300`, the brute's dark red `#8E1B1B`, the boss's violet `#9C27B0`.
  Each block names all four and forbids them.
- **Never the hero's own silhouette either.** The hero is a tall hooded figure
  with a staff. None of the four is hooded and none carries a staff, so at 24 px
  the player can still find himself in the crowd.
- **No claws, fangs, horns or spikes**, and an upright, open-shouldered stance
  rather than a hunched one. Every enemy in the game is hunched or horned.

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

Every cell of every sheet holds a frame. There are no blank cells anywhere in
this ticket, on purpose: "leave this one empty" is what made an earlier model
write the word *empty* into the picture.

`cell` above is the authored cell, chosen for drawing quality — twenty-four
distinct poses at a 128 px cell come back as mush. It is not the size the frames
end up at. The manifest will declare `sheetCell` 160, so the cutter's native
frame is 40 px and the figure inside it lands at about 24 px, which is the size
the placeholder disc holds today. The two numbers are independent: the cutter
divides the delivered image by `cols × rows` and never looks at the authored
cell size, which is also why a delivery that comes back at some other canvas
size is fine as long as the grid is still 6 × 4 or 4 × 4.

Cut at 40 px native, the set is 160 frames — 4 companions × (24 + 16) — for
about 256k native pixels, roughly a third of what CO-123 added. The atlas runs
four pages today and each carries its own 400 KB budget
([#173](https://github.com/danhquach/crimsononslaught/issues/173)), so these
take a fifth page of their own rather than crowding one of the four. Pages have
their own palettes, so putting them on a new page also leaves the existing
sheets' exact pixel colours untouched.

## What the engine will do with them

Manifest keys `companionFire`, `companionIce`, `companionLightning`,
`companionEarth`, one per pair. The row layout is the hero's, so
`facings()` in `src/config/animations.ts` applies unchanged:

| Sheet | Rows | Animations |
|---|---|---|
| `_locomotion` | down, up, left, right | `idle` cols 1–2 (loop), `move` cols 3–6 (loop) |
| `_attack` | down, up, left, right | `attack` cols 1–4 (once) |

There is no hurt or death sheet, which is what the hero has and these do not:
a companion is not damageable (#133), so it is never hit and never dies on
screen. It is spawned when its slot is filled and removed at the end of a run.

Wiring them up — manifest entries, `animations.ts`, and swapping
`CompanionSpell` off the placeholder disc — is the rest of #146 and not in this
document.

---

## 1. `companion_fire_locomotion.png` — the fire companion, idle and walking

Save as `docs/art/sheets/CO-124/companion_fire_locomotion.png`. Copy the whole block below; it is the complete prompt.

```text
Create one pixel-art animation sheet for a top-down 2D game: a small friendly ally who fights alongside the player, standing still and walking, in four facings. Draw only this one character, no player, no enemies and no ground.

The canvas is 1536 by 1024 pixels, a grid of 256 pixel square cells, six cells across and four cells down, so there are twenty-four cells in total. They read left to right along each row, and the rows read from the top down. The figure is about 150 pixels tall and stands in the middle of its cell, which leaves at least 50 pixels of plain magenta between the drawing and every cell edge.

The character is a short, stocky acolyte in a white tunic and short shoulder cape, hex #F5F5F5, with crimson trim, hex #DC143C, at the collar and the hem, over dark grey boots. It is bare-headed with cropped dark hair. In its right hand it carries a short iron rod topped with a small caged lantern, and the flame burning inside the cage is bright ember orange, hex #FF6D00. The same orange glows at its belt.

This character is on the player's side and has to read that way across a crowded arena, so the white and crimson livery is the largest thing about it and ember orange is the only other strong colour on it. It never wears the enemies' colours: not bright red #FF5252, not amber #FFB300, not dark red #8E1B1B, not violet #9C27B0. It has no claws, fangs, horns or spikes, and it stands upright with open shoulders rather than hunched. It wears no hood and carries no staff, because the player's own character is a tall hooded figure with a staff and the two must never be confused.

The four rows are the four facings. Row one faces down, towards the viewer, so the face is visible. Row two faces up, away from the viewer, so the back of the head is visible. Row three faces left. Row four faces right.

In every row the first two cells are an idle and the last four are a walk. The two idle cells are one small breath: the shoulders lift and settle, the cape and the lantern sway a little, and the feet do not move. The four walk cells are one full step cycle — left foot forward, then feet together, then right foot forward, then feet together — and the change of legs is large enough to read at a glance.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Each row is drawn in the facing it is given and in no other: the head, the weapon and the feet all point that way in every cell of that row. No row is a copy, a mirror or a rotation of another row — the left row and the right row are two separate drawings, and the character holds its weapon in the same hand in both.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. The feet stand on the same line and at the same point in every cell of a row, so the animation does not slide or jitter, and every cell holds a full drawing.
Deliver one lossless PNG, not JPEG, at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```

## 2. `companion_fire_attack.png` — the fire companion shooting

Save as `docs/art/sheets/CO-124/companion_fire_attack.png`. Copy the whole block below; it is the complete prompt.

```text
Create one pixel-art animation sheet for a top-down 2D game: a small friendly ally who fights alongside the player, firing a shot, in four facings. Draw only this one character, no player, no enemies and no ground.

The canvas is 1024 by 1024 pixels, a grid of 256 pixel square cells, four cells across and four cells down, so there are sixteen cells in total. They read left to right along each row, and the rows read from the top down. The figure is about 150 pixels tall and stands in the middle of its cell, which leaves at least 50 pixels of plain magenta between the drawing and every cell edge.

The character is a short, stocky acolyte in a white tunic and short shoulder cape, hex #F5F5F5, with crimson trim, hex #DC143C, at the collar and the hem, over dark grey boots. It is bare-headed with cropped dark hair. In its right hand it carries a short iron rod topped with a small caged lantern, and the flame burning inside the cage is bright ember orange, hex #FF6D00. The same orange glows at its belt.

This character is on the player's side and has to read that way across a crowded arena, so the white and crimson livery is the largest thing about it and ember orange is the only other strong colour on it. It never wears the enemies' colours: not bright red #FF5252, not amber #FFB300, not dark red #8E1B1B, not violet #9C27B0. It has no claws, fangs, horns or spikes, and it stands upright with open shoulders rather than hunched. It wears no hood and carries no staff, because the player's own character is a tall hooded figure with a staff and the two must never be confused.

The four rows are the four facings. Row one faces down, towards the viewer, so the face is visible. Row two faces up, away from the viewer, so the back of the head is visible. Row three faces left. Row four faces right.

The four cells of a row are one shot, in time order. One: it plants its feet and swings the lantern back beside its shoulder. Two: the flame swells and a bright ember gathers at the top of the cage. Three: it thrusts the lantern forward at arm's length and the ember leaves the cage as a small bright spark sitting right at the lantern's mouth. Four: it settles back with the lantern low and the flame small again.

The shot itself is not drawn on this sheet. The game draws the bolt that flies out, so nothing is drawn travelling away from the figure, crossing the cell or leaving it; the spark in the third cell touches the lantern and goes no further.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Each row is drawn in the facing it is given and in no other: the head, the weapon and the feet all point that way in every cell of that row. No row is a copy, a mirror or a rotation of another row — the left row and the right row are two separate drawings, and the character holds its weapon in the same hand in both.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. The feet stand on the same line and at the same point in every cell of a row, so the animation does not slide or jitter, and every cell holds a full drawing.
Deliver one lossless PNG, not JPEG, at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```

## 3. `companion_ice_locomotion.png` — the ice companion, idle and walking

Save as `docs/art/sheets/CO-124/companion_ice_locomotion.png`. Copy the whole block below; it is the complete prompt.

```text
Create one pixel-art animation sheet for a top-down 2D game: a small friendly ally who fights alongside the player, standing still and walking, in four facings. Draw only this one character, no player, no enemies and no ground.

The canvas is 1536 by 1024 pixels, a grid of 256 pixel square cells, six cells across and four cells down, so there are twenty-four cells in total. They read left to right along each row, and the rows read from the top down. The figure is about 150 pixels tall and stands in the middle of its cell, which leaves at least 50 pixels of plain magenta between the drawing and every cell edge.

The character is a slim archer in a white tabard, hex #F5F5F5, with crimson trim, hex #DC143C, at the hem and the sleeves, over pale grey leggings and dark grey boots. It is bare-headed and wears its pale hair in one long braid. In its left hand it carries a short recurve bow cut from blue-white ice crystal, hex #40C4FF, and a small quiver of ice shards of the same colour hangs at its hip.

This character is on the player's side and has to read that way across a crowded arena, so the white and crimson livery is the largest thing about it and ice blue is the only other strong colour on it. It never wears the enemies' colours: not bright red #FF5252, not amber #FFB300, not dark red #8E1B1B, not violet #9C27B0. It has no claws, fangs, horns or spikes, and it stands upright with open shoulders rather than hunched. It wears no hood and carries no staff, because the player's own character is a tall hooded figure with a staff and the two must never be confused.

The four rows are the four facings. Row one faces down, towards the viewer, so the face is visible. Row two faces up, away from the viewer, so the back of the head and the braid are visible. Row three faces left. Row four faces right.

In every row the first two cells are an idle and the last four are a walk. The two idle cells are one small breath: the shoulders lift and settle, the braid and the bow sway a little, and the feet do not move. The four walk cells are one full step cycle — left foot forward, then feet together, then right foot forward, then feet together — and the change of legs is large enough to read at a glance.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Each row is drawn in the facing it is given and in no other: the head, the weapon and the feet all point that way in every cell of that row. No row is a copy, a mirror or a rotation of another row — the left row and the right row are two separate drawings, and the character holds its weapon in the same hand in both.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. The feet stand on the same line and at the same point in every cell of a row, so the animation does not slide or jitter, and every cell holds a full drawing.
Deliver one lossless PNG, not JPEG, at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```

## 4. `companion_ice_attack.png` — the ice companion shooting

Save as `docs/art/sheets/CO-124/companion_ice_attack.png`. Copy the whole block below; it is the complete prompt.

```text
Create one pixel-art animation sheet for a top-down 2D game: a small friendly ally who fights alongside the player, loosing an arrow, in four facings. Draw only this one character, no player, no enemies and no ground.

The canvas is 1024 by 1024 pixels, a grid of 256 pixel square cells, four cells across and four cells down, so there are sixteen cells in total. They read left to right along each row, and the rows read from the top down. The figure is about 150 pixels tall and stands in the middle of its cell, which leaves at least 50 pixels of plain magenta between the drawing and every cell edge.

The character is a slim archer in a white tabard, hex #F5F5F5, with crimson trim, hex #DC143C, at the hem and the sleeves, over pale grey leggings and dark grey boots. It is bare-headed and wears its pale hair in one long braid. In its left hand it carries a short recurve bow cut from blue-white ice crystal, hex #40C4FF, and a small quiver of ice shards of the same colour hangs at its hip.

This character is on the player's side and has to read that way across a crowded arena, so the white and crimson livery is the largest thing about it and ice blue is the only other strong colour on it. It never wears the enemies' colours: not bright red #FF5252, not amber #FFB300, not dark red #8E1B1B, not violet #9C27B0. It has no claws, fangs, horns or spikes, and it stands upright with open shoulders rather than hunched. It wears no hood and carries no staff, because the player's own character is a tall hooded figure with a staff and the two must never be confused.

The four rows are the four facings. Row one faces down, towards the viewer, so the face is visible. Row two faces up, away from the viewer, so the back of the head and the braid are visible. Row three faces left. Row four faces right.

The four cells of a row are one shot, in time order. One: it lifts the bow and lays a shard on the string. Two: it draws the string back to its cheek and the shard grows into a bright crystal arrow. Three: it looses — the string is forward, the arms are open, and a small bright flash sits at the bow itself. Four: it lowers the bow and the string settles.

The arrow in flight is not drawn on this sheet. The game draws the bolt that flies out, so nothing is drawn travelling away from the figure, crossing the cell or leaving it; the flash in the third cell touches the bow and goes no further.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Each row is drawn in the facing it is given and in no other: the head, the weapon and the feet all point that way in every cell of that row. No row is a copy, a mirror or a rotation of another row — the left row and the right row are two separate drawings, and the character holds its weapon in the same hand in both.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. The feet stand on the same line and at the same point in every cell of a row, so the animation does not slide or jitter, and every cell holds a full drawing.
Deliver one lossless PNG, not JPEG, at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```

## 5. `companion_lightning_locomotion.png` — the lightning companion, idle and walking

Save as `docs/art/sheets/CO-124/companion_lightning_locomotion.png`. Copy the whole block below; it is the complete prompt.

```text
Create one pixel-art animation sheet for a top-down 2D game: a small friendly ally who fights alongside the player, standing still and walking, in four facings. Draw only this one character, no player, no enemies and no ground.

The canvas is 1536 by 1024 pixels, a grid of 256 pixel square cells, six cells across and four cells down, so there are twenty-four cells in total. They read left to right along each row, and the rows read from the top down. The figure is about 150 pixels tall and stands in the middle of its cell, which leaves at least 50 pixels of plain magenta between the drawing and every cell edge.

The character is a lean, wiry squire in a white tabard, hex #F5F5F5, worn over a charcoal jerkin, with crimson trim, hex #DC143C, at the hem and the shoulders, and dark grey boots. It is bare-headed and its short hair stands on end. It holds a short straight blade in each hand, and the blades are pale yellow lightning, hex #FFEE58, with a white core; a few small arcs of the same yellow jump between its shoulders.

This character is on the player's side and has to read that way across a crowded arena, so the white and crimson livery is the largest thing about it and lightning yellow is the only other strong colour on it. It never wears the enemies' colours: not bright red #FF5252, not amber #FFB300, not dark red #8E1B1B, not violet #9C27B0. It has no claws, fangs, horns or spikes, and it stands upright with open shoulders rather than hunched. It wears no hood and carries no staff, because the player's own character is a tall hooded figure with a staff and the two must never be confused.

The four rows are the four facings. Row one faces down, towards the viewer, so the face is visible. Row two faces up, away from the viewer, so the back of the head is visible. Row three faces left. Row four faces right.

In every row the first two cells are an idle and the last four are a walk. The two idle cells are one small breath: the shoulders lift and settle, the blades dip a little, the arcs jump off a different part of each blade, and the feet do not move. The four walk cells are one full step cycle — left foot forward, then feet together, then right foot forward, then feet together — and the change of legs is large enough to read at a glance.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Each row is drawn in the facing it is given and in no other: the head, the weapon and the feet all point that way in every cell of that row. No row is a copy, a mirror or a rotation of another row — the left row and the right row are two separate drawings, and the character holds its weapon in the same hand in both.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. The feet stand on the same line and at the same point in every cell of a row, so the animation does not slide or jitter, and every cell holds a full drawing.
Deliver one lossless PNG, not JPEG, at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```

## 6. `companion_lightning_attack.png` — the lightning companion striking

Save as `docs/art/sheets/CO-124/companion_lightning_attack.png`. Copy the whole block below; it is the complete prompt.

```text
Create one pixel-art animation sheet for a top-down 2D game: a small friendly ally who fights alongside the player, striking with two blades, in four facings. Draw only this one character, no player, no enemies and no ground.

The canvas is 1024 by 1024 pixels, a grid of 256 pixel square cells, four cells across and four cells down, so there are sixteen cells in total. They read left to right along each row, and the rows read from the top down. The figure is about 150 pixels tall and stands in the middle of its cell, which leaves at least 50 pixels of plain magenta between the drawing and every cell edge.

The character is a lean, wiry squire in a white tabard, hex #F5F5F5, worn over a charcoal jerkin, with crimson trim, hex #DC143C, at the hem and the shoulders, and dark grey boots. It is bare-headed and its short hair stands on end. It holds a short straight blade in each hand, and the blades are pale yellow lightning, hex #FFEE58, with a white core; a few small arcs of the same yellow jump between its shoulders.

This character is on the player's side and has to read that way across a crowded arena, so the white and crimson livery is the largest thing about it and lightning yellow is the only other strong colour on it. It never wears the enemies' colours: not bright red #FF5252, not amber #FFB300, not dark red #8E1B1B, not violet #9C27B0. It has no claws, fangs, horns or spikes, and it stands upright with open shoulders rather than hunched. It wears no hood and carries no staff, because the player's own character is a tall hooded figure with a staff and the two must never be confused.

The four rows are the four facings. Row one faces down, towards the viewer, so the face is visible. Row two faces up, away from the viewer, so the back of the head is visible. Row three faces left. Row four faces right.

The four cells of a row are one strike, in time order. One: it drops into a crouch with both blades drawn back and the lightning on them brightening. Two: it leans a step forward into the row's facing with the leading blade rising. Three: the strike lands — both blades sweep across in front of it and leave one short bright arc of lightning hanging in the air just past its hands. Four: it recovers to a guard with the blades low and the lightning dim again.

Nothing struck is drawn on this sheet. The game draws the enemy and the hit, so nothing is drawn where a target would be; the swing and its arc stay within the character's own arm's reach and never cross the cell or touch its edge.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Each row is drawn in the facing it is given and in no other: the head, the weapon and the feet all point that way in every cell of that row. No row is a copy, a mirror or a rotation of another row — the left row and the right row are two separate drawings, and the character holds its weapon in the same hand in both.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. The feet stand on the same line and at the same point in every cell of a row, so the animation does not slide or jitter, and every cell holds a full drawing.
Deliver one lossless PNG, not JPEG, at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```

## 7. `companion_earth_locomotion.png` — the earth companion, idle and walking

Save as `docs/art/sheets/CO-124/companion_earth_locomotion.png`. Copy the whole block below; it is the complete prompt.

```text
Create one pixel-art animation sheet for a top-down 2D game: a small friendly ally who fights alongside the player, standing still and walking, in four facings. Draw only this one character, no player, no enemies and no ground.

The canvas is 1536 by 1024 pixels, a grid of 256 pixel square cells, six cells across and four cells down, so there are twenty-four cells in total. They read left to right along each row, and the rows read from the top down. The figure is about 150 pixels tall and stands in the middle of its cell, which leaves at least 50 pixels of plain magenta between the drawing and every cell edge.

The character is a squat, round-shouldered guardian carved from pale stone, hex #F5F5F5, with the brown-grey of raw rock, hex #8D6E63, showing at its joints and along the seams of its arms. A crimson sash, hex #DC143C, is tied across its chest. It carries no weapon: its hands are two oversized stone fists. Its head is a smooth rounded block with two small warm-lit eyes and no mouth.

This character is on the player's side and has to read that way across a crowded arena, so the pale stone and the crimson sash are the largest things about it and rock brown is the only other strong colour on it. It never wears the enemies' colours: not bright red #FF5252, not amber #FFB300, not dark red #8E1B1B, not violet #9C27B0. It has no claws, fangs, horns or spikes — its edges are worn round rather than jagged — and it stands upright with open shoulders rather than hunched. It wears no hood and carries no staff, because the player's own character is a tall hooded figure with a staff and the two must never be confused.

The four rows are the four facings. Row one faces down, towards the viewer, so the eyes are visible. Row two faces up, away from the viewer, so the back of the head is visible. Row three faces left. Row four faces right.

In every row the first two cells are an idle and the last four are a walk. The two idle cells are one slow settle: the shoulders drop and rise, the sash sways a little, and the feet do not move. The four walk cells are one full step cycle — left foot forward, then feet together, then right foot forward, then feet together — heavy and flat-footed, and the change of legs is large enough to read at a glance.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Each row is drawn in the facing it is given and in no other: the head, the hands and the feet all point that way in every cell of that row. No row is a copy, a mirror or a rotation of another row — the left row and the right row are two separate drawings, and the sash is knotted on the same side in both.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. The feet stand on the same line and at the same point in every cell of a row, so the animation does not slide or jitter, and every cell holds a full drawing.
Deliver one lossless PNG, not JPEG, at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```

## 8. `companion_earth_attack.png` — the earth companion slamming

Save as `docs/art/sheets/CO-124/companion_earth_attack.png`. Copy the whole block below; it is the complete prompt.

```text
Create one pixel-art animation sheet for a top-down 2D game: a small friendly ally who fights alongside the player, slamming down with both fists, in four facings. Draw only this one character, no player, no enemies and no ground.

The canvas is 1024 by 1024 pixels, a grid of 256 pixel square cells, four cells across and four cells down, so there are sixteen cells in total. They read left to right along each row, and the rows read from the top down. The figure is about 150 pixels tall and stands in the middle of its cell, which leaves at least 50 pixels of plain magenta between the drawing and every cell edge.

The character is a squat, round-shouldered guardian carved from pale stone, hex #F5F5F5, with the brown-grey of raw rock, hex #8D6E63, showing at its joints and along the seams of its arms. A crimson sash, hex #DC143C, is tied across its chest. It carries no weapon: its hands are two oversized stone fists. Its head is a smooth rounded block with two small warm-lit eyes and no mouth.

This character is on the player's side and has to read that way across a crowded arena, so the pale stone and the crimson sash are the largest things about it and rock brown is the only other strong colour on it. It never wears the enemies' colours: not bright red #FF5252, not amber #FFB300, not dark red #8E1B1B, not violet #9C27B0. It has no claws, fangs, horns or spikes — its edges are worn round rather than jagged — and it stands upright with open shoulders rather than hunched. It wears no hood and carries no staff, because the player's own character is a tall hooded figure with a staff and the two must never be confused.

The four rows are the four facings. Row one faces down, towards the viewer, so the eyes are visible. Row two faces up, away from the viewer, so the back of the head is visible. Row three faces left. Row four faces right.

The four cells of a row are one slam, in time order. One: it plants both feet and raises both fists over its head, the seams at its shoulders opening as it lifts. Two: it holds at the top of the wind-up, leaning back, and the rock brown at the seams glows a little. Three: it drives both fists down in front of it, and a few small chips of stone jump up around the fists. Four: it straightens back up with its fists low and the chips gone.

Nothing struck is drawn on this sheet. The game draws the enemy and the hit, so nothing is drawn where a target would be; the fists and the chips of stone stay within the character's own arm's reach and never cross the cell or touch its edge.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference sheet.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Each row is drawn in the facing it is given and in no other: the head, the hands and the feet all point that way in every cell of that row. No row is a copy, a mirror or a rotation of another row — the left row and the right row are two separate drawings, and the sash is knotted on the same side in both.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. The feet stand on the same line and at the same point in every cell of a row, so the animation does not slide or jitter, and every cell holds a full drawing.
Deliver one lossless PNG, not JPEG, at the canvas size given above, or the whole canvas scaled down proportionally but never below half of it, and report the exact pixel size.
```

## Done when

All eight sheets are delivered at the grids above and measured against the
delivered pixels. Manifest entries, the cut and the engine wiring are the rest
of #146 and land separately.
