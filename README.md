# Text to Music

A browser app that turns text into a speechless piece of music. **Every letter
becomes exactly one note**, and punctuation becomes drum accents over a seeded
groove. Type a sentence, press Play, and hear it.

No audio files, no audio libraries. All sound is synthesized at runtime from
Web Audio oscillators and generated noise buffers.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
```

Then type in the text box and press **Play**.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run sbom` | Regenerate the SBOM into `sbom.cdx.json` |

## How text becomes music

**Each letter is one note.** Case is ignored for pitch (`A` and `a` sound
identical) but used for velocity, so capitalisation reads as a stress mark.
Letters map onto twelve pitch slots: `a`–`l` are slots 0–11, and `m`–`z` wrap
back into the same twelve. A letter's pitch comes *only* from the letter itself
— randomness varies duration, velocity, and timbre, never pitch, which is what
keeps the melody a legible trace of the text.

**Pitch stays in key.** The selected mode constrains every note. For a scale of
length `L`, the letter at index `i` resolves to `degree = i % L`,
`octave = fold(floor(i / L))`. The `fold` caps the rise at two octaves, so
consecutive letters trace an up-and-over contour instead of climbing forever.

**Non-letters shape rhythm.** Spaces and newlines produce no note and only
advance the time cursor — a space is a light rest, a newline a longer breath.
Punctuation produces a drum accent and no note: `.` and `,` give a hat, `!` and
`?` a kick-and-snare hit, and `-`, `(`, `)`, `"` a three-hit fill.

**The seed decides the world.** The text is hashed to a 32-bit seed, which
picks the mode, root note, tempo (84–132 BPM), and drum density. The same text
with the same seed always reproduces the same piece.

## Controls

- **Tempo** — 60–180 BPM. Re-composes live while dragging.
- **Mode** — nine scales, from major and minor through the modes to pentatonic
  and blues.
- **Drums** — hat density and end-of-bar fill probability, 0 to 1.
- **Volume** — master gain.
- **Seed** — the numeric seed. Type any value to reproduce a specific piece;
  it re-derives from the text whenever the text changes.
- **Export WAV** — renders offline and downloads a 16-bit 44.1 kHz stereo file.

## Architecture

`compose()` is a pure function from text plus parameters to a deterministic
`Event[]`. A look-ahead scheduler plays that array through hand-built Web Audio
voices, and a canvas piano-roll reads the same array. Because playback, visuals,
and export all consume one `Event[]`, they cannot drift apart.

```
text ──▶ compose() ──▶ Event[] ──┬──▶ scheduler ──▶ voices ──▶ Web Audio
 (pure, deterministic)           ├──▶ visualizer ──▶ canvas
                                 └──▶ renderWav ──▶ OfflineAudioContext ──▶ .wav
```

Dependencies flow one way only. `music/` imports nothing from `audio/` or
`ui/`. `audio/` touches no DOM element. `ui/` reads state and requests
re-composition. Only `main.js` knows about all three layers.

| File | Responsibility |
| --- | --- |
| `src/music/hash.js` | Text to 32-bit seed; mulberry32 PRNG |
| `src/music/theory.js` | Modes, scales, letter to MIDI to frequency |
| `src/music/compose.js` | Text plus params to `Event[]` |
| `src/audio/voices.js` | Synth voice constructors |
| `src/audio/engine.js` | AudioContext, master chain, transport |
| `src/audio/scheduler.js` | 25 ms look-ahead loop |
| `src/audio/wav.js` | Offline render plus 16-bit WAV encoding |
| `src/ui/visualizer.js` | Canvas piano-roll renderer |
| `src/ui/controls.js` | Slider and button wiring |
| `src/main.js` | Composition root; owns state, wires all three layers |

### Two implementation notes

**Scheduling looks ahead rather than playing on the timer.** `setInterval` is
far too jittery to trigger notes directly. Every 25 ms the scheduler commits
whatever falls inside the next 100 ms straight onto the audio clock, which then
plays it sample-accurately. Timer jitter costs only how early we commit, never
when a note is heard.

**Export reuses the live voices.** `renderWav` schedules the same events
through an `OfflineAudioContext` with the same gain and compression, so the
downloaded file cannot differ from what you just heard — only the rendering
context differs.

## Testing

```bash
npm test
```

53 tests covering PRNG determinism and range, frequency conversion, scale
membership across all nine modes, the two-octave cap, one-note-per-letter,
punctuation producing accents but no notes, uppercase velocity, event sort
order, tempo scaling, truncation of long input, scheduler look-ahead and
stop-release, RIFF header correctness, sample clamping, and the visualizer's
animation loop.

The test environment is Node, so `music/` and the WAV encoder are tested
directly. Web Audio voice construction has no unit tests — asserting on a node
graph would test the browser rather than our logic — so those voices are
exercised through the scheduler and the offline renderer instead.

## SBOM

`sbom.cdx.json` is a CycloneDX 1.5 software bill of materials listing every
package in `package-lock.json`. The app ships no runtime dependencies, so every
entry is build or test tooling (Vite, Vitest, and their transitive packages).

Regenerate it after changing dependencies:

```bash
npm run sbom
```

Each run writes a fresh serial number and timestamp, so the file shows a diff
even when the dependency set is unchanged. Only commit it when dependencies
actually change.