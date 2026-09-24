# CO-098 Art: arena ground, edge and scatter props

Ticket: [#120](https://github.com/danhquach/crimsononslaught/issues/120)

Three sheets dress the 3000 × 3000 arena, which today is a flat dark fill, a
200 px grid and a crimson border rectangle: a ground tile that repeats across
the whole floor, an edge tile that repeats along a band round the perimeter,
and a sheet of scatter props. **One sheet per run**, so a bad one is redone on
its own.

## How to run this

**Copy the whole `text` block under a sheet's heading and paste it as the
prompt.** Each block is complete on its own: subject, canvas, content, palette,
style, delivery. The rules are repeated in every block, word for word where
they apply.

Negative-prompt field, if the tool has one:

```text
text, letters, numbers, words, labels, captions, title, watermark, signature, checkerboard, transparency grid, grid lines, cell borders, panels, frame, vignette, drop shadow, blur, gradient, feathered edges, halo, speckles, characters, people, monsters, yellow, gold, fire, glow
```

Generated here with `openai/gpt-image-2` through the Pollinations MCP (see
the pickups doc for the route). It always returns JPEG at a size of its own
choosing, so every delivery is measured before it is accepted (below).

## Background: two kinds of sheet

- **The ground and the edge are opaque.** They fill the whole canvas, edge to
  edge, with no background at all. The cutter takes them with the manifest's
  `"opaque": true`: no colour key, no edge-overrun check, the pixels as they
  are.
- **The props are keyed on magenta** `#FF00FF`, the route every JPEG sheet
  takes. After delivery, JPEG fringe near the key is unmixed from the magenta
  before the cut.

## Where the finished sheets go

```
docs/art/sheets/CO-098/<filename>
```

The two tiles are kept as the JPEGs they arrived as (`.jpg`); the props sheet
is the rescued PNG (below).

## Reading at the enemy cap

The floor is the one thing on screen that must never be read. In every block:

- **Low contrast, dark, desaturated.** Charcoal, slate and dried-blood
  crimson, all dark. Anything bright on the floor competes with the gems, the
  pickups and 300 monsters.
- **No yellow, gold, fire or glow anywhere.** The Lightning end-to-end test
  finds the bolt by its yellow on the screen; a yellow pebble would pass it
  for the wrong reason. No braziers for the same reason.
- **Never the gem's mint green** `#69F0AE`, never a crystal.
- **No text, symbols or runes that read as letters.**

## Sizes

| # | File | Content | Grid | Canvas asked | In game | `sheetCell` |
|---|---|---|---|---|---|---|
| 1 | `arena_ground.jpg` | seamless floor tile | 1 × 1 | 1024 × 1024 | 256 px tile | 1024 |
| 2 | `arena_edge.jpg` | seamless rock-rubble tile | 1 × 1 | 1024 × 1024 | 128 px tile, 64 px band | 512 |
| 3 | `arena_props.png` | 8 scatter props | 4 × 2 | 1024 × 512 | 36–48 px | 256 |

`nativeCell` is `sheetCell` / 4, and the cutter scales a delivered cell of any
size to it. An opaque tile's `sheetCell` is kept a multiple of 4 so its
downscale stays a whole number of source pixels per game pixel and the tile
stays seamless.

## What the engine does with them

`GameScene.buildArena` draws, when the atlas is present:

| Frame | Drawn as |
|---|---|
| `arena.ground.0` | one `tileSprite` over the whole arena |
| `arena.edge.0` | four `tileSprite` bands along the arena edge |
| `arena.<prop>.0` | one `Blitter`, a bob per prop at a seeded spot |

Without the atlas the arena keeps its grid and border. Every frame is a
one-frame clip in `src/config/animations.ts`.

## What came back

All three generated 2026-09-24 (`openai/gpt-image-2`, seed 120), each on the
first try, and all three cut onto their own atlas page, `props7` (64 KB).

- **Ground: 1024 × 1024 JPEG, as asked.** Tiled 3 × 3 at native size it
  shows no seam. Measured across the wrap, the step from the last row to the
  first is 7.6 levels a channel against 4.6 between neighbouring rows inside
  the tile and 13.9 between unrelated rows: continuous, not cut.
- **Edge: 1024 × 1024 JPEG, as asked.** Seamless the same way (8.8–11.3 across
  the wrap against 32 between unrelated rows). At a 256 px native tile the
  rocks were mush; `sheetCell` 512 gives a 128 px tile with rocks that read.
- **Props: 1152 × 576 JPEG, not 1024 × 512.** Right 4 × 2 grid, so a cell is
  288 px. Every cell holds its object, the smallest margin is 14 px (the tree
  and the bush), nothing touches a cell edge, and there is no text or
  watermark. `sheetCell` 256 lands the props at 36–48 px.
- **Props fringe, rescued.** The thin branches of the tree and the bush, and
  the edges of the bones, had blended into the magenta; cut, they came out as
  purple specks. Each pixel with a magenta share (the lower of its red and
  blue above its green by more than 30) was split: more than 45% magenta went
  to the key, the rest had the magenta share taken out and kept the art's
  colour underneath. After it, no pixel on the page is purple.
- **Clear of the bolt yellow.** The page's yellowest pixel is 36 levels short
  of a yellow match; the Lightning end-to-end check is unaffected.

---

## 1. `arena_ground.jpg` — floor tile

Save as `docs/art/sheets/CO-098/arena_ground.jpg` (a delivered JPEG is kept as it is). Copy the whole block below; it is the complete prompt.

```text
Seamless tileable ground texture for a top-down 2D pixel-art game: the floor of a ruined battle arena, seen from directly above. Only the ground surface — no objects standing on it, no characters, no monsters, no props, no walls, no horizon.

Canvas 1024x1024, filled completely edge to edge with the ground. There is no background: the ground itself runs off all four edges.

The texture tiles seamlessly in both directions: the left edge continues exactly into the right edge and the top edge continues exactly into the bottom edge, so a grid of copies shows no seam, no line and no change of tone where one copy meets the next. No feature is cut by an edge unless it continues on the opposite edge. Spread the detail evenly over the whole square: no single large landmark, no centred motif, no vignette, no darker or lighter corner, so the repeat is not obvious when the tile covers a huge floor.

Ground: packed dark earth and worn, broken flagstones of charcoal and slate grey, #1A1A1D to #2E2C30, with thin dark cracks between them, scattered small pebbles and grit, and faint patches of old dried blood in dark crimson, #3A1418 to #5A1620, soaked into the dirt. Very low contrast: the brightest pixel is a dull grey, nothing shines. This floor sits under hundreds of bright monsters and spell effects and must never draw the eye.

Colour: charcoal, slate and dark dried-blood crimson only. No yellow, no gold, no orange, no fire, no glow, no green, no blue, no bright colour of any kind.

Style: chunky pixel art with crisp hard pixel edges, no blur, no anti-aliasing, no smooth gradients; flat top-down view; light from the top-left; grim dark fantasy mood; original design.
No text anywhere — no letters, numbers, runes, symbols, signature or watermark. No border, frame, grid lines or panel.
Deliver one lossless PNG at exactly 1024x1024 and report the exact pixel size.
```

## 2. `arena_edge.jpg` — edge tile

Save as `docs/art/sheets/CO-098/arena_edge.jpg` (a delivered JPEG is kept as it is). Copy the whole block below; it is the complete prompt.

```text
Seamless tileable texture for a top-down 2D pixel-art game: a dense band of piled rocks and rubble that walls in a ruined battle arena, seen from directly above. Only the rubble surface — no characters, no monsters, no sky, no horizon.

Canvas 1024x1024, filled completely edge to edge with rubble. There is no background: the rubble itself runs off all four edges.

The texture tiles seamlessly in both directions: the left edge continues exactly into the right edge and the top edge continues exactly into the bottom edge, so a row or a column of copies shows no seam, no line and no change of tone where one copy meets the next. No rock is cut by an edge unless it continues on the opposite edge. Spread the rocks evenly over the whole square, no single large boulder and no centred motif.

Rubble: tightly packed jagged broken stones and boulders of many sizes, dark slate and charcoal, #26242A to #4A4650, each with a lighter top-left face and a near-black shadow side, the gaps between them near-black #0E0C10, with a few chips of dark crimson stone, #5A1620. Clearly rougher, lumpier and a little lighter than a flat stone floor, so it reads at a glance as the wall where the arena ends.

Colour: charcoal, slate, near-black and dark crimson only. No yellow, no gold, no orange, no fire, no glow, no green, no blue, no bright colour of any kind.

Style: chunky pixel art with crisp hard pixel edges, no blur, no anti-aliasing, no smooth gradients; flat top-down view; light from the top-left; grim dark fantasy mood; original design.
No text anywhere — no letters, numbers, runes, symbols, signature or watermark. No border, frame, grid lines or panel.
Deliver one lossless PNG at exactly 1024x1024 and report the exact pixel size.
```

## 3. `arena_props.png` — scatter props

Save as `docs/art/sheets/CO-098/arena_props.png`. Copy the whole block below; it is the complete prompt.

```text
Pixel-art sprite sheet for a top-down 2D game: eight different small static objects that lie scattered on the floor of a ruined battle arena. Draw only these eight objects — no characters, no monsters, no ground, no floor.

Canvas 1024x512: a grid of 256px square cells, 4 across and 2 down, 8 in all, read left to right, top row first. One object per cell, each about 150px along its longest side, centred in its cell.

Row 1, left to right: 1, a cluster of three jagged grey boulders; 2, a low scatter of broken stone rubble and chips; 3, a pile of old bleached bones with a cracked skull; 4, a dead leafless tree, bare twisted black branches, seen from above and slightly in front.
Row 2, left to right: 5, a broken stone pillar lying on its side in two pieces; 6, the short stump of a broken column still standing, jagged top; 7, a cracked tilted gravestone slab, blank, with no writing or symbol on it; 8, a dry thorny dead bush, dark and spiky.

Palette: dark and muted — charcoal, slate grey, weathered bone ivory, black-brown wood, and touches of dark dried-blood crimson, #5A1620. These sit on a dark floor under hundreds of bright monsters and must stay quiet decoration. No yellow, no gold, no orange, no fire, no glow, no green, no blue, never mint green, no bright colour of any kind.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from top-left; grim dark fantasy mood; original designs.
Background: the whole canvas is filled with one solid colour, pure bright magenta, RGB 255 0 255, hex #FF00FF, the same exact magenta in every cell, with no vignette, texture, noise, pattern or checkerboard. No shadow on the ground under an object, no halo, no glow, no magenta-tinted fringe along its edge.
Size, measured on the delivered file: each object fits inside a box 150 pixels square at the centre of its 256 pixel cell, which leaves 53 pixels of empty magenta between that box and every cell edge. If an object will not fit, draw it smaller; never let it grow to fill the cell.
Cells are a measurement, not something to draw. Nothing whatever marks where one cell ends and the next begins: no line, border, divider, frame, panel or change of tone. No text anywhere — one letter, number, label or watermark ruins the sheet.
Deliver one lossless PNG at exactly 1024x512; if it must be smaller, scale the whole canvas down proportionally and keep 4 cells across and 2 down. Report the exact pixel size.
```
