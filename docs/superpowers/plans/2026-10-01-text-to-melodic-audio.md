# Text-to-Melodic-Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Vite web app that turns text into a speechless piece of music, where each letter produces exactly one note and punctuation drives drum accents over a seeded groove.

**Architecture:** `compose()` is a pure function turning text plus parameters into a deterministic `Event[]`. A look-ahead scheduler plays that array through hand-built Web Audio voices while a canvas piano-roll reads the same array, so playback, visuals, and WAV export cannot drift. All sound is synthesized from oscillators and generated noise buffers; no audio assets and no audio dependencies.

**Tech Stack:** Vite, vanilla JavaScript ES modules, raw Web Audio API, Vitest, canvas 2D.

---

## File Structure

Created files and their single responsibilities:

- `package.json` — deps and scripts
- `vite.config.js` — Vite config
- `index.html` — layout skeleton for the three UI regions
- `src/style.css` — dark theme, full-viewport layout
- `src/main.js` — composition root; owns state and wires all three layers
- `src/music/hash.js` — text to 32-bit seed; mulberry32 PRNG
- `src/music/theory.js` — modes, scales, letter to MIDI to frequency
- `src/music/compose.js` — text plus params to `Event[]`
- `src/audio/voices.js` — synth voice constructors
- `src/audio/engine.js` — AudioContext, master chain, transport state
- `src/audio/scheduler.js` — 25ms look-ahead loop
- `src/audio/wav.js` — OfflineAudioContext render plus 16-bit WAV encoding
- `src/ui/visualizer.js` — canvas piano-roll renderer
- `src/ui/controls.js` — slider and button wiring
- `src/music/hash.test.js`
- `src/music/theory.test.js`
- `src/music/compose.test.js`
- `src/audio/wav.test.js`

Dependency direction is strictly one way. `music/` imports nothing from `audio/` or `ui/`. `audio/` imports nothing from the DOM. `ui/` reads state and requests re-composition. Only `main.js` knows about all three layers.

---

## Task 1: Scaffold the Vite project

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `index.html`
- Create: `src/style.css`
- Create: `src/music/hash.test.js`

**Step 1: Write a smoke test that fails without the module**

Create `src/music/hash.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { hashString, mulberry32 } from './hash.js';

describe('hashString', () => {
  it('returns the same value for the same input', () => {
    expect(hashString('hello')).toBe(hashString('hello'));
  });

  it('returns different values for different inputs', () => {
    expect(hashString('hello')).not.toBe(hashString('hallo'));
  });
});

describe('mulberry32', () => {
  it('returns a deterministic sequence for a given seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('produces values in the range 0 to 1', () => {
    const next = mulberry32(999);
    for (let i = 0; i < 200; i++) {
      const v = next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
```

**Step 2: Create package.json and install**

Create `package.json`:

```json
{
  "name": "text-to-melodic-audio",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

Run: `npm install`

Expected: installs vite and vitest, creates `package-lock.json`.

**Step 3: Run the test to verify it fails**

Run: `npm test`

Expected: FAIL with "Cannot find module './hash.js'".

**Step 4: Create vite.config.js**

```js
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
```

**Step 5: Create index.html and src/style.css**

Create `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Text to Music</title>
  </head>
  <body>
    <div id="app">
      <section class="panel panel--text">
        <label for="text-input" class="label">Text</label>
        <textarea
          id="text-input"
          class="textarea"
          spellcheck="false"
          placeholder="Type text. Every letter becomes a note; punctuation becomes drums."
        ></textarea>
        <p id="text-notice" class="notice" hidden></p>
      </section>

      <section class="panel panel--controls">
        <div id="controls"></div>
      </section>

      <section class="panel panel--viz">
        <canvas id="piano-roll" class="canvas"></canvas>
      </section>
    </div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

Create `src/style.css`:

```css
:root {
  --bg: #0b0d12;
  --panel: #131722;
  --border: #232a3a;
  --text: #d7dce5;
  --muted: #6b7488;
  --accent: #4fd1c5;
  --accent-dim: #2c7a72;
  --warn: #e6a23c;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  height: 100%;
  background: var(--bg);
  color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
}

#app {
  display: grid;
  grid-template-rows: minmax(140px, 22%) auto 1fr;
  height: 100vh;
  gap: 1px;
  background: var(--border);
}

.panel {
  background: var(--panel);
  padding: 12px 16px;
  overflow: auto;
}

.label {
  display: block;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  margin-bottom: 6px;
}

.textarea {
  width: 100%;
  height: calc(100% - 24px);
  min-height: 90px;
  resize: none;
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 14px;
  line-height: 1.5;
}

.textarea:focus {
  outline: none;
  border-color: var(--accent-dim);
}

.notice {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--warn);
}

.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 16px;
}

.control {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: var(--muted);
}

.control input[type='range'] {
  width: 120px;
  accent-color: var(--accent);
}

.control input[type='text'],
.control select {
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 12px;
}

.control--value {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--text);
}

.btn {
  background: var(--accent-dim);
  color: #04120f;
  border: none;
  border-radius: 4px;
  padding: 7px 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.btn:disabled {
  background: var(--border);
  color: var(--muted);
  cursor: not-allowed;
}

.btn--secondary {
  background: var(--border);
  color: var(--text);
}

.canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.panel--viz {
  padding: 0;
}
```

**Step 6: Run the test to verify the failure mode changed**

Run: `npm test`

Expected: still FAIL with "Cannot find module './hash.js'" — the config loads now, so the error is about the missing module only.

**Step 7: Commit the scaffold**

```bash
git add package.json package-lock.json vite.config.js index.html src/style.css src/music/hash.test.js
git commit -m "chore: scaffold vite project with vitest and dark UI shell"
```

---

## Task 2: Hashing and PRNG

**Files:**
- Create: `src/music/hash.js`
- Test: `src/music/hash.test.js` (already written in Task 1)

**Step 1: Implement hash.js**

```js
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

`hashString` is FNV-1a. It returns an unsigned 32-bit integer, so seeds are always in range and identical inputs always produce identical seeds.

**Step 2: Run the tests**

Run: `npm test`

Expected: PASS, 4 tests.

**Step 3: Commit**

```bash
git add src/music/hash.js
git commit -m "feat: add FNV-1a hashing and mulberry32 PRNG"
```

---

## Task 3: Musical theory

**Files:**
- Create: `src/music/theory.js`
- Create: `src/music/theory.test.js`

**Step 1: Write the failing tests**

Create `src/music/theory.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  MODES,
  MODE_NAMES,
  midiToFreq,
  letterToMidi,
  isInScale,
  resolvePitch,
} from './theory.js';

