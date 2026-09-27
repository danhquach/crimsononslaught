/**
 * The music tracks (CO-157): one loop per stretch of the game, written as
 * notes on a beat grid and rendered with `synth.mjs`, so they are original
 * work under the repository licence and regenerate byte-for-byte.
 *
 * Each track is a whole number of 4/4 bars at its tempo, and `loopMix` folds
 * any note still ringing at the end back onto the start, so the loop point is
 * just another point in the music: no gap, no click. `npm run audio:gen`
 * writes them next to the effects.
 *
 * The run and the boss each have two tracks, and every run draws one of each
 * (`core/musicMix.ts`). All of them keep to the game's dark palette: war
 * drums, timpani, bowed low strings, organ, choir and bell; no drum kit.
 */

import {
  additive,
  envelope,
  hold,
  loopMix,
  lowpass,
  midiHz,
  mix,
  noise,
  sweep,
  triangle,
} from './synth.mjs';

export const BEATS_PER_BAR = 4;

/** A pitched note held for `seconds` on `shape`, with a soft start and end. */
const held = (midi, seconds, shape = Math.sin, attackS = 0.01, releaseS = 0.05) =>
  hold(sweep(seconds, midiHz(midi), midiHz(midi), undefined, shape), attackS, releaseS);

/** A plucked note: instant start, ringing down over `seconds`. */
const pluck = (midi, seconds, shape = Math.sin) =>
  envelope(sweep(seconds, midiHz(midi), midiHz(midi), undefined, shape), 0.004);

/** Overtones at 1/n: a bowed string's buzz before the low-pass. */
const SAW = Array.from({ length: 10 }, (_, k) => [k + 1, 1 / (k + 1)]);
/** Drawbars: a sub-octave, the fundamental and three harmonics. */
const ORGAN = [
  [0.5, 0.6],
  [1, 1],
  [2, 0.7],
  [3, 0.35],
  [4, 0.3],
];
/** A soft, hollow voice for the choir. */
const VOX = [
  [1, 1],
  [2, 0.45],
  [3, 0.2],
  [4, 0.1],
];

/** A bowed low string: saw overtones rolled off at `cutoffHz`, with a little vibrato. */
const strings = (midi, seconds, cutoffHz = 1100) =>
  hold(
    lowpass(additive(seconds, midiHz(midi), SAW, { vibratoHz: 5.5, vibrato: 0.002 }), cutoffHz),
    0.03,
    0.07,
  );

const organ = (midi, seconds) =>
  hold(lowpass(additive(seconds, midiHz(midi), ORGAN), 2600), 0.02, 0.1);

/** One choir voice, `cents` off the note. */
const singer = (midi, seconds, cents, vibratoHz, vibrato) =>
  additive(seconds, midiHz(midi) * 2 ** (cents / 1200), VOX, { vibratoHz, vibrato });

/** Three slightly detuned voices swelling in and out. */
const choir = (midi, seconds) =>
  hold(
    lowpass(
      mix(
        [singer(midi, seconds, -7, 4.8, 0.004), 0.5],
        [singer(midi, seconds, 6, 5.3, 0.004), 0.5],
        [singer(midi, seconds, 0, 5.1, 0.003), 0.5],
      ),
      1600,
    ),
    0.5,
    0.7,
  );

/** A tolling bell: a hum an octave down and inharmonic partials that die away faster. */
const bell = (midi, seconds = 3) =>
  mix(
    [envelope(additive(seconds, midiHz(midi), [[0.5, 1]]), 0.002), 0.5],
    [envelope(additive(seconds, midiHz(midi), [[1, 1]]), 0.002), 0.8],
    [envelope(additive(seconds * 0.6, midiHz(midi), [[2.76, 1]]), 0.002), 0.35],
    [envelope(additive(seconds * 0.35, midiHz(midi), [[5.4, 1]]), 0.002), 0.2],
  );

/** A big war drum: a deep falling thump under a soft skin noise. */
const taiko = (seed) =>
  mix([envelope(sweep(0.55, 95, 46), 0.002), 1], [envelope(noise(0.25, seed, 260), 0.001), 0.45]);

/** A small war drum, for the pickups between the big hits. */
const tom = (seed) =>
  mix(
    [envelope(sweep(0.22, 190, 120), 0.001), 0.7],
    [envelope(noise(0.12, seed, 900), 0.001), 0.3],
  );

