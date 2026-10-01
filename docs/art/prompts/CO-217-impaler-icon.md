# CO-217 Art: Impaler relic icon for the pause screen

Ticket: [#379](https://github.com/danhquach/crimsononslaught/issues/379)

Impaler (#377) was the one relic still drawn as two letters. Its icon is concept C of three: a gold lance bursting through a split red-and-cream bullseye target, on the violet relic disc in its gold ring (CO-179). Concept A, a spear through two shields, blurred into gold blobs at 32 px. Concept B, a spike through three skulls, was built first and rejected in review because the skulls could not be read as skulls at game size. An all-gold target with flying splinters also blurred into one gold shape at 32 px. A red-and-cream target with no splinters keeps the target and the lance apart, and the split target with no ring reads differently from the Pierce passive's arrow through a ring.

The icon takes the cell Colossus's retired art held, column 3 of `docs/art/sheets/CO-179/icons_relics_1.png`, so atlas page 17 keeps its 27 frames. The retired `icon.relic_colossus` clip is gone. Only that cell's pixels changed in the sheet. Recutting re-quantises the page's palette: every other frame on page 17 moved a little (57% of their pixels, no visibility flips), and their mean error against the art before quantising went from 2.52 to 2.49 per channel.

If the tool has a negative-prompt field, paste this into it:

```text
text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, drop shadow, blur, smooth gradient, jpeg artifacts, glow halo outside the disc, square tiles, frames, panels
```

## `icons_relics_1.png`, column 3: Impaler

Delivered as: JPEG 1024x1024 px from `openai/gpt-image-2` (asked 1024x1024, `quality: medium`), on the second try of concept C. The disc came back about 950 px across and was found by its columns and rows of art. Everything outside its circle, pulled in 1.5 px off the JPEG fringe, was set to #FF00FF. The disc was then area-averaged onto a 36 px native cell, with the disc 32 px across, averaging only the art pixels and skipping magenta-tinted specks in the outer 6 native px (the house rule, `b > 0.8r && g < 0.6r && r > 140`). It was scaled back up 4x nearest-neighbour and pasted over column 3 of the sheet, which was saved as PNG with no metadata chunks. The background magenta test is strict (`r > 190 && b > 190 && g < 90`), as on CO-179. `sheetCell` 144, `centred`.

```text
Create one small round relic button icon for a top-down 2D pixel-art game. Draw only the one icon, no text, no player, no monsters and no ground.

The canvas is 1024 by 1024 pixels. The icon is a round disc 832 pixels across, centred on the canvas, which leaves 96 pixels of plain magenta between the disc and every canvas edge.

The disc: a solid circle shaded in four flat rings of rich violet, a deep purple rim, hex #2A0F55, stepping inward through #45208A and #6B3FC9 to a bright violet centre, hex #9966FF. Round the very outside edge of the disc runs a thin ring of gold, hex #D4A62A, and outside that a crisp dark outline. The gold ring is the outermost edge of the disc, never a circle drawn inside it. The shading steps in hard bands with a little dithering between them, never a smooth blend.

On the disc sit two very bold, simple shapes, each with a thick dark brown outline, hex #3A2400, at least twenty pixels wide all the way round, so they stand out clearly against the violet and against each other.
First, a big round bullseye target, about 440 pixels across, in only two strong colours: three wide flat rings alternating deep blood red, hex #B01020, and pale bone cream, hex #FFF1D6, with a red centre. The target is split clean in two down the middle and its two halves are pushed apart to the left and right with a wide gap of violet between them.
Second, one large heavy lance in warm gold, hex #E8C66A, with pale cream highlights: its broad leaf-shaped blade bursts out through the gap toward the upper right and sticks out well past the target, and its thick straight shaft runs back to the lower left. No splinters, no debris, nothing else.
Few details, big flat shapes, so it still reads when the icon is shown only 32 pixels across. Together the target and lance fill most of the disc, leaving a ring of plain disc colour round them.

Style: chunky pixel art, crisp hard edges, no blur and no anti-aliasing; a grim fantasy look in the subject's own colours, never in the background; original design.
Background: flat magenta #FF00FF behind the disc, unbroken from one edge of the canvas to the other, fully opaque, with no texture, noise, shadow, glow or vignette, and no tile, panel, square, line, border or frame. No text anywhere: a single character of text, a number, a label or a watermark ruins the image. The disc never touches a canvas edge.
```
