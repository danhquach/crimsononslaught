# CO-227 Art: Ice Wave's frost ring and Ice Diamond's gem

Ticket: [#406](https://github.com/danhquach/crimsononslaught/issues/406)

Two new Ice spell pieces, both cut onto their own atlas page 30 so no other page is re-quantised: a full-circle frost ring that spreads out from the caster (Ice Wave) and a spinning frozen gem that orbits the caster (Ice Diamond). Both are generated on a magenta key with the approved concept as the `image` reference (`quality: medium`, `openai/gpt-image-2`). The art is not wired into any spell here.

Nothing in the prompts below names a frame or a hex-coded token beyond the key colour. Copy the whole `text` block of a sheet and paste it as the prompt.

## 1. `ice_wave.png`: the frost ring

Save as `docs/art/sheets/CO-227/ice_wave.png`. Reference image: the approved concept (`https://media.pollinations.ai/8805935889459a5bb4f8514961d629bd04d68f5fcf09501db0101ac43f25d329`).

Delivered as: JPEG 1536x512 px from `openai/gpt-image-2` (asked 2048x512; `quality: medium`), on the first try. Magenta-tinted fringe snapped to #FF00FF with the house rule plus `b > g + 20` (guarded by `g < 0.75r`, so the pale blue frost survives), 709,216 pixels. The model spaced the rings unevenly and drew the last ring 335 px wide in a 384 px cell (24 px of margin, and the third ring spilled 8 px into the second cell), so each frame's connected parts were lifted out by x range and set into a 512 px square cell, not resampled: the ring's bounding box on the cell centre for frames 2-4, and for frame 1 the centroid of its bright core, whose faint dashed haze would otherwise drag the centre off. The sheet is 2048x512 and the smallest clearance to a cell edge is 69 px. Saved as PNG with no C2PA chunk (`npm run art:strip` found nothing to strip). At the PM's request the pink-white snow flecks and the purple inner edge were then pushed to pure blue and white: every non-key pixel with `r > g` had its red set to its green (16,653 pixels, 22% of the art), and any pixel with `g > b` had its blue raised to its green. Cut at `sheetCell` 640 (a 160 px native cell) to 118x120 native frames, `centred`, on `props30` as `ice.wave` (plays once). Measured in the atlas, the ring's outer radius from the frame anchor is 12, 35, 52 and 56 native px (`ICE_WAVE_ART` in `src/config/iceLevels.ts`, re-measured by `scripts/lib/iceWaveArt.test.mjs`); frame 1 is the core burst only, frame 2 has an empty centre, and frame 4 is the largest ring, broken and flecked.

```text
Create one pixel-art animation sheet for a top-down 2D game: a ring of cold wind and frost spreading outward, seen from directly above. Draw only the frost, no caster, no creatures and no ground.

The canvas is 2048 by 512 pixels, a grid of 512 pixel square cells, four cells across and one cell down, read left to right. In every cell the effect is a full circle centred exactly on the centre of its cell, the same centre in all four cells, with at least 60 pixels of plain magenta between the drawing and every cell edge.

Frame 1: a small, bright white-blue frost burst at the core, about 120 pixels across, with short ice spikes radiating from a white-hot middle. Frame 2: a swirling frost ring about 280 pixels across spreading out from the middle, drawn as a thick curling band of wind with spiral snowy streaks, and an empty centre with no star or core in it. Frame 3: a wider, thinner swirl ring about 340 pixels across, with the same spiral streaks, and an empty centre. Frame 4: the largest ring, about 380 pixels across, faint and dissolving into broken arcs with a few small snow flecks, and an empty centre.

Draw the frost as solid opaque pixels in pale cyan, white and light blue, with a slightly deeper blue only on the ring's inner edge. The ring ends in a hard pixel edge against the background with nothing soft around it.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; light from the top-left; original design; match the attached concept image for the look of the swirl.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency, texture, noise or vignette.
The cells are a measurement, not something to draw: nothing marks where one ends and the next begins, no tile, panel, line, border or frame. No text anywhere: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill. Give every cell visible art.
```

## 2. `ice_diamond.png`: the spinning gem

Save as `docs/art/sheets/CO-227/ice_diamond.png`. Reference image: the approved concept C (`https://media.pollinations.ai/56e9171e100136a901d2eb2dc66fafded92a8974632db08cc5718b61254226a1`), which shows four gems around a mage; the prompt asks for one gem per cell.

Delivered as: JPEG 1536x512 px from `openai/gpt-image-2` (asked 2048x512; `quality: medium`), on the first try. Magenta-tinted fringe snapped as for the ring, 703,329 pixels. The gems sat 15-40 px off their cell centres, so each gem's largest connected part (the body, sparkles left to follow it) was set on the centre of a 512 px square cell by whole pixels, not resampled (2048x512). Saved as PNG with no C2PA chunk. Cut at `sheetCell` 224 (a 56 px native cell) to 32x36 native frames, `centred`, on `props30` as `ice.diamond` (loops); the gem body alone is about 24x28 native. Frame 1 is wide and face-on, 2 and 4 are three-quarter turns, 3 is edge-on.

```text
Create one pixel-art animation sheet for a top-down 2D game: a single spinning frozen gem, drawn four times as it turns a quarter turn between frames. Draw only the gem, no caster, no creatures and no ground.

The canvas is 2048 by 512 pixels, a grid of 512 pixel square cells, four cells across and one cell down, read left to right. Each cell holds exactly one gem, about 220 pixels tall and 190 pixels wide, its middle exactly on the centre of its cell, which leaves at least 100 pixels of plain magenta between the gem and every cell edge.

The gem is a chunky, rough-cut, icy turquoise crystal, an elongated diamond with a few bold facets and a crust of white frost along its upper edges, with two or three tiny snowflake sparkles on and just beside it. The gem body itself is bright: light turquoise, cyan and white facets with one deeper teal facet for shape. It has a bold dark navy outline about 8 pixels thick all the way round, so it reads on a dark floor. Across the four frames the same gem turns a quarter turn each time: frame 1 seen face-on and wide, frame 2 turned partly so it is narrower with a different facet toward us, frame 3 seen edge-on and thin, frame 4 turned partly the other way. The size, height and centre stay the same in every cell, only the turn changes.

Style: chunky pixel art, crisp hard edges, no blur, anti-aliasing, gradients or glow; light from the top-left; original design; match the attached concept image for the look of the gem.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency, texture, noise or vignette.
The cells are a measurement, not something to draw: nothing marks where one ends and the next begins, no tile, panel, line, border or frame. No text anywhere: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge. Give every cell visible art.
```