/** A tuned kettle drum on `midi`, settling onto its pitch. */
const timpani = (midi, seed) =>
  mix(
    [envelope(sweep(1.1, midiHz(midi) * 1.03, midiHz(midi)), 0.003), 1],
    [envelope(noise(0.3, seed, 180), 0.002), 0.4],
  );

/** A track's beat grid: seconds per beat, and the start of beat `b` of bar `bar`. */
function grid(bpm) {
  const beat = 60 / bpm;
  return { beat, at: (bar, b = 0) => (bar * BEATS_PER_BAR + b) * beat };
}

/** Title and menus: slow, soft and open. A minor, Am–F–C–G, a bar each. */
function menu({ bpm, bars }) {
  const { beat, at } = grid(bpm);
  const chords = [
    { bass: 45, notes: [57, 60, 64] },
    { bass: 41, notes: [57, 60, 65] },
    { bass: 48, notes: [55, 60, 64] },
    { bass: 43, notes: [55, 59, 62] },
  ];
  const arp = [0, 1, 2, 3, 2, 1, 2, 1];
  const events = [];
  for (let bar = 0; bar < bars; bar += 1) {
    const { bass, notes } = chords[bar % chords.length];
    const barS = BEATS_PER_BAR * beat;
    // Pad: each chord swells in and overlaps the next a little.
    for (const note of notes)
      events.push([at(bar), held(note, barS + 0.4, Math.sin, 0.45, 0.6), 0.16]);
    events.push([at(bar), held(bass, barS, triangle, 0.05, 0.35), 0.4]);
    // A slow bell arpeggio an octave up, one note an eighth.
    const tones = [...notes, notes[0] + 12].map((n) => n + 12);
    arp.forEach((index, i) => events.push([at(bar, i / 2), pluck(tones[index], 0.9), 0.1]));
  }
  return loopMix(bars * BEATS_PER_BAR * beat, events);
}

/** Run, war march: D harmonic minor. War drums, a low string riff, a choir on Dm–Bb–Gm–A. */
function runMarch({ bpm, bars }) {
  const { beat, at } = grid(bpm);
  const chords = [
    [50, 53, 57],
    [46, 50, 53],
    [43, 46, 50],
    [45, 49, 52],
    [50, 53, 57],
    [46, 50, 53],
    [48, 52, 55],
    [45, 49, 52],
  ];
  const roots = [38, 34, 31, 33, 38, 34, 36, 33];
  // Semitones from the bar's root, an eighth each: D D F D E D C# D over Dm.
  const riff = [0, 0, 3, 0, 2, 0, -1, 0];
  const drums = [
    [0, true],
    [1, false],
    [1.5, false],
    [2, true],
    [3, false],
    [3.5, false],
    [3.75, false],
  ];
  const events = [];
  for (let bar = 0; bar < bars; bar += 1) {
    for (const [b, big] of drums)
      events.push([at(bar, b), big ? taiko(300 + b * 4) : tom(310 + b * 4), big ? 0.8 : 0.35]);
    riff.forEach((step, i) =>
      events.push([at(bar, i / 2), strings(roots[bar] + 12 + step, beat * 0.45), 0.28]),
    );
    for (const note of chords[bar])
      events.push([at(bar), choir(note + 12, BEATS_PER_BAR * beat + 0.3), 0.12]);
  }
  return loopMix(bars * BEATS_PER_BAR * beat, events);
}

/** Run, gothic organ: C minor. An organ arpeggio, timpani on 1 and 3, a string drone, a tolling bell. */
function runOrgan({ bpm, bars }) {
  const { beat, at } = grid(bpm);
  // Cm Ab Fm G | Cm Ab Bb G
  const roots = [48, 44, 41, 43, 48, 44, 46, 43];
  const shapes = [
    [0, 3, 7, 12, 7, 3, 7, 3],
    [0, 4, 7, 12, 7, 4, 7, 4],
    [0, 3, 7, 12, 7, 3, 7, 3],
    [0, 4, 7, 11, 7, 4, 7, 4],
  ];
  const events = [];
  for (let bar = 0; bar < bars; bar += 1) {
    const root = roots[bar];
    shapes[bar % shapes.length].forEach((step, i) =>
      events.push([at(bar, i / 2), organ(root + 12 + step, beat * 0.48), 0.2]),
    );
    events.push([at(bar, 0), timpani(root - 12, 400), 0.7]);
    events.push([at(bar, 2), timpani(root - 12 + 7, 401), 0.55]);
    events.push([at(bar), strings(root - 12, BEATS_PER_BAR * beat, 700), 0.3]);
    if (bar % 2 === 0) events.push([at(bar), bell(root + 12), 0.25]);
  }
  return loopMix(bars * BEATS_PER_BAR * beat, events);
}

