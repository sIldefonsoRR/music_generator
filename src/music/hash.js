// Deterministic seeding for the whole app.
//
// Both functions here are pure: the same text must always produce the same
// piece of music, otherwise a shared link could not reproduce a performance.
// Nothing in this module may use Math.random().

/**
 * FNV-1a hash of a string, returned as an unsigned 32-bit integer.
 *
 * The unsigned coercion matters: it guarantees the result is a valid seed in
 * [0, 2^32) on every input, so it can be fed straight to mulberry32 and typed
 * into the seed field as a plain number.
 */
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * mulberry32 PRNG. Returns a closure yielding floats in [0, 1).
 *
 * Chosen because it is tiny, has no dependencies, and passes gjrand's basic
 * statistical tests — enough for musical variation, where we want plausible
 * randomness rather than cryptographic strength.
 *
 * Callers must draw values in a fixed order. Adding or removing a draw shifts
 * every later value and silently changes the piece for a given seed.
 */
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