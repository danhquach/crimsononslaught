# CO-235 Art: Siphon passive icon and heal cue

Ticket: [#416](https://github.com/danhquach/crimsononslaught/issues/416)

Siphon heals for a share of the damage the player deals. This ticket draws its build icon and the small cue that plays on the hero while Siphon heals. Both came from `openai/gpt-image-2` through the Pollinations tool, `quality: medium`, with no reference picture attached (the tool takes a URL only; the house style is carried by the prompt, as on CO-217). The icon takes column 5 of the third passive sheet, so atlas page 17 gains one frame. The cue is on its own new atlas page 32, so no other page is re-quantised.

If the tool has a negative-prompt field, paste this into it:

```text
text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, drop shadow, blur, smooth gradient, jpeg artifacts, glow halo outside the disc, square tiles, frames, panels, pink, purple, violet
```

## Icon concepts

Three concepts at 1024x1024, one block each. Each was downscaled to 32 px and set beside the existing passive icons (Regeneration, Magnet, Avarice, Pierce).

- A, a fang with a drop falling to a heart: the fang's curve reads as a horn or a feather at 32 px and the drop and heart are a few pixels, so the idea is lost.
- B, a chalice catching a falling drop: reads at 32 px as a cup with red at its rim and a red drop above it; the only silhouette with a wide base and a stem, so it is clearly not Pierce's arrow through a ring.
- C, a spiral drawing inward to a heart: the spiral arms blur into a grey swirl at 32 px, the heart is 4 px, and the generated disc came back slightly oval.

### Concept A: `iconA.png`

Not committed. Copy the whole block below; it is the complete prompt.

```text
Create one small round passive upgrade button icon for a top-down 2D pixel-art game. Draw only the one icon, no text, no player, no monsters and no ground.

The canvas is 1024 by 1024 pixels. The icon is a round disc 832 pixels across, centred on the canvas, which leaves 96 pixels of plain magenta between the disc and every canvas edge.

The disc: a solid circle shaded in four flat rings of cool steel grey, a dark slate rim, hex #2E3436, stepping inward through #4A5457 and #6E7A7D to a pale grey centre, hex #9AA5A8, with a crisp dark outline round the outside. The shading steps in hard bands with a little dithering between them, never a smooth blend.

On the disc sits one bold, simple silhouette in pale mint white, hex #E5FFEE, with a few pure white highlight pixels, outlined all the way round in dark slate, hex #1E2426, at least twenty pixels thick, so it stands out clearly against the grey. It is big and chunky and drawn with few details so it still reads when the icon is shown only 32 pixels across. It stays inside the central circle of the disc, 580 pixels across, so a clear ring of plain disc colour shows all the way round it. The silhouette is Siphon: one long curved vampire fang, pointing down to the left, with a single fat drop of blood in deep red, hex #B01020, falling from its tip and a small solid heart in the same red, with a pale mint highlight, at the lower right where the drop is falling into it. Fang, drop and heart read as one diagonal sweep from the upper left to the lower right.

Style: chunky pixel art, crisp hard edges, no blur and no anti-aliasing; a grim fantasy look in the subject's own colours, never in the background; original design.
Background: flat magenta #FF00FF behind the disc, unbroken from one edge of the canvas to the other, fully opaque, with no texture, noise, shadow, glow or vignette, and no tile, panel, square, line, border or frame. No text anywhere: a single character of text, a number, a label or a watermark ruins the image. The disc never touches a canvas edge.
```

### Concept B: `iconB.png` (chosen)

Not committed. Copy the whole block below; it is the complete prompt.

```text
Create one small round passive upgrade button icon for a top-down 2D pixel-art game. Draw only the one icon, no text, no player, no monsters and no ground.

The canvas is 1024 by 1024 pixels. The icon is a round disc 832 pixels across, centred on the canvas, which leaves 96 pixels of plain magenta between the disc and every canvas edge.

The disc: a solid circle shaded in four flat rings of cool steel grey, a dark slate rim, hex #2E3436, stepping inward through #4A5457 and #6E7A7D to a pale grey centre, hex #9AA5A8, with a crisp dark outline round the outside. The shading steps in hard bands with a little dithering between them, never a smooth blend.

On the disc sits one bold, simple silhouette in pale mint white, hex #E5FFEE, with a few pure white highlight pixels, outlined all the way round in dark slate, hex #1E2426, at least twenty pixels thick, so it stands out clearly against the grey. It is big and chunky and drawn with few details so it still reads when the icon is shown only 32 pixels across. It stays inside the central circle of the disc, 580 pixels across, so a clear ring of plain disc colour shows all the way round it. The silhouette is Siphon: a tall stemmed chalice, a wide bowl on a short stem and a flat foot, seen from the front, with one fat drop of blood in deep red, hex #B01020, falling from above into the bowl and the red filling the top of the bowl as a flat band.

Style: chunky pixel art, crisp hard edges, no blur and no anti-aliasing; a grim fantasy look in the subject's own colours, never in the background; original design.
Background: flat magenta #FF00FF behind the disc, unbroken from one edge of the canvas to the other, fully opaque, with no texture, noise, shadow, glow or vignette, and no tile, panel, square, line, border or frame. No text anywhere: a single character of text, a number, a label or a watermark ruins the image. The disc never touches a canvas edge.
```

### Concept C: `iconC.png`

Not committed. Copy the whole block below; it is the complete prompt.

```text
Create one small round passive upgrade button icon for a top-down 2D pixel-art game. Draw only the one icon, no text, no player, no monsters and no ground.

The canvas is 1024 by 1024 pixels. The icon is a round disc 832 pixels across, centred on the canvas, which leaves 96 pixels of plain magenta between the disc and every canvas edge.

The disc: a solid circle shaded in four flat rings of cool steel grey, a dark slate rim, hex #2E3436, stepping inward through #4A5457 and #6E7A7D to a pale grey centre, hex #9AA5A8, with a crisp dark outline round the outside. The shading steps in hard bands with a little dithering between them, never a smooth blend.

On the disc sits one bold, simple silhouette in pale mint white, hex #E5FFEE, with a few pure white highlight pixels, outlined all the way round in dark slate, hex #1E2426, at least twenty pixels thick, so it stands out clearly against the grey. It is big and chunky and drawn with few details so it still reads when the icon is shown only 32 pixels across. It stays inside the central circle of the disc, 580 pixels across, so a clear ring of plain disc colour shows all the way round it. The silhouette is Siphon: one thick spiral that winds inward in two turns and ends in a small solid heart in deep red, hex #B01020, with a pale mint highlight, at its centre. The spiral is a wide ribbon in pale mint white, its arms clearly separated from each other, drawn with a thick dark outline.

Style: chunky pixel art, crisp hard edges, no blur and no anti-aliasing; a grim fantasy look in the subject's own colours, never in the background; original design.
Background: flat magenta #FF00FF behind the disc, unbroken from one edge of the canvas to the other, fully opaque, with no texture, noise, shadow, glow or vignette, and no tile, panel, square, line, border or frame. No text anywhere: a single character of text, a number, a label or a watermark ruins the image. The disc never touches a canvas edge.
```

## Final icon: `icons_passives_3.png`, column 5: Siphon

Chosen: concept B. It is the only one whose subject (a cup, a drop and red at its rim) still reads as "something catches blood" at 32 px, and its wide-based shape cannot be mistaken for Pierce. Copy the whole block below; it is the complete prompt (the same block as concept B).

Delivered as: JPEG 1024x1024 px from `openai/gpt-image-2` (asked 1024x1024, `quality: medium`), first try of concept B. The disc came back about 890 px across and was found by its columns and rows of art. Background magenta (strict test, `r > 190 && b > 190 && g < 90`) plus a 2 px fringe pulled in was cleared. The disc was then area-averaged onto a 36 px native cell with the disc 32 px across, averaging only art pixels and skipping magenta-tinted specks in the outer 6 native px (the house rule `b > 0.8r && g < 0.6r && r > 140`), scaled back up 4x nearest-neighbour and pasted at x=576 of the sheet, which was widened from 576 to 720 px with #FF00FF so the other four cells' pixels are unchanged (checked: 0 differing channel values over columns 0-575). Saved as PNG with no metadata chunks (`npm run art:strip` found nothing to strip). `sheetCell` 144, `centred`, manifest `cols` 4 to 5.

```text
Create one small round passive upgrade button icon for a top-down 2D pixel-art game. Draw only the one icon, no text, no player, no monsters and no ground.

The canvas is 1024 by 1024 pixels. The icon is a round disc 832 pixels across, centred on the canvas, which leaves 96 pixels of plain magenta between the disc and every canvas edge.

The disc: a solid circle shaded in four flat rings of cool steel grey, a dark slate rim, hex #2E3436, stepping inward through #4A5457 and #6E7A7D to a pale grey centre, hex #9AA5A8, with a crisp dark outline round the outside. The shading steps in hard bands with a little dithering between them, never a smooth blend.

On the disc sits one bold, simple silhouette in pale mint white, hex #E5FFEE, with a few pure white highlight pixels, outlined all the way round in dark slate, hex #1E2426, at least twenty pixels thick, so it stands out clearly against the grey. It is big and chunky and drawn with few details so it still reads when the icon is shown only 32 pixels across. It stays inside the central circle of the disc, 580 pixels across, so a clear ring of plain disc colour shows all the way round it. The silhouette is Siphon: a tall stemmed chalice, a wide bowl on a short stem and a flat foot, seen from the front, with one fat drop of blood in deep red, hex #B01020, falling from above into the bowl and the red filling the top of the bowl as a flat band.

Style: chunky pixel art, crisp hard edges, no blur and no anti-aliasing; a grim fantasy look in the subject's own colours, never in the background; original design.
Background: flat magenta #FF00FF behind the disc, unbroken from one edge of the canvas to the other, fully opaque, with no texture, noise, shadow, glow or vignette, and no tile, panel, square, line, border or frame. No text anywhere: a single character of text, a number, a label or a watermark ruins the image. The disc never touches a canvas edge.
```

## Cue concepts

Three lean concepts: the effect alone, a 4-frame strip each, red to mint, the cheapest picture that shows how the animation reads. All came back as JPEG 1408x480.

- A, a teardrop mote: its middle frames are orange and read as a flame, not a heal.
- B, a plus sparkle with a small twin: a plus is the usual heal sign, the red-to-mint change is clear in four steps, and the thick dark outline keeps it visible on the dark floor.
- C, three bubbles: reads as loose orbs or gems, with no heal meaning, and the pale middle frames wash out.

### Concept A: `cueA.jpg`

Not committed. Copy the whole block below; it is the complete prompt.

```text
Create one strip of four small animation frames of a healing effect for a top-down 2D pixel-art game, drawn side by side in one row. Draw only the effect, no text, no player, no monsters and no ground.

The canvas is 1024 by 256 pixels, a grid of 256 pixel square cells, four cells across and one cell down, read left to right. In every cell the drawing is about 110 pixels tall and 70 pixels wide, centred in the cell, which leaves wide margins of plain magenta on all sides.

The effect is a single teardrop-shaped mote of light rising straight up. In the first cell it sits low in the cell, small and deep blood red, hex #D01020, with a bright pale red highlight pixel. In each following cell it sits higher and a little larger, and its colour turns step by step from blood red through warm orange-white to a clear bright mint green, hex #7FFFC0, so that in the fourth cell it is bright mint with a pure white core and a short tail of three small mint sparks below it. Every drawing has a thick dark outline, hex #1E2426, at least eight pixels wide all round, so the mote stands out on a dark floor.

Style: chunky pixel art, crisp hard edges, no blur and no anti-aliasing; no pink, no purple and no violet anywhere in the drawings.
Background: flat magenta #FF00FF, unbroken from one edge of the canvas to the other, fully opaque, with no texture, noise, shadow, glow or vignette, and no tile, panel, square, line, border or frame. No text anywhere: a single character of text, a number, a label or a watermark ruins the image.
```

### Concept B: `cueB.jpg` (chosen)

Not committed. Copy the whole block below; it is the complete prompt.

```text
Create one strip of four small animation frames of a healing effect for a top-down 2D pixel-art game, drawn side by side in one row. Draw only the effect, no text, no player, no monsters and no ground.

The canvas is 1024 by 256 pixels, a grid of 256 pixel square cells, four cells across and one cell down, read left to right. In every cell the drawing is about 110 pixels across and 130 pixels tall, centred in the cell, which leaves wide margins of plain magenta on all sides.

The effect is a small plus-shaped sparkle, a chunky cross with four short arms, with a tiny second plus sparkle beside it, rising straight up. In the first cell it sits low in the cell and is deep blood red, hex #D01020, with a bright pale red centre pixel. In each following cell it sits higher and its colour turns step by step from blood red through warm orange-white to a clear bright mint green, hex #7FFFC0, so that in the fourth cell it is bright mint with a pure white centre. Every drawing has a thick dark outline, hex #1E2426, at least eight pixels wide all round, so the sparkle stands out on a dark floor.

Style: chunky pixel art, crisp hard edges, no blur and no anti-aliasing; no pink, no purple and no violet anywhere in the drawings.
Background: flat magenta #FF00FF, unbroken from one edge of the canvas to the other, fully opaque, with no texture, noise, shadow, glow or vignette, and no tile, panel, square, line, border or frame. No text anywhere: a single character of text, a number, a label or a watermark ruins the image.
```

### Concept C: `cueC.jpg`

Not committed. Copy the whole block below; it is the complete prompt.

```text
Create one strip of four small animation frames of a healing effect for a top-down 2D pixel-art game, drawn side by side in one row. Draw only the effect, no text, no player, no monsters and no ground.

The canvas is 1024 by 256 pixels, a grid of 256 pixel square cells, four cells across and one cell down, read left to right. In every cell the drawing is about 120 pixels across and 140 pixels tall, centred in the cell, which leaves wide margins of plain magenta on all sides.

The effect is a little cluster of three round bubbles of light, one larger and two smaller, drifting upward. In the first cell the cluster sits low in the cell and all three bubbles are deep blood red, hex #D01020, each with a bright pale red highlight pixel. In each following cell the cluster sits higher, and the colour turns bubble by bubble and step by step from blood red through warm orange-white to a clear bright mint green, hex #7FFFC0, so that in the fourth cell all three are bright mint with a pure white highlight. Every bubble has a thick dark outline, hex #1E2426, at least eight pixels wide all round, so the bubbles stands out on a dark floor.

Style: chunky pixel art, crisp hard edges, no blur and no anti-aliasing; no pink, no purple and no violet anywhere in the drawings.
Background: flat magenta #FF00FF, unbroken from one edge of the canvas to the other, fully opaque, with no texture, noise, shadow, glow or vignette, and no tile, panel, square, line, border or frame. No text anywhere: a single character of text, a number, a label or a watermark ruins the image.
```

## Final strip: `hero_siphon.png`

Save as `docs/art/sheets/CO-235/hero_siphon.png`. Copy the whole block below; it is the complete prompt (the same block as concept B).

Delivered as: JPEG 1408x480 px from `openai/gpt-image-2` (asked 1024x256; the model chose its own canvas), first try. The drawings were 154-155 x 142-143 px, on the cell centres but drifting up the cells, so each was cut out and re-gridded: pixels within the house snap (`r > 150 && b > 150 && g < 0.75 * min(r, b)`) set to #FF00FF, isolated specks (fewer than 4 art neighbours) dropped, each frame's art placed on a 288 px square cell, centred across, with its centre at y 200, 170, 140 and 100 so the mote rises evenly. Saved as PNG 1152x288, no metadata chunks. Ruled grid band: no. `sheetCell` 144 (native 36 px cell, so the drawing is about 19 px wide), not `centred`, so the rise stays in the frame. Cuts to four 21x32 frames, anchor (11, 15), on page 32.

```text
Create one strip of four small animation frames of a healing effect for a top-down 2D pixel-art game, drawn side by side in one row. Draw only the effect, no text, no player, no monsters and no ground.

The canvas is 1024 by 256 pixels, a grid of 256 pixel square cells, four cells across and one cell down, read left to right. In every cell the drawing is about 110 pixels across and 130 pixels tall, centred in the cell, which leaves wide margins of plain magenta on all sides.

The effect is a small plus-shaped sparkle, a chunky cross with four short arms, with a tiny second plus sparkle beside it, rising straight up. In the first cell it sits low in the cell and is deep blood red, hex #D01020, with a bright pale red centre pixel. In each following cell it sits higher and its colour turns step by step from blood red through warm orange-white to a clear bright mint green, hex #7FFFC0, so that in the fourth cell it is bright mint with a pure white centre. Every drawing has a thick dark outline, hex #1E2426, at least eight pixels wide all round, so the sparkle stands out on a dark floor.

Style: chunky pixel art, crisp hard edges, no blur and no anti-aliasing; no pink, no purple and no violet anywhere in the drawings.
Background: flat magenta #FF00FF, unbroken from one edge of the canvas to the other, fully opaque, with no texture, noise, shadow, glow or vignette, and no tile, panel, square, line, border or frame. No text anywhere: a single character of text, a number, a label or a watermark ruins the image.
```

## Checks

- Cutter's own checks (key, clear-outside, bounds, edges touched, art not flush to the frame edge) all pass in `npm run art:cut`; page 32 holds 4 frames, 655 opaque px, 1 pinkish px (a fringe pixel), none in the icon.
- Icon at 32 px beside its neighbours and cue at 3x over the arena floor were looked at in zoom. The icon's disc is lighter and its rim thinner than the four neighbours' (generation variance); the red first frame of the cue sits on the hero's red-and-white robe and is held up by its dark outline, while the yellow and mint frames read clearly.
- Pages: `git status` shows only `props17` changed and `props32` added; every other page is byte-identical.

## Palette numbers (page 17, mean absolute error per RGB channel against the art before quantising)

- Before (27 frames): 0.855. After (28 frames): 0.856, the new Siphon frame alone 0.556.
- Every existing frame on the page had pixels move (re-quantised palette, 90% of their opaque pixels, mean change 2.3 per channel over the changed pixels), with no visibility flips against the pre-quantise art.