/** Boss, doom: E phrygian. War drums in eighths, strings stabbing E–F, a choir on clashing chords, a deep bell. */
function bossDoom({ bpm, bars }) {
  const { beat, at } = grid(bpm);
  const roots = [40, 41, 40, 38, 40, 41, 43, 41];
  const chords = [
    [52, 55, 59],
    [53, 57, 60],
    [52, 55, 59],
    [50, 53, 57],
    [52, 55, 59],
    [53, 57, 60],
    [55, 58, 62],
    [53, 56, 59],
  ];
  const events = [];
  for (let bar = 0; bar < bars; bar += 1) {
    const root = roots[bar];
    for (let e = 0; e < 8; e += 1) {
      const gain = e % 4 === 0 ? 0.9 : e % 2 === 0 ? 0.6 : 0.3;
      events.push([at(bar, e / 2), e % 2 === 0 ? taiko(500 + e) : tom(510 + e), gain]);
    }
    // Sixteenths on the root, a half step up on the last of each half bar.
    for (let s = 0; s < 16; s += 1) {
      const note = s % 8 === 7 ? root + 1 : root;
      events.push([at(bar, s / 4), strings(note, beat * 0.22, 900), 0.3]);
    }
    for (const note of chords[bar])
      events.push([at(bar), choir(note, BEATS_PER_BAR * beat + 0.3), 0.13]);
    if (bar % 4 === 0) events.push([at(bar), bell(40, 4), 0.3]);
  }
  return loopMix(bars * BEATS_PER_BAR * beat, events);
}

/** Boss, cathedral: A minor. Organ chords with tritone clashes, timpani rolls, racing strings. */
function bossCathedral({ bpm, bars }) {
  const { beat, at } = grid(bpm);
  const chords = [
    [57, 60, 64, 69],
    [58, 62, 65, 70],
    [57, 60, 63, 69],
    [56, 59, 62, 68],
    [57, 60, 64, 69],
    [58, 62, 65, 70],
    [53, 57, 60, 65],
    [56, 59, 64, 68],
  ];
  // Semitones from the chord's root, a sixteenth each.
  const run = [0, 1, 3, 1, 0, -1, 0, 3, 7, 6, 3, 1, 0, 1, 3, 6];
  const events = [];
  for (let bar = 0; bar < bars; bar += 1) {
    const chord = chords[bar];
    for (const b of [0, 1.5, 2.5])
      for (const note of chord)
        events.push([at(bar, b), organ(note - 12, beat * (b === 0 ? 1.4 : 0.9)), 0.1]);
    for (let s = 0; s < 16; s += 1)
      events.push([at(bar, s / 4), strings(chord[0] - 12 + run[s], beat * 0.22, 1300), 0.2]);
    events.push([at(bar, 0), timpani(chord[0] - 24, 600), 0.8]);
    for (const r of [3, 3.25, 3.5, 3.75])
      events.push([at(bar, r), timpani(chord[0] - 24, 601 + r * 4), 0.35]);
    if (bar === 0) events.push([at(bar), bell(45, 4), 0.3]);
  }
  return loopMix(bars * BEATS_PER_BAR * beat, events);
}

/**
 * One entry per `MUSIC_KEYS` key in `src/config/sounds.ts`: its tempo, its
 * length in bars and how it is built. Kept short: a WAV at 22 050 Hz mono is
 * about 43 KiB a second, and Boot loads every track up front.
 */
export const MUSIC_RECIPES = {
  'music.menu': { bpm: 84, bars: 4, render: menu },
  'music.run_march': { bpm: 128, bars: 8, render: runMarch },
  'music.run_organ': { bpm: 126, bars: 8, render: runOrgan },
  'music.boss_doom': { bpm: 144, bars: 8, render: bossDoom },
  'music.boss_cathedral': { bpm: 138, bars: 8, render: bossCathedral },
};

/** A track's length in seconds: its whole bars at its tempo. */
export const trackSeconds = ({ bpm, bars }) => (bars * BEATS_PER_BAR * 60) / bpm;
