# Audio credits

Every clip in this directory is synthesized by `npm run audio:gen`
(`scripts/gen-audio.mjs` with `scripts/lib/synth.mjs`): sine and square sweeps,
seeded noise and simple envelopes, written as 16-bit mono WAV at 22 050 Hz.
No recordings or third-party samples are used.

| File                                                                                    | Source                          | Licence                                 |
| --------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------- |
| `cast.*.wav`, `enemy.*.wav`, `player.*.wav`, `progress.*.wav`, `boss.*.wav`, `ui.*.wav` | Generated in-repo, this project | MIT, same as the repository (`LICENSE`) |

Regenerating is deterministic: the same recipes write byte-identical files.
Replace a clip by editing its recipe, or drop a sourced file in its place and
record its source and licence (CC0 or CC-BY) on a row here.
