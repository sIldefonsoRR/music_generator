# Text-to-Melodic-Audio Design

A browser app that turns a block of text into a speechless piece of music. Letters
drive melody, punctuation drives percussion, and the text itself is the seed for
every other musical choice.

Built with Vite and the raw Web Audio API. No audio assets, no audio dependencies.

## Goal

Given a text input, produce audio whose notes and drum hits are derived
deterministically from that text. The same text always produces the same piece.
Different text produces a different piece. The letters must be audible in the
output: a listener should be able to hear the text they typed, without it ever
being spoken.

## Non-goals

- No speech, speech synthesis, or vocal output of any kind.
- No server. Everything runs in the browser.
- No audio sample files. All sound is synthesized from oscillators and
  generated noise buffers.
- No MIDI export, no sheet-music notation display.
- No text analysis beyond character identity. No attempt to understand meaning,
  language, or sentiment. The mapping is arbitrary by design.

## Approach

The text flows one direction through a pure function, then into a real-time
playback engine:

```
text + params ──▶ compose() ──▶ Event[] ──┬──▶ scheduler ──▶ voices ──▶ master ──▶ output
                 (pure, deterministic)    └──▶ visualizer (reads the same array)
```

`compose()` is pure: same text and same seed always produce a byte-identical
event array, with no internal state. Three consumers read that one array — the
live scheduler, the visualizer, and the WAV export — so the displayed timeline,
the played audio, and the exported file cannot drift apart.

Because composition is cheap (a few milliseconds for a few hundred notes) and
side-effect free, changing a parameter re-composes the whole piece from scratch
instead of mutating a running performance. There is no partial-update path to get
out of sync.

Scheduling uses a look-ahead loop: a timer wakes every 25ms, schedules any events
falling inside the next 100ms window, and reads position from
`AudioContext.currentTime`. This is the standard Web Audio two-clock pattern. It
avoids the underruns a bare `setTimeout`-per-note approach would cause, and keeps
a playhead that is genuinely tied to the audio clock rather than estimated.

Pre-rendering the whole piece and playing it as one buffer was considered and
rejected: it cannot support live parameter changes during playback, which the
control bar requires.

## Module layout

| File | Responsibility |
| --- | --- |
| `src/music/hash.js` | Text to 32-bit seed; mulberry32 PRNG |
| `src/music/theory.js` | Modes and scales; letter to degree; degree to frequency |
| `src/music/compose.js` | Text plus params to `Event[]` |
| `src/audio/engine.js` | AudioContext, master chain, transport state |
| `src/audio/scheduler.js` | 25ms look-ahead loop, dispatches events to voices |
| `src/audio/voices.js` | Synth voice constructors |
| `src/audio/wav.js` | OfflineAudioContext render to 16-bit WAV blob |
| `src/ui/visualizer.js` | Canvas piano-roll, reads `Event[]` and transport time |
| `src/ui/controls.js` | Sliders, seed field, play/stop wiring |
| `src/main.js` | Composition root |

Dependencies point one way. `music/` knows nothing about audio or the DOM.
`audio/` knows nothing about the DOM. `ui/` reads state and requests
re-composition. `main.js` is the only module that knows about all three.

## Music mapping

All rules below are deterministic functions of the text and the parameter set.

### Seed and musical world

`hash(text)` produces a 32-bit seed, which seeds a mulberry32 PRNG. From that one
PRNG stream:

- Root pitch, from 12 chromatic options.
- Mode, from 9 options: major, minor, dorian, phrygian, lydian, mixolydian,
  major pentatonic, minor pentatonic, blues.
- Tempo, 84 to 132 BPM.
- Drum density, controlling groove sparsity.

The seed input in the UI defaults to the text's own hash and is independently
editable, so one text can be re-rolled into different pieces.

### Letters to notes

Each letter produces exactly one note. No letter is ever dropped, skipped, or
merged. Letters are `a` through `l`, indices 0 to 11; case is ignored for pitch,
so `A` and `a` sound identical. Case instead sets velocity, with uppercase
louder, treating capitalisation as a stress mark.

For a scale of length `L`, the letter at index `i` resolves to:

```
degree  = i % L
octave  = fold(floor(i / L))
```

Without the `fold` step, consecutive letters always ascend, so `abecedarian`
plays as a strictly rising scale run. `fold` caps the rise at one octave above the
base: when `floor(i / L)` reaches 2, the octave resets to 0 and the ascent starts
again. The twelve letters therefore cover at most two octaves regardless of
scale length, and a twelve-letter word traces an up-and-over contour. The note
count is unaffected; only octave placement changes.

