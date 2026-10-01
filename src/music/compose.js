// Text -> Event[]. The single source of truth for the piece.
//
// Playback, the piano-roll, and WAV export all read the array this module
// returns, which is why they cannot drift apart. This module stays pure: no
// audio, no DOM, no clocks. Given the same text and params it always returns
// the same events.

import { hashString, mulberry32 } from './hash.js';
import { MODE_NAMES, letterToMidi, midiToFreq, resolvePitch } from './theory.js';

/**
 * Punctuation to accent strength. Anything not listed here produces neither a
 * note nor a drum, so unknown symbols are simply skipped.
 */
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

// Past this length we warn the user; past TRUNCATE_TO we actually cut. The gap
// exists so truncation only triggers on genuinely oversized input.
export const MAX_TEXT_LENGTH = 4000;
export const TRUNCATE_TO = 2000;

// Sixteenth-note grid: the pulse is subdivided finer than the beat so letters
// can be placed on a musical grid rather than a flat rhythm.
const STEPS_PER_BEAT = 4;

const ACCENT_DRUM = {
  medium: ['hat'],
  strong: ['kick', 'snare'],
  fill: ['hat', 'hat', 'hat'],
};

/**
 * Derives musical parameters from arbitrary text so typing new words yields a
 * new world without any explicit seeding.
 *
 * Draw order is fixed (mode, root, tempo, density). Reordering these would
 * change every existing seed's output and break reproducibility for pieces
 * people have already shared.
 */
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

/**
 * Expands one punctuation mark into its drum accent(s). A fill is several hits
 * spread over adjacent grid steps rather than one, so punctuation reads as a
 * short roll.
 */
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

/**
 * Builds the underlying backbeat groove that runs under the melody for the
 * whole piece. Independent of the text, so drums stay musical even when the
 * prose has no punctuation at all.
 */
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

    // Kick on the downbeat and the "and of 3".
    if (inBar === 0 || inBar === 10) {
      push('kick', s, 0.9);
    }

    // Snare on beats 2 and 4.
    if (inBar === 4 || inBar === 12) {
      push('snare', s, 0.8);
    }

    // Hats on even steps, gated by density.
    if (inBar % 2 === 0 && next() < 0.35 + density * 0.5) {
      push('hat', s, 0.45);
    }

    // End-of-bar fill, only when the seed asks for one.
    if (inBar === 14 && next() < density) {
      push('hat', s + 0.5, 0.5);
      push('tom', s + 0.75, 0.6);
    }
  }

  return events;
}

/**
 * Turns text into a time-sorted event list.
 *
 * Each letter yields exactly one note; spaces and newlines yield none and only
 * advance the cursor. Pitch comes only from the letter — the PRNG varies
 * duration, velocity, and voice, but never pitch, which is what keeps the
 * melody legible as a trace of the original text.
 */
export function compose(text, params) {
  if (typeof text !== 'string' || text.trim() === '') {
    return [];
  }

  const { mode, rootMidi, tempo, drumDensity, seed } = params;
  const next = mulberry32(seed);
  const step = 60 / tempo / STEPS_PER_BEAT;
  const events = [];

  const source = text.length > MAX_TEXT_LENGTH ? text.slice(0, TRUNCATE_TO) : text;
  // Position on the grid, in steps. Letters advance a full step, separators
  // advance fractions, so spacing and rhythm both fall out of this counter.
  let cursor = 0;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const time = cursor * step;
    const strength = ACCENT_STRENGTH[char];

    // Space: a light rest that keeps the pulse moving.
    if (char === ' ' || char === '\t') {
      cursor += 0.5;
      continue;
    }

    // Newline: a longer breath.
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
      // Any other non-letter (digits, symbols) advances time silently.
      cursor += 0.5;
      continue;
    }

    const midi = letterToMidi(letterIndex, rootMidi, mode);
    const duration = 0.5 + next();
    // Capitalisation is read as stress, so uppercase gets a louder note.
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

    cursor += 1;
  }

  const totalSteps = Math.ceil(cursor) + 1;
  events.push(...grooveEvents({ drumDensity }, totalSteps, step, next));

  // Melody and groove are generated separately, so a final sort is what keeps
  // the two interleaved in order for the scheduler's single forward pass.
  events.sort((a, b) => a.time - b.time);
  return events;
}

/**
 * Counts how many notes a piece of text will produce. The UI uses this to
 * enable or disable Play, so empty input cannot start a silent performance.
 */
export function countLetters(text) {
  let n = 0;
  for (const char of text) {
    if (resolvePitch(char) !== null) n++;
  }
  return n;
}