describe('midiToFreq', () => {
  it('converts A4 (MIDI 69) to 440Hz', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 5);
  });

  it('doubles frequency per octave', () => {
    expect(midiToFreq(81)).toBeCloseTo(880, 5);
  });
});

describe('letterToMidi', () => {
  it('maps letter index 0 to the scale root', () => {
    expect(letterToMidi(0, 60, 'major')).toBe(60);
  });

  it('wraps the octave back to the base after one octave of ascent', () => {
    // pentatonic has 5 notes, so index 10 is 2 octaves of raw rise
    const folded = letterToMidi(10, 60, 'majorPentatonic');
    const sameLetterUnfolded = letterToMidi(0, 60, 'majorPentatonic');
    expect(folded).toBe(sameLetterUnfolded);
  });

  it('keeps every letter within two octaves of the root', () => {
    for (const mode of MODE_NAMES) {
      for (let i = 0; i < 12; i++) {
        const midi = letterToMidi(i, 60, mode);
        expect(midi).toBeGreaterThanOrEqual(60);
        expect(midi).toBeLessThan(60 + 24);
      }
    }
  });

  it('lands every letter inside the chosen scale', () => {
    for (const mode of MODE_NAMES) {
      for (let i = 0; i < 12; i++) {
        expect(isInScale(letterToMidi(i, 60, mode), 60, mode)).toBe(true);
      }
    }
  });
});

describe('resolvePitch', () => {
  it('treats letters a to l as indices 0 to 11', () => {
    expect(resolvePitch('a')).toBe(0);
    expect(resolvePitch('c')).toBe(2);
    expect(resolvePitch('l')).toBe(11);
  });

  it('wraps m to z back into the twelve pitch slots', () => {
    expect(resolvePitch('m')).toBe(0);
    expect(resolvePitch('n')).toBe(1);
    expect(resolvePitch('z')).toBe(11);
  });

  it('ignores case', () => {
    expect(resolvePitch('A')).toBe(resolvePitch('a'));
    expect(resolvePitch('M')).toBe(resolvePitch('a'));
  });

  it('returns null for non-letters', () => {
    expect(resolvePitch(' ')).toBeNull();
    expect(resolvePitch('!')).toBeNull();
    expect(resolvePitch('3')).toBeNull();
    expect(resolvePitch('ñ')).toBeNull();
  });
});

describe('modes', () => {
  it('exposes nine modes', () => {
    expect(MODE_NAMES).toHaveLength(9);
  });

  it('gives every mode a scale of at least five notes', () => {
    for (const name of MODE_NAMES) {
      expect(MODES[name].length).toBeGreaterThanOrEqual(5);
    }
  });
});
```

**Step 2: Run to verify it fails**

Run: `npm test`

Expected: FAIL with "Cannot find module './theory.js'".

**Step 3: Implement theory.js**

```js
export const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
};

export const MODE_NAMES = Object.keys(MODES);

export const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

export const LETTERS = 'abcdefghijkl';

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function foldOctave(raw) {
  return raw >= 2 ? 0 : raw;
}

export function letterToMidi(letterIndex, rootMidi, mode) {
  const scale = MODES[mode];
  const L = scale.length;
  const degree = letterIndex % L;
  const octave = foldOctave(Math.floor(letterIndex / L));
  return rootMidi + scale[degree] + 12 * octave;
}

export function isInScale(midi, rootMidi, mode) {
  const degree = ((midi - rootMidi) % 12 + 12) % 12;
  return MODES[mode].includes(degree);
}

export function resolvePitch(char) {
  const idx = ALPHABET.indexOf(char.toLowerCase());
  return idx === -1 ? null : idx % LETTERS.length;
}
```

`resolvePitch` accepts every Latin letter and wraps it into the twelve pitch
slots, so `m` sounds like `a`, `n` like `b`, and so on. Without the modulo,
`m`–`z` would silently produce no note at all and every word containing them
would lose part of its melody.

Note the `foldOctave` cap: when the raw octave reaches 2 it resets to 0, so a twelve-letter word covers at most two octaves. The note count is unaffected; only octave placement changes.

**Step 4: Run to verify it passes**

Run: `npm test`

Expected: PASS, all tests including the scale-membership and octave-cap checks.

**Step 5: Commit**

```bash
git add src/music/theory.js src/music/theory.test.js
git commit -m "feat: add modes, scales, and letter to pitch mapping"
```

---

## Task 4: Compose text into events

**Files:**
- Create: `src/music/compose.js`
- Create: `src/music/compose.test.js`

**Step 1: Write the failing tests**

Create `src/music/compose.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { compose, defaultParams, ACCENT_STRENGTH } from './compose.js';
import { MODE_NAMES, isInScale } from './theory.js';

const SAMPLE = 'abecedarian';

function params(overrides = {}) {
  return { ...defaultParams('seed-text'), ...overrides };
}

