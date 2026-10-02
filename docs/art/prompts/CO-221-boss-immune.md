# CO-221 Art: boss "Immune" pop

Ticket: [#389](https://github.com/danhquach/crimsononslaught/issues/389)

The boss now shrugs off stuns and freezes. A small pop over its head says so. At the concept review the PM picked a gold heraldic shield with an ice shard glancing off it. The other two concepts were painted "IMMUNE" lettering and a shield on an "IMMUNE" ribbon. The icon carries no text, so it reads the same in any language. The slow that a freeze turns into on the boss uses the existing slow visual, so it needs no new art.

One sheet. Copy the whole `text` block and paste it as the prompt. Nothing else to add. It is generated as an edit with the chosen concept picture attached as the reference.

If the tool has a negative-prompt field, paste this into it:

```text
text, letters, numbers, words, labels, captions, title, watermark, checkerboard, transparency grid, border, grid lines, floor tiles, blur, gradient, jpeg artifacts, drop shadow, glow halo
```

## 1. `status_immune.png`: the Immune pop

Save as `docs/art/sheets/CO-221/status_immune.png`. Copy the whole block below; it is the complete prompt.

Delivered as: JPEG 1024x1024 px from `openai/gpt-image-2` (quality medium, edit with the chosen concept attached). Magenta fringe snapped with the house rule (`b > 0.8r && g < 0.6r && r > 140` → #FF00FF) and saved as PNG with no C2PA chunk. One drawing, no edge touched, so no re-grid. Cut at `sheetCell` 224, `centred`, on its own atlas page (`props25`) as `status.immune`.

```text
Reproduce only the small glowing gold shield icon from above the demon's head in the attached picture, as one pixel-art game icon: a pale-gold heraldic shield with a bright rim, a jagged crack of broken lightning across its face, and a small pale-blue ice shard with a few ice chips glancing off its top-right edge. Same look and colours as the attached picture, but drawn large and crisp. One icon only, centred, about 700 pixels across, never touching the canvas edge.

Colours: warm gold and pale yellow #FFE27A, #F2B640, #B07A1E with dark bronze #5A3A10 outlines, and pale ice blue #BFE8FF, #6FC3F0 for the shard. No pink, no magenta, no purple anywhere in the icon.

Style: chunky pixel art, crisp hard edges, no blur, no soft glow halo outside the outline, no anti-aliasing or gradients; light from the top-left; original design.
Background: the canvas is flat magenta #FF00FF everywhere outside the icon, fully opaque, no texture, noise, vignette, border, frame, floor or demon. No text anywhere: one letter, number, label or watermark ruins the icon.
```
