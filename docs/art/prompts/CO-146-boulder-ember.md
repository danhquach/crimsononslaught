# CO-146 Art: Rolling Boulder with ember cracks

Ticket: [#224](https://github.com/danhquach/crimsononslaught/issues/224)

The Rolling Boulder's old brown stone (`earth.spin`, CO-079 row 1) blended into the dark cobblestone arena. The look is concept B of three: a dark charcoal-brown boulder whose cracks glow orange like embers, as if the rock is molten inside. Two sheets are redrawn: the spin, and the hit burst `earth.impact`, whose old frames opened on the old brown boulder. The burst plays on every Boulder, Earth Spike, Earth Shield and Earth Companion hit, so it is drawn with no boulder in it. The CO-079 dust row is still cut from the old sheet; its spin and impact rows are retired in the manifest (`null`). The frame stays 25x25 with a 23x23 art box, because `RollingBoulderSpell` scales the sprite from the placeholder, not from the art, so a bigger drawing would look wider than it hits.

Two sheets. Copy each whole `text` block below and paste it as the prompt, with the chosen concept picture attached as the reference. Nothing else to add.

If the tool has a negative-prompt field, paste this into it:

```text
text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, drop shadow, blur, gradient, jpeg artifacts, sparks, trail, glow halo
```

## 1. `earth_boulder_spin.png`: the boulder rolling

Save as `docs/art/sheets/CO-146/earth_boulder_spin.png`. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1408x480 px from `openai/gpt-image-2` (asked 1536x256, 6x1 of 256 px), with concept B attached as the reference. The house magenta rule snapped to #FF00FF. The six boulders came back about 227 px apart on 235 px cells (up to 20 px off centre), so each was moved, pixels unchanged, onto the centre of its own 480 px square cell. Each cell was then area-averaged down to 59 px and scaled back up 4x nearest-neighbour, so the cutter's 4x nearest-neighbour downscale lands on those averages: sampling the model's fine crack web one pixel in eight broke it into speckle at 23 px, and the average keeps the cracks as lines. Saved as PNG (1416x236) before the cut. Ruled grid band: no. `sheetCell` 236, `maxMagenta` 20; cuts to a 25x25 native frame.

```text
Create one pixel-art animation sheet for a top-down 2D game: a single round boulder rolling, the stone an earth mage sends rolling at monsters. Draw only the boulder, no caster, no monsters, no ground, no sparks and no trail.

The canvas is 1536 by 256 pixels, a grid of 256 pixel square cells, six cells across and one cell down. They read left to right. Each drawing is a round boulder about 176 pixels across, centred in its cell, which leaves at least 40 pixels of plain magenta between the boulder and every cell edge.

The boulder is the one in the attached concept picture: a round ball of dark charcoal-brown rock whose cracks glow like embers. A web of bold cracks splits its surface into chunky plates, and hot orange light shows through every crack, bright yellow-orange hex #FFB347 at the centre of each crack and deep orange hex #E8591A at its edges, as if the rock is molten inside. The cracks are thick, about 12 pixels wide, so they still read when the boulder is drawn small. The stone plates between them are dark charcoal-brown with lighter brown top faces where the light from the top-left falls. The boulder has a crisp dark brown outline all the way round and no glow, halo or light spilling outside that outline.

The six drawings are one rolling loop: the boulder turns clockwise a sixth of a turn from each drawing to the next, and its crack pattern turns with it, so the sixth drawing loops straight back to the first. The boulder stays exactly the same size and exactly the same place in every cell; only its surface turns.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference picture.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file.
```

## 2. `earth_impact.png`: the hit burst

Save as `docs/art/sheets/CO-146/earth_impact.png`. Copy the whole block below; it is the complete prompt. Attach the delivered spin sheet as the reference.

Delivered as: JPEG 1408x480 px from `openai/gpt-image-2` (asked 1280x256, 5x1 of 256 px). The house magenta rule snapped to #FF00FF. The second and third drawings reach across the model's own cell boundaries, so the drawings were split at the empty columns between them, not by grid, and each was moved, pixels unchanged, onto the centre of a 480 px square cell. Each cell was then downscaled to 64 px keeping a pixel only where at least a fifth of its block is art, averaging the art pixels alone: a plain average blended the sparks' pink JPEG halo into them and faded the smallest ones away. Pixels still tinted magenta (red and blue 40 over green) count as halo, not art. The fifth drawing's embers are under a pixel at that size and the cell came out empty, so it was dropped: the burst ships as four frames at 12 fps, the length of the old five at 15. Saved as PNG (1024x256) before the cut. Ruled grid band: no. `sheetCell` 256, `maxMagenta` 20; cuts to a 34x34 native frame, the art 32 px across against the old burst's 26.

```text
Create one pixel-art animation sheet for a top-down 2D game: the burst of a stone strike hitting a monster, made of the same ember-cracked rock as the boulder in the attached picture. Draw only the burst, no boulder, no monster, no caster and no ground.

The canvas is 1280 by 256 pixels, a grid of 256 pixel square cells, five cells across and one cell down. They read left to right as one short burst that plays once. Every drawing is centred on the exact centre of its cell, the point of impact, and leaves at least 28 pixels of plain magenta between the drawing and every cell edge.

The first drawing is the moment of impact: a small hot flash at the centre, a jagged four-pointed star of white-yellow hex #FFF3B0 with a hot orange core of hex #FFB347, about 70 pixels across. The second drawing is the flash breaking apart, about 130 pixels across: chunky jagged fragments of dark charcoal-brown rock fly outward in every direction, each fragment edged with glowing orange cracks, hex #E8591A, and a ring of small bright orange ember sparks bursts out between them. The third drawing is about 170 pixels across: the fragments and embers have flown further out, and a small dim puff of dark brown dust sits at the centre. The fourth drawing is about 190 pixels across: only small rock chips and embers remain near the outer edge, the embers cooling from orange to deep red. The fifth drawing is about 200 pixels across: a few tiny dim red embers and small dark chips, almost gone but still clearly visible.

The fragments are chunky, at least 14 pixels across, and the sparks at least 8 pixels, so they still read when the sheet is drawn small. The rock is dark charcoal-brown with lighter brown top faces where the light from the top-left falls, and every glowing crack is orange, never pink or purple.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design; match the attached reference picture.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill, because the margin is measured on the delivered file. Give every cell visible art: the fading last frame never goes empty.
```