describe('compose', () => {
  it('is deterministic for the same text and seed', () => {
    const p = params();
    expect(compose(SAMPLE, p)).toEqual(compose(SAMPLE, p));
  });

  it('produces different output for different text', () => {
    expect(compose('aaaa', params())).not.toEqual(compose('bbbb', params()));
  });

  it('produces one note event per letter', () => {
    const events = compose(SAMPLE, params());
    const notes = events.filter((e) => !e.drum);
    expect(notes).toHaveLength(SAMPLE.length);
  });

  it('never emits a note for a space', () => {
    const events = compose('a b c', params());
    expect(events.filter((e) => !e.drum)).toHaveLength(3);
  });

  it('never emits a note for punctuation', () => {
    const events = compose('a, b! c?', params());
    const notes = events.filter((e) => !e.drum);
    expect(notes).toHaveLength(3);
  });

  it('emits an accent drum event for punctuation', () => {
    const events = compose('a, b!', params());
    const hits = events.filter((e) => e.accent);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((e) => e.drum && e.midi === null)).toBe(true);
  });

  it('emits accents for every punctuation mark it maps', () => {
    for (const char of Object.keys(ACCENT_STRENGTH)) {
      const events = compose(`a${char}b`, params());
      const hits = events.filter((e) => e.accent);
      expect(hits.length).toBeGreaterThan(0);
    }
  });

  it('points accent events at the punctuation index in the source text', () => {
    const events = compose('ab,cd', params());
    const hits = events.filter((e) => e.accent);
    expect(hits.every((e) => e.char === ',' && e.charIndex === 2)).toBe(true);
  });

  it('keeps every note inside the chosen scale', () => {
    for (const mode of MODE_NAMES) {
      const p = params({ mode, rootMidi: 48 });
      const notes = compose('abcdefghijkl', p).filter((e) => !e.drum);
      for (const n of notes) {
        expect(isInScale(n.midi, 48, mode)).toBe(true);
      }
    }
  });

  it('gives uppercase letters more velocity than lowercase', () => {
    const events = compose('aA', params());
    const notes = events.filter((e) => !e.drum);
    expect(notes[1].velocity).toBeGreaterThan(notes[0].velocity);
  });

  it('returns events sorted by time', () => {
    const events = compose('hello, world!', params());
    for (let i = 1; i < events.length; i++) {
      expect(events[i].time).toBeGreaterThanOrEqual(events[i - 1].time);
    }
  });

  it('attaches the source character to every note', () => {
    const notes = compose('abc', params()).filter((e) => !e.drum);
    expect(notes.map((e) => e.char).join('')).toBe('abc');
    expect(notes.map((e) => e.charIndex)).toEqual([0, 1, 2]);
  });

  it('emits nothing for empty text', () => {
    expect(compose('', params())).toEqual([]);
  });

  it('produces exactly one note for every Latin letter in a-z', () => {
    const notes = compose('abcdefghijklmnopqrstuvwxyz', params()).filter((e) => !e.drum);
    expect(notes).toHaveLength(26);
    expect(notes.map((e) => e.char).join('')).toBe('abcdefghijklmnopqrstuvwxyz');
  });

  it('gives every letter from the full alphabet a pitch', () => {
    const notes = compose('the quick brown fox jumps over the lazy dog', params())
      .filter((e) => !e.drum);
    expect(notes).toHaveLength(35);
    expect(notes.every((e) => typeof e.midi === 'number' && Number.isFinite(e.midi))).toBe(true);
  });

  it('truncates very long text to the first 2000 characters', () => {
    const long = 'a'.repeat(5000);
    const notes = compose(long, params()).filter((e) => !e.drum);
    expect(notes).toHaveLength(2000);
  });

  it('runs faster at a higher tempo', () => {
    const slow = compose(SAMPLE, params({ tempo: 84 }));
    const fast = compose(SAMPLE, params({ tempo: 132 }));
    const lastOf = (evts) => evts[evts.length - 1].time;
    expect(lastOf(fast)).toBeLessThan(lastOf(slow));
  });
});

describe('defaultParams', () => {
  it('derives a mode, root, tempo, and density from the seed', () => {
    const p = defaultParams('some text');
    expect(MODE_NAMES).toContain(p.mode);
    expect(p.rootMidi).toBeGreaterThanOrEqual(36);
    expect(p.rootMidi).toBeLessThanOrEqual(48);
    expect(p.tempo).toBeGreaterThanOrEqual(84);
    expect(p.tempo).toBeLessThanOrEqual(132);
    expect(p.drumDensity).toBeGreaterThanOrEqual(0);
    expect(p.drumDensity).toBeLessThanOrEqual(1);
  });
});
```

**Step 2: Run to verify it fails**

Run: `npm test`

Expected: FAIL with "Cannot find module './compose.js'".

**Step 3: Implement compose.js**

```js
import { hashString, mulberry32 } from './hash.js';
import { MODE_NAMES, letterToMidi, midiToFreq, resolvePitch } from './theory.js';

export const ACCENT_STRENGTH = {
  '.': 'medium',
  ',': 'medium',
  ';': 'medium',
  ':': 'medium',
  '!': 'strong',
  '?': 'strong',
  '-': 'fill',
  '—': 'fill',
  '(': 'fill',
  ')': 'fill',
  '"': 'fill',
};

export const MAX_TEXT_LENGTH = 4000;
export const TRUNCATE_TO = 2000;

const STEPS_PER_BEAT = 4;

const ACCENT_DRUM = {
  medium: ['hat'],
  strong: ['kick', 'snare'],
  fill: ['hat', 'hat', 'hat'],
};

export function defaultParams(seedSource) {
  const seed = hashString(seedSource);
  const next = mulberry32(seed);
  return {
    seed,
    mode: MODE_NAMES[Math.floor(next() * MODE_NAMES.length) % MODE_NAMES.length],
    rootMidi: 36 + Math.floor(next() * 13),
    tempo: Math.round(84 + next() * 48),
    drumDensity: next(),
  };
}

function accentEvents(char, charIndex, time, step, strength, velocity) {
  const drums = ACCENT_DRUM[strength] ?? ACCENT_DRUM.medium;
  return drums.map((voice, i) => ({
    time: time + i * step * 0.5,
    duration: step * 0.5,
    freq: null,
    midi: null,
    velocity: Math.min(1, velocity + i * 0.05),
    voice,
    drum: true,
    accent: true,
    char,
    charIndex,
  }));
}

function grooveEvents(params, totalSteps, step, next) {
  const events = [];
  const density = params.drumDensity;
  const push = (voice, s, velocity) => {
    events.push({
      time: s * step,
      duration: step * 0.9,
      freq: null,
      midi: null,
      velocity,
      voice,
      drum: true,
      accent: false,
      char: '',
      charIndex: -1,
    });
  };

  for (let s = 0; s < totalSteps; s++) {
    const inBar = s % 16;

    if (inBar === 0 || inBar === 10) {
      push('kick', s, 0.9);
    }

    if (inBar === 4 || inBar === 12) {
      push('snare', s, 0.8);
    }

    if (inBar % 2 === 0 && next() < 0.35 + density * 0.5) {
      push('hat', s, 0.45);
    }

    if (inBar === 14 && next() < density) {
      push('hat', s + 0.5, 0.5);
      push('tom', s + 0.75, 0.6);
    }
  }

  return events;
}

