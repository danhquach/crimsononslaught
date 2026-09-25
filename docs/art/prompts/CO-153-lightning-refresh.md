# CO-153 Art: the Lightning roster and Fireball redrawn

Ticket: [#238](https://github.com/danhquach/crimsononslaught/issues/238)

A new look for every Lightning spell and for Fireball, picked from side-by-side comparisons with the old art. Lightning stays yellow and white so it never reads as Ice's cyan, and every piece gets a dark one-pixel outline and a white-hot core so it holds up on the dark floor at game size.

- Lightning Bolt: a ball of lightning with white arcs wrapped round it, replacing the forked spark (CO-137). A cyan and a violet version were tried first: cyan read as Ice, and violet sits so close to the magenta key that the cut left the orb hollow.
- Chain Lightning: a gold zigzag with forks. It moved to its own sheet; the stun sparks stay on `CO-078/lightning_chain.png`, whose first row is retired.
- Tornado: a slate-grey funnel with gold lightning coiled through it, replacing the charcoal and crimson one.
- Lightning Sword: a gold hilt and a jagged blade of electricity.
- Fireball: a white-hot head with a trail of flame tongues. It is a new clip, `fire.ball`; `fire.fly` stays as the Fire Dragon's and the Fire Companion's shot.

Every sheet came from `openai/gpt-image-2` as a JPEG. Before cutting, each one had its magenta fringe snapped to #FF00FF (the house rule, plus any pixel whose red and blue both stand more than 40 above its green) and was saved as a PNG holding only IHDR, IDAT and IEND.

If the tool has a negative-prompt field, paste this into it:

```text
text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, drop shadow, blur, gradient, jpeg artifacts, pink, purple, glow, haze
```

## 1. `lightning_bolt.png`: the ball of lightning in flight

Save as `docs/art/sheets/CO-153/lightning_bolt.png`.

Delivered as: JPEG 1408x480 px (asked 1024x256, 4x1 of 256 px), fringe snapped, saved as PNG. Cuts to a 39x25 art box.

```text
Create one pixel-art animation sheet for a top-down 2D game: a single ball of lightning flying through the air, the projectile a lightning mage throws. Draw only the projectile, no caster, no target and no ground.

The canvas is 1024 by 256 pixels, a grid of 256 pixel square cells, four cells across and one cell down. They read left to right. Each drawing is about 110 pixels long and about 70 pixels tall, centred in its cell, which leaves at least 60 pixels of plain magenta between the drawing and every cell edge.

The projectile flies to the right in every drawing. At the right is a round orb about 60 pixels across: a bright white core inside a pale electric lemon-yellow shell, hex #FFF176, with a solid golden rim, hex #FBC02D, and a one-pixel dark olive-brown outline, hex #3E2F00, so it stands out on a dark floor. The orb is solid and fully opaque, not glassy or see-through. Three or four thin crooked white-yellow arcs of electricity wrap around the orb and leap a little off its surface; they are sharp zigzag lines, not flames. Behind it, trailing off to the left, is a short tapering streak of pale yellow sparks and two small crooked white arcs that fade to loose pixels. The orb is the largest and brightest part; it reads as crackling electricity with a clear front and back, never a fireball and never a straight even band. Use only white, pale lemon yellow and gold: no orange, red, fire, smoke, flame shapes, purple, pink or magenta anywhere in the drawing.

The projectile is drawn in this one facing and no other. It is never turned, tilted, mirrored or angled: the game itself turns the sprite along its flight. Every cell holds the same orb at the same size, with its centre at exactly the same point in its cell.

The four drawings are one flicker loop: the orb stays in place and pulses slightly, and the arcs wrapping it jump to new crooked positions in each drawing, so it reads as live current.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill. Keep the effect's centre and its size the same in every cell, and give every cell visible art.
```

## 2. `lightning_chain.png`: one tileable piece of chain lightning

Save as `docs/art/sheets/CO-153/lightning_chain.png`.

Delivered as: JPEG 1408x480 px (asked 1024x256, 4x1 of 256 px), fringe snapped, saved as PNG. Cuts to a 39x21 art box whose two ends sit on the same rows in all four frames, so the strip tiles without a seam.

```text
Create one pixel-art animation sheet for a top-down 2D game: one straight piece of chain lightning, the arc that jumps from one enemy to the next. The game lays copies of this piece end to end between enemies, so it is a strip, not an object. Draw only the lightning, no creatures and no ground.

The canvas is 1024 by 256 pixels, a grid of 256 pixel square cells, four cells across and one cell down. They read left to right. In every cell the strip runs horizontally, exactly 192 pixels wide and at most 40 pixels tall, centred in the cell so it runs from 32 pixels to 224 pixels across, centred vertically, with both of its ends cut flat at the same height so copies join seamlessly end to end.

The strip is a crackling bolt of electricity: a thick jagged zigzag core of white, three to four pixels thick, wrapped in pale lemon-yellow, hex #FFF176, and edged in gold, hex #FBC02D, with a crisp one-pixel dark olive-brown outline, hex #3E2F00, so it stands out on a dark floor. Two or three short thin forks split off the main line and end in sharp points, and a few loose white-yellow sparks sit beside it. It is solid and fully opaque. Use only white, pale lemon yellow and gold: no orange, red, blue, purple, pink or magenta anywhere in the drawing.

The four drawings are one flicker loop: the same strip in the same place, with its zigzag path, its forks and its sparks jumping into a different crooked shape in each drawing, while both flat ends stay at exactly the same height.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill. Keep the effect's centre and its size the same in every cell, and give every cell visible art.
```

## 3. `lightning_tornado.png`: the drifting storm funnel

Save as `docs/art/sheets/CO-153/lightning_tornado.png`.

Delivered as: JPEG 1024x1024 px (asked 1024x1024, 2x2 of 512 px), fringe snapped, saved as PNG. The manifest keeps `sheetCell` 768 so the funnel cuts at the old resolution (a 130x152 art box); the game scales it to the patch either way.

```text
Create one pixel-art animation sheet for a top-down 2D game: a crackling storm tornado that drifts across the battlefield. Draw only the tornado, no ground and no creatures.

The canvas is 1024 by 1024 pixels, a grid of 512 pixel square cells, two cells across and two cells down, so there are four cells in total. They read left to right along the top row and then left to right along the bottom row. Each drawing is about 350 pixels tall and about 280 pixels wide, centred in its cell, which leaves at least 80 pixels of plain magenta between the drawing and every cell edge.

The tornado is a funnel seen from the three-quarter camera: wide at the top, narrow where it touches the ground, standing straight up. It is built from four or five stacked, curling bands of storm wind in slate blue-grey, hex #5C6B7A, with lighter pale grey tops where the top-left light falls and a crisp one-pixel dark charcoal outline, hex #1C1F24, so it reads clearly on a dark floor. Thick bright lightning bolts coil through the funnel between the bands: a white core wrapped in pale lemon-yellow, hex #FFF176, and gold, hex #FBC02D, crackling in sharp zigzags, with a few sparks jumping off its sides. A small ring of grit and yellow sparks circles its base. It is solid and fully opaque. Use only slate grey, pale grey, charcoal, white, lemon yellow and gold: no orange, red, purple, pink, cyan or magenta anywhere in the drawing.

The four drawings are one loop of the same funnel, its base at the same point in every cell: the wind bands rotate, the lightning bolts jump to different places in the funnel, and the grit orbits round. The funnel keeps the same height and width and never leans over.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill. Keep the effect's centre and its size the same in every cell, and give every cell visible art.
```

## 4. `lightning_sword.png`: the orbiting blade, one facing only

Save as `docs/art/sheets/CO-153/lightning_sword.png`.

Delivered as: JPEG 1408x480 px (asked 1024x256, 4x1 of 256 px), fringe snapped, saved as PNG. It came back shorter in its cell than the old sword, so the manifest cuts it at `sheetCell` 376, which lands on the old 59x22 art box; the ring scales the blade to its size either way, so this only keeps it sharp.

```text
Create one pixel-art animation sheet for a top-down 2D game: a lightning sword that circles the player. Draw only the sword, no player and no ground.

The canvas is 1024 by 256 pixels, a grid of 256 pixel square cells, four cells across and one cell down. They read left to right. Each drawing is about 160 pixels long and about 44 pixels tall, centred in its cell, which leaves at least 48 pixels of plain magenta between the drawing and every cell edge.

The sword lies flat, seen from above, and points to the right in every drawing: at the left end a round gold pommel, then a short dark leather grip, then a wide gold crossguard with small swept points, hex #FBC02D, then the blade running to a sharp point at the right end. The blade is made of solid electricity: a white-hot core down its length, pale lemon-yellow faces, hex #FFF176, and both of its edges shaped as sharp jagged zigzags like a bolt of lightning, not smooth steel. The whole sword has a crisp one-pixel dark olive-brown outline, hex #3E2F00, so it reads clearly on a dark floor, and it is solid and fully opaque. Use only white, lemon yellow, gold and dark brown: no orange, red, blue, purple, pink or magenta anywhere in the drawing.

The sword is drawn in this one facing and no other. It is never turned, tilted, mirrored or angled: the game itself turns the sprite as the sword travels around the player, keeping the hilt pointing at the player and the tip pointing outward, so a drawing that is already angled would be turned twice and point the wrong way. Every cell holds the same sword at the same size, lying along the same horizontal line, with the middle of the sword at exactly the same point in its cell.

The four drawings are one crackle loop: the pommel, grip and crossguard are identical in all four, and only the lightning changes. The white core pulses along the blade, and two or three small sparks jump off different parts of the jagged edges in each drawing.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill. Keep the effect's centre and its size the same in every cell, and give every cell visible art.
```

## 5. `fire_ball.png`: the fireball in flight

Save as `docs/art/sheets/CO-153/fire_ball.png`.

Delivered as: JPEG 1408x480 px (asked 1024x256, 4x1 of 256 px), fringe snapped, saved as PNG. The manifest cuts it at `sheetCell` 200 so the head comes out about the size of the shot's 12 px hit circle (a 26x14 art box, trail included).

```text
Create one pixel-art animation sheet for a top-down 2D game: a single fireball flying through the air, the projectile a fire mage throws. Draw only the fireball, no caster, no target and no ground.

The canvas is 1024 by 256 pixels, a grid of 256 pixel square cells, four cells across and one cell down. They read left to right. Each drawing is about 130 pixels long and about 64 pixels tall, centred in its cell, which leaves at least 60 pixels of plain magenta between the drawing and every cell edge.

The fireball flies to the right in every drawing. At the right is a round head of fire about 56 pixels across: a white-hot core, then bright yellow, hex #FFD54F, then orange, hex #FF6D00, with a crisp one-pixel dark crimson outline, hex #4A0A0A, so it stands out on a dark floor. Behind the head, streaming off to the left, is a teardrop tail of three or four separate flame tongues that curl and taper to sharp points, orange at the root and deep red, hex #C62828, at the tips, with two or three loose embers beyond them. The head is the largest and brightest part; it is one solid, fully opaque object with a clear front and back. Use only white, yellow, orange, red and crimson: no pink, purple, blue or magenta anywhere in the drawing, and no smoke.

The fireball is drawn in this one facing and no other. It is never turned, tilted, mirrored or angled: the game itself turns the sprite along its flight. Every cell holds the same fireball at the same size, with its head at exactly the same point in its cell.

The four drawings are one burning loop: the head stays in place and pulses slightly, and the flame tongues of the tail flicker into a different curl in each drawing.

Style, the same for every sheet in this project: chunky pixel art, crisp hard edges, no blur, anti-aliasing or gradients; three-quarter top-down camera, light from the top-left; a grim fantasy look in the subject's own colours, never in the background; original design.
Background: the file is one sheet of flat magenta #FF00FF with the drawings sitting straight on it. Magenta runs unbroken from one edge of the canvas to the other, behind and between every drawing alike, fully opaque, with no transparency or alpha channel and no texture, noise or vignette.
The cells are a measurement, not something to draw: nothing whatever marks where one ends and the next begins — no tile, panel, square of colour, line, border, divider or frame — and the magenta behind a drawing is the same magenta as beside it. No text anywhere either: one letter, number, label or watermark ruins the sheet.
Every drawing stays inside its own cell at the margin given above and never touches an edge; draw it smaller rather than let it spill. Keep the effect's centre and its size the same in every cell, and give every cell visible art.
```
