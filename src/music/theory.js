// Musical primitives: which pitches exist, and how a letter becomes one.
//
// This module is deliberately free of audio and DOM concerns so it can be
// unit-tested in plain Node and reused by both live playback and WAV export.

/**
 * Scales as semitone offsets from the root. All are major or minor-family
 * modes; the pentatonic and blues sets are included because they tolerate
 * arbitrary letter order without sounding wrong, which matters when the
 * "melody" is dictated by prose rather than by a composer.
 */
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

/**
 * The twelve pitch slots a-z map onto. Twelve slots against a scale of 5-7
 * notes is what produces two octaves of melodic travel per word.
 */
export const LETTERS = 'abcdefghijkl';

/** Equal-tempered A4 = 440Hz conversion (MIDI note number to Hz). */
export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Caps the octave rise so consecutive letters trace an up-and-over contour
 * instead of climbing forever. Past two octaves the ascent restarts at the
 * root. Note count is unaffected; only octave placement changes.
 */
function foldOctave(raw) {
  return raw >= 2 ? 0 : raw;
}

/**
 * Maps a letter index (0-11) to a MIDI note inside the given scale.
 *
 * degree wraps within the scale while octave rises, so for a 7-note scale the
 * indices read root, 2nd, ... 7th, root+12, 2nd+12, ...
 */
export function letterToMidi(letterIndex, rootMidi, mode) {
  const scale = MODES[mode];
  const L = scale.length;
  const degree = letterIndex % L;
  const octave = foldOctave(Math.floor(letterIndex / L));
  return rootMidi + scale[degree] + 12 * octave;
}

/**
 * True when a MIDI note belongs to the scale. Used by tests to prove the
 * composer never emits an out-of-key pitch.
 */
export function isInScale(midi, rootMidi, mode) {
  // The double modulo keeps the degree non-negative for notes below the root.
  const degree = ((midi - rootMidi) % 12 + 12) % 12;
  return MODES[mode].includes(degree);
}

/**
 * Resolves a character to a pitch slot, or null if it is not a letter.
 *
 * Every Latin letter resolves: a-l are indices 0-11, and m-z wrap back into
 * the same twelve slots. Without that modulo, m-z would silently produce no
 * note and any word containing them would lose part of its melody. Case is
 * ignored here because capitalisation is carried as velocity instead.
 */
export function resolvePitch(char) {
  const idx = ALPHABET.indexOf(char.toLowerCase());
  return idx === -1 ? null : idx % LETTERS.length;
}