export function compose(text, params) {
  if (typeof text !== 'string' || text.trim() === '') {
    return [];
  }

  const { mode, rootMidi, tempo, drumDensity, seed } = params;
  const next = mulberry32(seed);
  const step = 60 / tempo / STEPS_PER_BEAT;
  const events = [];

  const source = text.length > MAX_TEXT_LENGTH ? text.slice(0, TRUNCATE_TO) : text;
  let cursor = 0;
  let letterCount = 0;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const time = cursor * step;
    const strength = ACCENT_STRENGTH[char];

    if (char === ' ' || char === '\t') {
      cursor += 0.5;
      continue;
    }

    if (char === '\n' || char === '\r') {
      cursor += 2;
      continue;
    }

    if (strength) {
      events.push(...accentEvents(char, i, time, step, strength, 0.7));
      cursor += 0.5;
      continue;
    }

    const letterIndex = resolvePitch(char);
    if (letterIndex === null) {
      cursor += 0.5;
      continue;
    }

    const midi = letterToMidi(letterIndex, rootMidi, mode);
    const duration = 0.5 + next();
    const isUpper = char !== char.toLowerCase();
    const velocity = isUpper ? 0.75 + next() * 0.25 : 0.35 + next() * 0.3;
    const voice = next() < 0.55 ? 'lead' : next() < 0.85 ? 'pad' : 'bass';

    events.push({
      time,
      duration: duration * step,
      freq: midiToFreq(midi),
      midi,
      velocity,
      voice,
      drum: false,
      accent: false,
      char,
      charIndex: i,
    });

    letterCount++;
    cursor += 1;
  }

  const totalSteps = Math.ceil(cursor) + 1;
  events.push(...grooveEvents({ drumDensity }, totalSteps, step, next));

  events.sort((a, b) => a.time - b.time);
  return events;
}

export function countLetters(text) {
  let n = 0;
  for (const char of text) {
    if (resolvePitch(char) !== null) n++;
  }
  return n;
}
```

Two things to note about this implementation. First, `defaultParams` consumes PRNG values in a fixed order — mode, root, tempo, density — so the same seed always yields the same world. Second, `compose` seeds its own PRNG from `params.seed` and only uses it for duration, velocity, and voice, never for pitch, which is what keeps the text legible in the output.

**Step 4: Run to verify it passes**

Run: `npm test`

Expected: PASS, including the one-note-per-letter, scale-membership, punctuation, and sort-order tests.

**Step 5: Commit**

```bash
git add src/music/compose.js src/music/compose.test.js
git commit -m "feat: compose text into deterministic note and drum events"
```

---

## Task 5: Synth voices

**Files:**
- Create: `src/audio/voices.js`

This task has no unit tests. Web Audio voice construction needs a live AudioContext, and asserting on node graphs would test the browser rather than our logic. The voices are exercised by ear through Tasks 6 and 8, and indirectly by the WAV render test in Task 7.

**Step 1: Implement voices.js**

```js
let sharedNoise = null;
const sourcesByCtx = new WeakMap();

function track(ctx, node) {
  let set = sourcesByCtx.get(ctx);
  if (!set) {
    set = new Set();
    sourcesByCtx.set(ctx, set);
  }
  set.add(node);
  node.onended = () => set.delete(node);
  return node;
}

export function stopAllVoices(ctx) {
  const set = sourcesByCtx.get(ctx);
  if (!set) return;
  const at = ctx.currentTime + 0.03;
  for (const node of set) {
    try {
      node.stop(at);
    } catch {
      set.delete(node);
    }
  }
  set.clear();
}

export function noiseBuffer(ctx) {
  if (sharedNoise && sharedNoise.sampleRate === ctx.sampleRate) {
    return sharedNoise;
  }
  const length = Math.floor(ctx.sampleRate * 2);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  sharedNoise = buffer;
  return buffer;
}

function envelope(param, at, peak, attack, decay) {
  param.setValueAtTime(0.0001, at);
  param.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
  param.exponentialRampToValueAtTime(0.0001, at + attack + decay);
}

function tone(ctx, dest, at, opts) {
  const { freq, duration, velocity, type, detune = 0 } = opts;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (detune) osc.detune.setValueAtTime(detune, at);

  const peak = Math.max(0.0002, velocity);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  osc.connect(gain).connect(dest);
  track(ctx, osc);
  osc.start(at);
  osc.stop(at + duration + 0.05);
}

function noiseHit(ctx, dest, at, opts) {
  const { duration, velocity, filterType, freq, q = 1 } = opts;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(freq, at);
  filter.Q.setValueAtTime(q, at);

  const gain = ctx.createGain();
  const peak = Math.max(0.0002, velocity);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  src.connect(filter).connect(gain).connect(dest);
  track(ctx, src);
  src.start(at);
  src.stop(at + duration + 0.02);
}

export function playLead(ctx, dest, ev) {
  tone(ctx, dest, ev.time, {
    freq: ev.freq,
    duration: ev.duration,
    velocity: ev.velocity * 0.5,
    type: 'triangle',
  });
}

export function playPad(ctx, dest, ev) {
  tone(ctx, dest, ev.time, {
    freq: ev.freq,
    duration: ev.duration * 1.6,
    velocity: ev.velocity * 0.18,
    type: 'sawtooth',
    detune: 7,
  });
  tone(ctx, dest, ev.time, {
    freq: ev.freq,
    duration: ev.duration * 1.6,
    velocity: ev.velocity * 0.14,
    type: 'sawtooth',
    detune: -7,
  });
}

export function playBass(ctx, dest, ev) {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(Math.min(ev.freq * 4, 2200), ev.time);
  filter.Q.setValueAtTime(6, ev.time);
  filter.connect(dest);

  tone(ctx, filter, ev.time, {
    freq: ev.freq / 2,
    duration: ev.duration * 1.2,
    velocity: ev.velocity * 0.45,
    type: 'sawtooth',
  });
}

export function playKick(ctx, dest, ev) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(110, ev.time);
  osc.frequency.exponentialRampToValueAtTime(45, ev.time + 0.12);

  gain.gain.setValueAtTime(Math.max(0.0002, ev.velocity), ev.time);
  gain.gain.exponentialRampToValueAtTime(0.0001, ev.time + 0.28);

  osc.connect(gain).connect(dest);
  track(ctx, osc);
  osc.start(ev.time);
  osc.stop(ev.time + 0.32);
}

export function playSnare(ctx, dest, ev) {
  noiseHit(ctx, dest, ev.time, {
    duration: 0.16,
    velocity: ev.velocity * 0.5,
    filterType: 'bandpass',
    freq: 1900,
    q: 0.9,
  });
  tone(ctx, dest, ev.time, {
    freq: 190,
    duration: 0.09,
    velocity: ev.velocity * 0.25,
    type: 'triangle',
  });
}