Note duration is 0.5 to 1.5 grid steps, and voice choice varies per note. Both
come from the PRNG, which never overrides a letter's pitch.

### Timing

A 16th-note grid at the chosen tempo. Each letter advances one step, so piece
length is proportional to text length: 200 letters at 120 BPM runs about 50
seconds. Melody and drums read the same clock, so they stay in phase.

- **Space**: shortens the following step, acting as a light rest that keeps the
  pulse. Produces no note.
- **Newline**: adds a two-step breath. Produces no note.
- **Punctuation**: produces a drum accent and no note.

### Punctuation and drums

Two accent strengths:

- `.` `,` `;` `:` — medium accent, plus a hat or tom hit.
- `!` `?` — strong accent, kick and snare together.
- `-` `—` `(` `)` `"` — a fill or hi-hat roll.

A sparse seeded groove runs underneath: kick on the downbeats, snare on beats 2
and 4, hats on eighths. Groove density comes from the seed. Drums therefore
respond to both the punctuation and the seed, and a text sparse in punctuation
sits on a sparser bed.

### Voices

All voices are synthesized. Melodic voices: bass is a filtered sawtooth, lead is
a triangle with a plucked envelope, pad is a detuned pair with a slow attack.
Percussion: kick is a sine swept from 110Hz to 45Hz, snare is noise through a
bandpass with a fast decay, hat is noise through a highpass, tom is a sine
swept downward.

Percussion events carry a distinct type on the `Event` so the visualizer can draw
them differently from melodic notes.

## Event shape

```js
{
  time:      number,  // seconds from piece start
  duration:  number,  // seconds
  freq:      number,  // Hz, null for percussion
  velocity:  number,  // 0..1
  voice:     string,  // 'bass' | 'lead' | 'pad' | 'kick' | 'snare' | 'hat' | 'tom'
  drum:      boolean, // distinguishes percussion from melody
  char:      string,  // source character, for the visualizer
  charIndex: number   // index into the source text
}
```

`char` and `charIndex` are retained so the piano-roll can be read back against
the original text. This project does not highlight characters live in the
textarea; the field exists for future use and for test assertions.

## UI

Full-viewport dark layout in three regions.

**Textarea** at the top. The only text input.

**Control bar** in the middle: play/stop, tempo, seed, mode override, drum
density, master volume.

**Piano-roll canvas** below, the centerpiece. Dark grid, low pitches at the
bottom, melodic lanes separated from one drum lane per percussion type. Notes
draw as short bars, drum hits as diamonds, so punctuation-driven hits read
visually as different from letter-driven notes. A bright playhead sweeps left to
right, positioned from `AudioContext.currentTime`.

Playback flow: play triggers `compose()` from current text and params, starts
the scheduler, and the visualizer animates. Changing any slider or the seed
while playing stops, re-composes with the new settings, and restarts. Stop
cancels the scheduler, releases any ringing voices, and resets the playhead.

## WAV export

Renders through `OfflineAudioContext` using the same `voices.js` and the same
event array as the live playback, so the file is a true render of what was
heard. Outputs 44.1kHz 16-bit PCM WAV and downloads as a blob.

## Error handling

- Empty or whitespace-only text disables play and shows a hint; it does not
  throw.
- An `AudioContext` created suspended by browser autoplay policy is resumed on
  the first user gesture.
- Text longer than 4000 characters is truncated to 2000 with a visible notice.
  Scheduling tens of thousands of oscillators at once would stall the audio
  thread.

## Testing

Vitest, covering the pure core. No browser or audio hardware required.

- Same text and seed produce identical event arrays.
- Different text produces a different event array.
- Every letter in the input yields exactly one melodic event, and the count
  matches.
- Every melodic event's frequency lies within the chosen scale.
- Every punctuation character yields a percussion event and no melodic event.
- The WAV encoder emits a well-formed RIFF header with correct declared sizes.

The visualizer is not unit tested. It renders a known array to a canvas;
asserting on canvas output would be noise.

## Assumptions

- Target is evergreen desktop browsers with Web Audio support. No polyfills.
- Piano-roll dimensions are fixed for now; responsive layout is out of scope.
- The app is English/Latin-script oriented, since the letter mapping is
  `a`-`l`. Other alphabets map by character code modulo 12 and will sound
  different but not break.
