# Art prompt — Phase 1 prop sheet v1 (all 10 texture keys)

Send verbatim to the art agent. Output is one PNG sheet; props are cut out by
chroma key and downscaled 4x into the texture keys in `src/config/colors.ts`.

---

Create ONE sprite prop sheet for a top-down 2D browser game (dark gothic
"bullet heaven" / auto-battler, original design, do not imitate any existing
game).

STYLE
- Chunky pixel art, crisp hard-edged pixels, no anti-aliasing blur, no
  gradients, no outlines thinner than 1 art pixel.
- 3/4 top-down view (camera slightly above and in front), consistent light
  from the top-left on every prop.
- Limited palette, strong silhouettes that stay readable when shrunk 4x.
- Mood: dark crimson / charcoal fantasy. Accent colors listed per prop must
  stay dominant so each prop is identifiable by color alone.

SHEET LAYOUT (strict — I will cut these out by script)
- Landscape image, aspect 5:2 (e.g. 2560 x 1024 px or the closest you can).
- Invisible grid of 5 columns x 2 rows = 10 equal cells (each ~512 x 512).
- Exactly one prop per cell, centered in its cell.
- Every prop must leave at least 64 px of empty background to all four edges
  of its own cell, so neighbouring props are at least 128 px apart.
- Nothing may touch or cross a cell boundary.
- Background: transparent PNG if supported; otherwise one flat solid
  magenta #FF00FF over the whole image (no vignette, no texture, no noise).
- NO drop shadows, NO ground shadows, NO glow halos, NO text, NO labels,
  NO grid lines, NO borders, NO watermark.

PROPS — in this order, left to right, top row then bottom row.
Sizes are the maximum footprint of the prop drawn (target size in px
on the sheet; they will be shrunk 4x in-engine).

Row 1
1. PLAYER HERO — a lone mage/warrior seen from above, facing down-right,
   simple cloak, one visible weapon or staff. Dominant color off-white
   #F5F5F5 with crimson #DC143C trim. Size 112 x 112.
2. SWARM ENEMY — small, round, mindless creature (imp/blob/skull-bug),
   drawn to swarm in large numbers. Dominant bright red #FF5252.
   Size 64 x 64.
3. FAST ENEMY — lean, pointed, arrow-like creature facing UP (north) so it
   can be rotated toward its target. Dominant amber #FFB300.
   Size 80 x 80.
4. TANK ENEMY — heavy, squat, armored brute, blocky silhouette. Dominant
   dark blood red #8E1B1B with dark iron grey armor. Size 128 x 128.
5. BOSS — huge horned demon lord or crimson wraith, seen from above,
   clearly the largest thing on the sheet, imposing but readable. Dominant
   violet #9C27B0 with crimson and black. Size 320 x 320.

Row 2
6. XP GEM — small faceted crystal, taller than wide, glowing from within
   but with NO outer glow beyond its edges. Dominant mint green #69F0AE.
   Size 48 x 64.
7. FIREBALL PROJECTILE — round ball of fire with a short trailing tail,
   facing RIGHT (east) so it can be rotated in flight. Dominant orange
   #FF6D00 with yellow core. Size 64 x 48 including tail.
8. FROST NOVA RING — a hollow circular ring of ice/frost, fully empty
   center, even thickness (about 16 px), no fill inside, no rays outside.
   Dominant icy cyan #40C4FF. Size 384 x 384 (outer diameter).
9. LIGHTNING BOLT SEGMENT — a horizontal jagged lightning strip, left
   end to right end, both ends cut flat so copies can be chained end to
   end. Dominant electric yellow #FFEE58 with white core.
   Size 192 wide x 32 tall.
10. BOULDER — a rough round rock with a few cracks and moss, no ground
    contact shadow. Dominant earthy brown #8D6E63. Size 80 x 80.

CONSISTENCY CHECKS BEFORE YOU FINISH
- 10 props, 10 cells, none empty, none containing two props.
- Every prop fully inside its cell with the 64 px clear margin.
- Same pixel density and light direction on all props.
- Background is one flat color (or transparent) everywhere else.

Deliver: one PNG at the largest resolution available, lossless, no
compression artifacts. Also state the exact pixel dimensions you rendered.