export function playHat(ctx, dest, ev) {
  noiseHit(ctx, dest, ev.time, {
    duration: 0.05,
    velocity: ev.velocity * 0.35,
    filterType: 'highpass',
    freq: 7000,
  });
}

export function playTom(ctx, dest, ev) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, ev.time);
  osc.frequency.exponentialRampToValueAtTime(120, ev.time + 0.16);

  gain.gain.setValueAtTime(Math.max(0.0002, ev.velocity * 0.6), ev.time);
  gain.gain.exponentialRampToValueAtTime(0.0001, ev.time + 0.22);

  osc.connect(gain).connect(dest);
  track(ctx, osc);
  osc.start(ev.time);
  osc.stop(ev.time + 0.26);
}

const VOICES = {
  lead: playLead,
  pad: playPad,
  bass: playBass,
  kick: playKick,
  snare: playSnare,
  hat: playHat,
  tom: playTom,
};

export function playEvent(ctx, dest, ev) {
  const voice = VOICES[ev.voice];
  if (voice) voice(ctx, dest, ev);
}
```

The noise buffer is cached across contexts keyed on sample rate, since generating two seconds of random samples per hat hit would be wasteful.

**Step 2: Verify the module imports cleanly**

Run:

```bash
node --input-type=module -e "import('./src/audio/voices.js').then(()=>console.log('voices.js imports ok'),e=>{console.error(e.message);process.exit(1)})"
```

Expected: prints `voices.js imports ok`. Any syntax error fails the command. This module declares only function references at top level, so it must import in bare Node with no browser globals.

**Step 3: Commit**

```bash
git add src/audio/voices.js
git commit -m "feat: add synthesized lead, pad, bass, and percussion voices"
```

---

## Task 6: Engine and look-ahead scheduler

**Files:**
- Create: `src/audio/engine.js`
- Create: `src/audio/scheduler.js`
- Create: `src/audio/scheduler.test.js`

**Step 1: Implement engine.js**

```js
import { playEvent, stopAllVoices } from './voices.js';

export function createEngine() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();

  const master = ctx.createGain();
  master.gain.value = 0.8;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.ratio.value = 6;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.18;

  master.connect(compressor).connect(ctx.destination);

  return {
    ctx,
    master,
    setVolume(v) {
      master.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
    },
    resume() {
      if (ctx.state === 'suspended') return ctx.resume();
      return Promise.resolve();
    },
    play(ev) {
      playEvent(ctx, master, ev);
    },
    stopAll() {
      stopAllVoices(ctx);
    },
  };
}
```

**Step 2: Implement scheduler.js**

```js
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.1;

export function createScheduler(engine, { onTick, onEnd } = {}) {
  let timer = null;
  let events = [];
  let index = 0;
  let startTime = 0;

  function clearTimer() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  function tick() {
    const now = engine.ctx.currentTime;
    const elapsed = now - startTime;
    const end = events.length ? events[events.length - 1].time : 0;

    while (index < events.length && events[index].time < elapsed + SCHEDULE_AHEAD_S) {
      const ev = events[index];
      engine.play({ ...ev, time: startTime + ev.time });
      index++;
    }

    if (onTick) onTick(elapsed);

    if (index >= events.length && elapsed > end + 0.2) {
      clearTimer();
      if (onEnd) onEnd();
    }
  }

  function start(next) {
    clearTimer();
    engine.stopAll();
    events = next;
    index = 0;
    if (events.length === 0) return;
    startTime = engine.ctx.currentTime + 0.06;
    timer = setInterval(tick, LOOKAHEAD_MS);
  }

  function stop() {
    clearTimer();
    engine.stopAll();
  }

  function position() {
    if (timer === null) return 0;
    return Math.max(0, engine.ctx.currentTime - startTime);
  }

  function isPlaying() {
    return timer !== null;
  }

  return { start, stop, position, isPlaying };
}
```

The 0.06s start offset gives the first events room to be scheduled ahead of the audio clock. `stop()` clears the interval and calls `engine.stopAll()`, which halts every tracked source 30ms out — long enough to avoid a click, short enough that Stop feels immediate. `start()` also calls `stopAll()` first, so restarting mid-playback never stacks two performances.

**Step 3: Write the failing scheduler tests**

Create `src/audio/scheduler.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createScheduler } from './scheduler.js';

function fakeEngine() {
  return {
    ctx: { currentTime: 0 },
    play: vi.fn(),
    stopAll: vi.fn(),
  };
}

const EVENTS = [
  { time: 0, voice: 'lead' },
  { time: 0.5, voice: 'lead' },
  { time: 1.0, voice: 'lead' },
];

