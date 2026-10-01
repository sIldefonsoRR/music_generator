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