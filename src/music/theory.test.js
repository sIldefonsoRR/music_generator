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
    // z is alphabet index 25; 25 % 12 === 1, so it shares a pitch with b and n
    expect(resolvePitch('z')).toBe(1);
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