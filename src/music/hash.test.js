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