describe('createScheduler', () => {
  let engine;

  beforeEach(() => {
    vi.useFakeTimers();
    engine = fakeEngine();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not start for an empty event list', () => {
    const scheduler = createScheduler(engine);
    scheduler.start([]);
    expect(scheduler.isPlaying()).toBe(false);
  });

  it('reports playing once started', () => {
    const scheduler = createScheduler(engine);
    scheduler.start(EVENTS);
    expect(scheduler.isPlaying()).toBe(true);
  });

  it('releases existing voices before playing a new run', () => {
    const scheduler = createScheduler(engine);
    scheduler.start(EVENTS);
    engine.stopAll.mockClear();
    scheduler.start(EVENTS);
    expect(engine.stopAll).toHaveBeenCalledTimes(1);
  });

  it('schedules events into the audio clock, offset by the start time', () => {
    const scheduler = createScheduler(engine);
    scheduler.start(EVENTS);
    engine.stopAll.mockClear();

    engine.ctx.currentTime = 0.5;
    vi.advanceTimersByTime(25);

    expect(engine.play).toHaveBeenCalledTimes(2);
    expect(engine.play.mock.calls[0][0].time).toBeCloseTo(0.06, 5);
    expect(engine.play.mock.calls[1][0].time).toBeCloseTo(0.56, 5);
  });

  it('holds events beyond the look-ahead window until they are close', () => {
    const scheduler = createScheduler(engine);
    scheduler.start(EVENTS);
    engine.play.mockClear();

    engine.ctx.currentTime = 0.0;
    vi.advanceTimersByTime(25);

    expect(engine.play).toHaveBeenCalledTimes(1);
  });

  it('releases voices and clears the timer on stop', () => {
    const scheduler = createScheduler(engine);
    scheduler.start(EVENTS);
    engine.stopAll.mockClear();
    engine.play.mockClear();

    scheduler.stop();

    expect(scheduler.isPlaying()).toBe(false);
    expect(engine.stopAll).toHaveBeenCalledTimes(1);

    engine.ctx.currentTime = 5;
    vi.advanceTimersByTime(250);
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('reports the elapsed playhead position', () => {
    const scheduler = createScheduler(engine);
    scheduler.start(EVENTS);
    engine.ctx.currentTime = 1.0;
    expect(scheduler.position()).toBeCloseTo(0.94, 5);
  });

  it('reports position 0 when stopped', () => {
    const scheduler = createScheduler(engine);
    expect(scheduler.position()).toBe(0);
  });

  it('fires onEnd once playback passes the final event', () => {
    const onEnd = vi.fn();
    const scheduler = createScheduler(engine, { onEnd });
    scheduler.start(EVENTS);

    engine.ctx.currentTime = 2.0;
    vi.advanceTimersByTime(25);

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(scheduler.isPlaying()).toBe(false);
  });
});
```

**Step 4: Run the scheduler tests**

Run: `npx vitest run src/audio/scheduler.test.js`

Expected: PASS, all cases. If `schedules events into the audio clock` fails, the start offset or look-ahead comparison is inverted.

**Step 5: Commit**

```bash
git add src/audio/engine.js src/audio/scheduler.js src/audio/scheduler.test.js
git commit -m "feat: add audio engine and 25ms look-ahead scheduler"
```

---

## Task 7: WAV export

**Files:**
- Create: `src/audio/wav.js`
- Create: `src/audio/wav.test.js`

**Step 1: Write the failing tests**

Create `src/audio/wav.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { encodeWav } from './wav.js';

function fakeBuffer(channels, frames, sampleRate) {
  const data = [];
  for (let c = 0; c < channels; c++) {
    const arr = new Float32Array(frames);
    for (let i = 0; i < frames; i++) arr[i] = Math.sin(i * 0.1) * 0.5;
    data.push(arr);
  }
  return { numberOfChannels: channels, length: frames, sampleRate, getChannelData: (c) => data[c] };
}

describe('encodeWav', () => {
  it('starts with a RIFF header', () => {
    const view = new DataView(encodeWav(fakeBuffer(1, 100, 44100)).buffer);
    const tag = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3)
    );
    expect(tag).toBe('RIFF');
  });

  it('declares WAVE and PCM format', () => {
    const bytes = new Uint8Array(encodeWav(fakeBuffer(1, 100, 44100)).buffer);
    const wave = String.fromCharCode(...bytes.slice(8, 12));
    const audioFmt = String.fromCharCode(...bytes.slice(20, 24));
    expect(wave).toBe('WAVE');
    expect(audioFmt).toBe('fmt ');
  });

  it('declares the correct total size', () => {
    const buffer = fakeBuffer(1, 100, 44100);
    const bytes = encodeWav(buffer);
    const view = new DataView(bytes.buffer);
    const declared = view.getUint32(4, true);
    expect(declared).toBe(bytes.byteLength - 8);
  });

  it('declares 16-bit mono at the buffer sample rate', () => {
    const view = new DataView(encodeWav(fakeBuffer(1, 100, 44100)).buffer);
    expect(view.getUint16(20 + 2, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(44100);
  });

  it('sizes the data chunk for stereo', () => {
    const buffer = fakeBuffer(2, 100, 44100);
    const view = new DataView(encodeWav(buffer).buffer);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(40, true)).toBe(100 * 2 * 2);
  });

  it('clamps samples beyond full scale instead of wrapping', () => {
    const buffer = fakeBuffer(1, 4, 44100);
    const data = buffer.getChannelData(0);
    data[0] = 2.0;
    data[1] = -2.0;
    data[2] = 0;
    data[3] = 1;
    const view = new DataView(encodeWav(buffer).buffer);
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32768);
    expect(view.getInt16(48, true)).toBe(0);
    expect(view.getInt16(50, true)).toBe(32767);
  });
});

describe('renderWav', () => {
  it('rejects when OfflineAudioContext is unavailable', async () => {
    const { renderWav } = await import('./wav.js');
    const original = globalThis.OfflineAudioContext;
    delete globalThis.OfflineAudioContext;
    await expect(renderWav([], 1)).rejects.toThrow(/OfflineAudioContext/);
    globalThis.OfflineAudioContext = original;
  });
});
```

**Step 2: Run to verify it fails**

Run: `npm test`

Expected: FAIL with "Cannot find module './wav.js'".

**Step 3: Implement wav.js**

```js
import { playEvent } from './voices.js';

function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

export function encodeWav(buffer) {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataBytes = frames * blockAlign;

  const arrayBuffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(arrayBuffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const sample = buffer.getChannelData(c)[i];
      const clamped = sample > 1 ? 1 : sample < -1 ? -1 : sample;
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
      offset += 2;
    }
  }

  return new Uint8Array(arrayBuffer);
}

export async function renderWav(events, volume = 0.8) {
  if (typeof globalThis.OfflineAudioContext === 'undefined') {
    throw new Error('OfflineAudioContext is not available in this browser');
  }

  const end = events.length ? events[events.length - 1].time + events[events.length - 1].duration : 1;
  const tail = 0.5;
  const frames = Math.ceil((end + tail) * 44100);

  const ctx = new OfflineAudioContext(2, frames, 44100);

  const master = ctx.createGain();
  master.gain.value = volume;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.ratio.value = 6;
  master.connect(compressor).connect(ctx.destination);

  for (const ev of events) {
    playEvent(ctx, master, ev);
  }

  const buffer = await ctx.startRendering();
  return encodeWav(buffer);
}

