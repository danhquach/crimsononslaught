# CO-182 Art: Frost Nova Bomb

Ticket: [#303](https://github.com/danhquach/crimsononslaught/issues/303) · Spec: `docs/superpowers/specs/2026-09-28-frost-nova-bomb-rework-design.md` §5

Frost Nova Bomb became a spiky ice urchin. It rolls through the crowd, spinning and spraying icicles, and bursts into a ring of ice spikes that erupt from the stones. The look is concept A of three shown at review (2026-09-28): an ice urchin, a caged frost core and a four-bladed pinwheel. The bomb used to fly as Ice Arrow's `ice.arrow` and burst with Phase 1's `ice.nova`. `ice.nova` stays in the atlas, because Ice Shield still bursts with it.

Three pieces: two sheets and one level-up icon. Each was generated with `openai/gpt-image-2` (`quality: medium`) through Pollinations. Sheets 1 and 2 had the approved concept picture attached as the reference. Copy each whole `text` block below and paste it as the prompt. Nothing else to add.

If the tool has a negative-prompt field, paste this into it:

```text
text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, drop shadow, blur, gradient, jpeg artifacts, pink, purple, glow, haze
```

## 1. `ice_urchin.png`: the bomb and its icicle

Save as `docs/art/sheets/CO-182/ice_urchin.png`. Copy the whole block below; it is the complete prompt.

**Delivered as:** JPEG 1152x576 px, on the first try (asked for 1024x512, 2x1 of 512 px; the delivered cells are 576 px).
- **Cleanup:**
  - Magenta-tinted fringe snapped to #FF00FF with the house rule (`b > 0.8r && g < 0.6r && r > 140`).
  - Only pixels with green ≥ 40 kept.
  - Each drawing moved whole to the centre of its cell: (-18, +15) and (+17, +11) px.
  - Red pulled down to green wherever the JPEG had tinted a pixel pink (`r > g` → `r = g`).
- **Saved as:** PNG, no metadata chunks. Ruled grid band: no.
- **Cut:** `sheetCell` 160, `centred`, on page 18. The urchin cuts to a 27x28 px art box, and the icicle to 27x7 px lying along its anchor row, pointing right (`scripts/lib/frostNovaBombArt.test.mjs`).

```text
Create one pixel-art sprite sheet for a top-down 2D game: two separate ice objects. Draw only the two objects, no ground, no creatures and no background scene.

The canvas is 1024 by 512 pixels, a grid of 512 pixel square cells, two cells across and one cell down. Each cell holds one object, centred in its cell.

First cell: the ice urchin bomb from the attached reference picture, seen from above: a round ball bristling with short sharp icicle spikes all the way round, clear blue ice hex #81D4FA, white highlights on the top-left, steel-blue shadow hex #4F83CC on the bottom-right, and a small bright white core in the middle. The spikes are evenly spaced round the whole ball so it looks the same when turned. It fits inside a 300 pixel circle centred in the cell.

Second cell: one single icicle dart lying flat along one horizontal line through the centre of the cell, pointing right: a sharp point at the right end, clear blue ice with a white core line and a steel-blue edge, about 240 pixels long and 44 pixels thick at its widest near the back, tapering to the point, with a blunt broken back end on the left. It is not tilted.

Keep every colour cold: white, pale blue, clear ice blue and steel blue. No pink, purple or violet anywhere, and no soft glow, haze, sparkles or mist: every edge is a hard pixel edge against the magenta.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; light from the top-left; match the attached reference picture's ice.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it, magenta unbroken from edge to edge, fully opaque, no texture or noise. Nothing marks where one cell ends and the next begins: no line, border, panel or frame. No text anywhere: one letter, number, label or watermark ruins the sheet. Every drawing stays well inside its own cell and never touches an edge.
```

## 2. `ice_spike_ring.png`: the burst

Save as `docs/art/sheets/CO-182/ice_spike_ring.png`. Copy the whole block below; it is the complete prompt.

**Delivered as:** JPEG 1536x1024 px, on the first try, but off the grid.
- **What came back:** seven drawings instead of six. Four were in the top row and three in the bottom row, with none on the 3x2 cells.
- **Rescue:**
  - The seventh drawing, a faint bare ring, was dropped: it reads as the second drawing played again.
  - The other six were re-gridded onto 512 px cells in their order. Each was moved whole so the centre of its frost ring sits on the cell centre. That centre was found from the ring's own left, right and bottom edges, not from the spikes.
  - The delivered ring was a flat ellipse (354x197 px, aspect 0.56). The burst reaches a circle, and the other ground rings are near round (0.85–0.92). So every cell was resampled about its centre, 0.8 across and 1.2 down (nearest neighbour), to aspect 0.85.
  - Art pieces left cut flat 236 px from the centre by that resample were dropped whole (248 px of flying shards).
  - Magenta fringe snapped as on sheet 1, and red pulled down to green on pink-tinted pixels.
- **Saved as:** PNG, no metadata chunks. Ruled grid band: no.
- **Cut:** `sheetCell` 896, `centred`, on page 18, to 160x208 native frames. The ring's rim sits 61 px out from the anchor, `SPIKE_RING_SCALE_RADIUS` (`scripts/lib/frostNovaBombArt.test.mjs`), so the game draws it at `radius / 61`.

```text
Create one pixel-art animation sheet for a top-down 2D game: an ice bomb bursting into a ring of ice spikes that erupt from the ground, seen from above at a three-quarter angle. Draw only the ice, no ground, no creatures and no background scene.

The canvas is 1536 by 1024 pixels, a grid of 512 pixel square cells, three cells across and two cells down. The six drawings read left to right along the top row, then left to right along the bottom row. Every drawing is centred on the centre of its cell. The ring in every drawing is the same size: a flat ellipse 400 pixels wide and 280 pixels tall centred in the cell, so it never touches a cell edge.

First drawing: only a small bright white and pale blue starburst flash at the centre, about 90 pixels across.
Second drawing: a thin white frost shockwave line along the full ring ellipse, with a few small ice chips on it; the middle of the ring is empty magenta.
Third drawing: short sharp ice spikes just starting to rise all along the ring ellipse, pointing up and slightly outward, the thin white frost line still under them; the middle is empty magenta.
Fourth drawing: tall jagged clear blue ice spikes, hex #81D4FA with white highlights and steel-blue shadow hex #4F83CC, standing all the way round the ring ellipse like a crown, the tallest about 90 pixels high; the middle is empty magenta.
Fifth drawing: the same spikes cracking and breaking apart, many shorter, with small ice shards flying off outward; the middle is empty magenta.
Sixth drawing: only a few small scattered ice shards left along the ring ellipse, faint but clearly visible, never fading to nothing.

The middle of the ring is never filled: no frosted disc, no ice floor, no pond, only magenta inside the ring in every drawing.
Keep every colour cold: white, pale blue, clear ice blue and steel blue. No pink, purple or violet anywhere, and no soft glow, haze or mist: every edge is a hard pixel edge against the magenta.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; light from the top-left; match the ice spikes in the attached reference picture.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it, magenta unbroken from edge to edge, fully opaque, no texture or noise. Nothing marks where one cell ends and the next begins: no line, border, panel or frame. No text anywhere: one letter, number, label or watermark ruins the sheet. Every drawing stays inside its own cell and never touches an edge.
```

## 3. The level-up icon, spliced into `CO-154/icons_ice.png`

This replaces cell 2 of `docs/art/sheets/CO-154/icons_ice.png` (`icon.ice_nova_bomb`). The other four icons are byte-identical. Copy the whole block below; it is the complete prompt.

**Delivered as:** JPEG 1024x1024 px on the second try, with sheet 1 attached as the reference. The first try drew a flat white star with no ball, which read as a burst rather than a bomb.
- **Cleanup:** the CO-154 method, unchanged.
  - The disc was found by its art (854x861 px).
  - Everything outside its circle, pulled in 1.5 px, was set to #FF00FF.
  - The disc was area-averaged onto a 36 px native cell, 32 px across, averaging only the art pixels and skipping magenta-tinted specks.
  - It was scaled back up 4x nearest-neighbour and pasted over cell 2 (x 144–287).
- **Result:** only x 152–279 changed, the disc itself. The cut re-quantises page 10, which holds the icon, and no other existing page.

```text
Create one small round spell button icon for a top-down 2D pixel-art game. Draw only the icon, no text.

The canvas is 1024 by 1024 pixels. The icon is one round disc 800 pixels across, centred on the canvas, leaving plain magenta all round it.

The disc: a solid circle shaded in four flat rings of colour, a deep navy rim, hex #0A2463, stepping inward through dark blue #123C8C and blue #1F6FC4 to a bright sky-cyan centre, hex #4FC3F7, with a crisp dark outline round the outside. Hard colour bands with a little dithering, never a smooth blend.

On the disc sits the spiky ice urchin ball from the left of the attached picture, simplified into a bold chunky icon: a round ice ball in the middle, shaded pale icy white hex #EAF8FF on the top-left down to pale blue on the bottom-right, with one bright white highlight spot on its upper left, and ten thick sharp icicle spikes evenly spaced all the way round it, each spike shaded light on its top-left side and pale blue on the other, the whole urchin outlined in dark navy. The ball and its spikes read as a 3D spiky ice bomb, not a flat star. Few details, so it still reads when shown only 32 pixels across. It stays inside the central circle of the disc, 580 pixels across.

Chunky pixel art, crisp hard edges, no blur and no anti-aliasing.
Background: flat magenta #FF00FF from edge to edge, fully opaque, no texture, noise, shadow, glow or vignette. No text anywhere: a single character, number, label or watermark ruins the icon.
```
