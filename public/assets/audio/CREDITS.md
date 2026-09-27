# Audio credits

Every clip in this directory but the four sourced ones below is synthesized by
`npm run audio:gen` (`scripts/gen-audio.mjs` with `scripts/lib/synth.mjs`):
sine and square sweeps, seeded noise and simple envelopes, written as 16-bit
mono WAV at 22 050 Hz.

| File                                                                                                                    | Source                          | Licence                                 |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------- |
| `cast.*.wav`, `enemy.*.wav`, `player.*.wav`, `progress.*.wav`, `pickup.*.wav`, `shield.*.wav`, `boss.*.wav`, `ui.*.wav` | Generated in-repo, this project | MIT, same as the repository (`LICENSE`) |

except these sourced clips (CO-177):

| File                   | Clip                                                             | Source                                                              | Licence |
| ---------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- | ------- |
| `cast.fire.wav`        | Fireball Flame Whoosh Burst 05 (`fire-electric-whoosh-flame-05`) | [SFXMint](https://sfxmint.com/sounds/fire-electric-whoosh-flame-05) | CC0 1.0 |
| `enemy.death.wav`      | Crunchy Retro Game Hit 01 (`retro-game-hit-01`)                  | [SFXMint](https://sfxmint.com/sounds/retro-game-hit-01)             | CC0 1.0 |
| `progress.gem.wav`     | Double-Chime 8-Bit Coin Pickup 13 (`retro-game-coin-13`)         | [SFXMint](https://sfxmint.com/sounds/retro-game-coin-13)            | CC0 1.0 |
| `progress.levelUp.wav` | Ascending Arpeggio 8-Bit Power-Up 25 (`retro-game-power-up-25`)  | [SFXMint](https://sfxmint.com/sounds/retro-game-power-up-25)        | CC0 1.0 |

Regenerating is deterministic: the same recipes write byte-identical files, and
`audio:gen` never writes the sourced clips. To re-cut those, download each
original WAV from `https://sfxmint.com/dl/<slug>.wav` into one directory and
run `npm run audio:cut -- <dir>`. It checks each file against the sha256 pinned
in `scripts/lib/sourcedAudio.mjs`, decodes it with
`ffmpeg -i <slug>.wav -ac 1 -ar 22050 -f f32le -`, then trims silence below
−50 dBFS, skips the clip's `start`, keeps its `seconds` with a 5 ms fade-in and
an 80 ms fade-out, and peak-normalizes like the generated clips. Tune a cut by
editing `start` or `seconds` there.

Replace a clip by editing its recipe, or add a sourced entry and record its
source and licence (CC0 or CC-BY) on a row here.