export function downloadWav(bytes, filename = 'piece.wav') {
  const blob = new Blob([bytes], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

The clamp before conversion matters: without it, a sample above 1.0 wraps to the opposite sign and produces audible digital clipping artifacts.

**Step 4: Run to verify it passes**

Run: `npm test`

Expected: PASS, including the RIFF header, size, and clamping checks.

**Step 5: Commit**

```bash
git add src/audio/wav.js src/audio/wav.test.js
git commit -m "feat: add offline WAV render and 16-bit encoder"
```

---

## Task 8: Piano-roll visualizer

**Files:**
- Create: `src/ui/visualizer.js`

**Step 1: Implement visualizer.js**

```js
const COLORS = {
  lead: '#4fd1c5',
  pad: '#7c8cf8',
  bass: '#3b7dd8',
  kick: '#e0533f',
  snare: '#e6a23c',
  hat: '#8a94a8',
  tom: '#c96fd0',
  playhead: '#ffffff',
};

export function createVisualizer(canvas) {
  const ctx = canvas.getContext('2d');
  let events = [];
  let duration = 0;
  let minMidi = 127;
  let maxMidi = 0;
  let raf = null;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return rect;
  }

  function setEvents(next) {
    events = next;
    duration = events.length
      ? events[events.length - 1].time + events[events.length - 1].duration
      : 0;

    const midis = events.filter((e) => !e.drum).map((e) => e.midi);
    if (midis.length) {
      minMidi = Math.min(...midis);
      maxMidi = Math.max(...midis);
    } else {
      minMidi = 48;
      maxMidi = 72;
    }
    if (maxMidi - minMidi < 12) maxMidi = minMidi + 12;
  }

  function draw(position) {
    const rect = resize();
    const w = rect.width;
    const h = rect.height;

    ctx.fillStyle = '#0d1017';
    ctx.fillRect(0, 0, w, h);

    const drumLanes = 5;
    const drumHeight = Math.min(28, h / (drumLanes + 2));
    const drumTop = h - drumLanes * drumHeight;
    const rollTop = 8;
    const rollHeight = drumTop - rollTop - 8;

    ctx.strokeStyle = '#1b2130';
    ctx.lineWidth = 1;

    const span = Math.max(1, maxMidi - minMidi);
    for (let i = 0; i <= span; i++) {
      const y = drumTop - (i / span) * rollHeight;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    for (let i = 0; i <= duration; i += 0.5) {
      const x = (i / Math.max(0.001, duration)) * w;
      ctx.beginPath();
      ctx.moveTo(x, rollTop);
      ctx.lineTo(x, drumTop);
      ctx.stroke();
    }

    const laneIndex = { kick: 0, snare: 1, hat: 2, tom: 3 };

    for (const ev of events) {
      const x = (ev.time / Math.max(0.001, duration)) * w;
      const color = COLORS[ev.voice] ?? '#666';

      if (ev.drum) {
        const lane = laneIndex[ev.voice];
        if (lane === undefined) continue;
        const cy = h - (lane + 0.5) * drumHeight;
        const r = Math.min(4, drumHeight * 0.25) * (0.6 + ev.velocity * 0.6);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, cy - r);
        ctx.lineTo(x + r, cy);
        ctx.lineTo(x, cy + r);
        ctx.lineTo(x - r, cy);
        ctx.closePath();
        ctx.fill();
      } else {
        const norm = (ev.midi - minMidi) / span;
        const y = drumTop - norm * rollHeight;
        const wpx = Math.max(2, (ev.duration / Math.max(0.001, duration)) * w);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.35 + ev.velocity * 0.65;
        ctx.fillRect(x, y - 2, wpx, 4);
        ctx.globalAlpha = 1;
      }
    }

    const px = (position / Math.max(0.001, duration)) * w;
    ctx.strokeStyle = COLORS.playhead;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, rollTop);
    ctx.lineTo(px, drumTop);
    ctx.stroke();
  }

  function loop(getPosition) {
    draw(getPosition());
    raf = requestAnimationFrame(loop);
  }

  function start(getPosition) {
    stop();
    raf = requestAnimationFrame(loop.bind(null, getPosition));
  }

  function stop() {
    if (raf !== null) {
      cancelAnimationFrame(raf);
      raf = null;
    }
  }

  return { setEvents, draw, start, stop, resize };
}
```

**Step 2: Commit**

```bash
git add src/ui/visualizer.js
git commit -m "feat: add canvas piano-roll visualizer with playhead"
```

---

## Task 9: Controls and composition root

**Files:**
- Create: `src/ui/controls.js`
- Create: `src/main.js`

**Step 1: Implement controls.js**

```js
const MODE_OPTIONS = [
  'major',
  'minor',
  'dorian',
  'phrygian',
  'lydian',
  'mixolydian',
  'majorPentatonic',
  'minorPentatonic',
  'blues',
];

function field(label, control, valueEl) {
  const wrap = document.createElement('div');
  wrap.className = 'control';
  const id = `ctl-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  control.id = id;
  const lab = document.createElement('label');
  lab.htmlFor = id;
  lab.textContent = label;
  wrap.append(lab, control);
  if (valueEl) {
    valueEl.className = 'control--value';
    wrap.append(valueEl);
  }
  return wrap;
}

function slider(min, max, step, value) {
  const el = document.createElement('input');
  el.type = 'range';
  el.min = min;
  el.max = max;
  el.step = step;
  el.value = value;
  return el;
}

export function createControls(root, params, handlers) {
  const value = (v) => {
    const el = document.createElement('span');
    el.textContent = v;
    return el;
  };

  const playBtn = document.createElement('button');
  playBtn.className = 'btn';
  playBtn.textContent = 'Play';
  playBtn.addEventListener('click', handlers.onPlay);

  const stopBtn = document.createElement('button');
  stopBtn.className = 'btn btn--secondary';
  stopBtn.textContent = 'Stop';
  stopBtn.addEventListener('click', handlers.onStop);

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn btn--secondary';
  exportBtn.textContent = 'Export WAV';
  exportBtn.addEventListener('click', handlers.onExport);

  const playWrap = document.createElement('div');
  playWrap.className = 'control';
  playWrap.append(playBtn, stopBtn, exportBtn);

  const tempo = slider(60, 180, 1, params.tempo);
  const tempoVal = value(`${params.tempo} bpm`);
  tempo.addEventListener('input', () => {
    tempoVal.textContent = `${tempo.value} bpm`;
    handlers.onParam('tempo', Number(tempo.value));
  });

  const mode = document.createElement('select');
  for (const name of MODE_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    mode.append(opt);
  }
  mode.value = params.mode;
  mode.addEventListener('change', () => handlers.onParam('mode', mode.value));

  const density = slider(0, 1, 0.01, params.drumDensity);
  const densityVal = value(params.drumDensity.toFixed(2));
  density.addEventListener('input', () => {
    densityVal.textContent = Number(density.value).toFixed(2);
    handlers.onParam('drumDensity', Number(density.value));
  });

  const volume = slider(0, 1, 0.01, 0.8);
  const volumeVal = value('0.80');
  volume.addEventListener('input', () => {
    volumeVal.textContent = Number(volume.value).toFixed(2);
    handlers.onVolume(Number(volume.value));
  });

  const seed = document.createElement('input');
  seed.type = 'text';
  seed.value = String(params.seed);
  seed.addEventListener('change', () => {
    const parsed = Number(seed.value);
    handlers.onSeed(Number.isFinite(parsed) ? parsed >>> 0 : params.seed);
  });

  root.replaceChildren(
    playWrap,
    field('Tempo', tempo, tempoVal),
    field('Mode', mode),
    field('Drums', density, densityVal),
    field('Volume', volume, volumeVal),
    field('Seed', seed)
  );

  return {
    setPlaying(playing) {
      playBtn.textContent = playing ? 'Playing' : 'Play';
      playBtn.disabled = playing;
    },
    setPlayEnabled(enabled) {
      playBtn.disabled = !enabled || playBtn.textContent === 'Playing';
    },
    syncParams(next) {
      tempo.value = String(next.tempo);
      tempoVal.textContent = `${next.tempo} bpm`;
      mode.value = next.mode;
      density.value = String(next.drumDensity);
      densityVal.textContent = next.drumDensity.toFixed(2);
      seed.value = String(next.seed);
    },
  };
}
```

**Step 2: Implement main.js**

```js
import './style.css';
import { compose, defaultParams, countLetters, MAX_TEXT_LENGTH, TRUNCATE_TO } from './music/compose.js';
import { createEngine } from './audio/engine.js';
import { createScheduler } from './audio/scheduler.js';
import { renderWav, downloadWav } from './audio/wav.js';
import { createVisualizer } from './ui/visualizer.js';
import { createControls } from './ui/controls.js';

const textInput = document.getElementById('text-input');
const controlsRoot = document.getElementById('controls');
const notice = document.getElementById('text-notice');
const canvas = document.getElementById('piano-roll');

const SAMPLE_TEXT =
  'the quick brown fox jumps over the lazy dog. does it? yes! every letter is a note.';

textInput.value = SAMPLE_TEXT;

const engine = createEngine();
const visualizer = createVisualizer(canvas);

let params = defaultParams(textInput.value);
let events = compose(textInput.value, params);
let volume = 0.8;
let lastPosition = 0;

const scheduler = createScheduler(engine, {
  onTick: (elapsed) => {
    lastPosition = elapsed;
  },
  onEnd: () => {
    controls.setPlaying(false);
    visualizer.stop();
    visualizer.draw(0);
  },
});

const controls = createControls(controlsRoot, params, {
  onPlay: async () => {
    if (events.length === 0) return;
    await engine.resume();
    visualizer.setEvents(events);
    visualizer.start(() => scheduler.position());
    scheduler.start(events);
    controls.setPlaying(true);
  },
  onStop: () => {
    scheduler.stop();
    visualizer.stop();
    visualizer.draw(0);
    controls.setPlaying(false);
  },
  onExport: async () => {
    try {
      notice.hidden = true;
      const bytes = await renderWav(events, volume);
      downloadWav(bytes);
    } catch (err) {
      notice.textContent = `Export failed: ${err.message}`;
      notice.hidden = false;
    }
  },
  onParam: (key, value) => {
    params = { ...params, [key]: value };
    recompose();
  },
  onSeed: (value) => {
    params = { ...params, seed: value };
    recompose();
  },
  onVolume: (value) => {
    volume = value;
    engine.setVolume(value);
  },
});

function recompose() {
  const wasPlaying = scheduler.isPlaying();
  scheduler.stop();
  visualizer.stop();

  const text = textInput.value;
  const trimmed = text.length > MAX_TEXT_LENGTH;
  const letters = countLetters(trimmed ? text.slice(0, TRUNCATE_TO) : text);

  if (trimmed) {
    notice.textContent = `Text is long: using the first ${TRUNCATE_TO} of ${text.length} characters (${letters} notes).`;
    notice.hidden = false;
  } else {
    notice.hidden = true;
  }

  events = compose(text, params);
  visualizer.setEvents(events);
  visualizer.draw(0);

  controls.setPlayEnabled(letters > 0);

  if (wasPlaying && letters > 0) {
    visualizer.start(() => scheduler.position());
    scheduler.start(events);
  } else {
    controls.setPlaying(false);
  }
}

textInput.addEventListener('input', () => {
  params = { ...defaultParams(textInput.value) };
  controls.syncParams(params);
  recompose();
});

window.addEventListener('resize', () => visualizer.draw(lastPosition));

visualizer.setEvents(events);
visualizer.draw(0);
```

The textarea listener re-derives `params` from the new text, so editing resets tempo, mode, and seed to match the text. Changing a slider or the seed preserves the rest of the parameters.

**Step 3: Verify the dev server starts**

Run: `npm run dev`

Expected: Vite prints a local URL with no import errors. Open it in a browser; expect the piano-roll to be populated and the Play button enabled.

**Step 4: Run the full test suite**

Run: `npm test`

Expected: PASS, all suites.

**Step 5: Commit**

```bash
git add src/ui/controls.js src/main.js
git commit -m "feat: wire controls and composition root"
```

---

## Task 10: Verify the production build

**Files:**
- Modify: none expected

**Step 1: Build**

Run: `npm run build`

Expected: Vite build succeeds, emitting `dist/` with a small bundle and no missing-module warnings.

**Step 2: Preview the build**

Run: `npm run preview`

Expected: a local URL serving the production bundle. Load it and confirm the piano-roll renders, Play starts audio, Stop halts it, and Export WAV downloads a file that plays back.

**Step 3: Check the export matches the piece**

Run: `node -e "const fs=require('fs');const b=fs.readFileSync('piece.wav');console.log('riff',b.toString('ascii',0,4),'channels',b.readUInt16LE(22),'rate',b.readUInt32LE(24),'bytes',b.length)"`

Expected: `riff RIFF channels 2 rate 44100 bytes <a number larger than 44>`. Play the file and confirm it matches the in-app playback.

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: verify production build" --allow-empty
```

---

## Verification Summary

After all tasks, the following must hold:

- `npm test` passes: hashing determinism, PRNG determinism and range, frequency conversion, scale membership for all nine modes, the two-octave cap, one-note-per-letter, punctuation producing accents and no notes, uppercase velocity, time sorting, tempo scaling, scheduler look-ahead and stop-release, RIFF header correctness, and sample clamping.
- `npm run build` succeeds.
- Playing a text produces audio whose notes track the letters and whose drum hits track the punctuation.
- The piano-roll, the audio, and the exported WAV agree, because all three read the same `Event[]`.
- The same text with the same seed reproduces the same piece.
