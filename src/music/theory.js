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