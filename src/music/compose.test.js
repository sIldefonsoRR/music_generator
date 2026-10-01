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