// Seeded randomness for Solmar City: every roll in the game flows through mulberry32,
// so the same seed always builds the same city, the same traffic and the same missions.
// Never use the unseeded built-in RNG anywhere in game/ — determinism is what makes
// the screenshots and the playtests repeatable.

/** mulberry32: a tiny, fast, deterministic PRNG. Returns a function yielding [0, 1). */
export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derive a stable 32-bit integer seed from a short string (district names, save slots). */
export function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

/** Uniform float in [min, max). */
export function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

/** Uniform integer in [min, max] (both ends inclusive). */
export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** True with probability p (0..1). */
export function randChance(rng, p) {
  return rng() < p;
}

/** One element of a non-empty array, uniformly. */
export function randPick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/** Fisher-Yates shuffle that returns a new array, leaving the input untouched. */
export function randShuffle(rng, arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** A child RNG forked from a parent stream, so subsystems stay independent of call order. */
export function forkRandom(rng) {
  return createRandom((rng() * 4294967296) | 0);
}

/**
 * Approximately Gaussian value (mean, std) via the sum of three uniforms —
 * good enough for natural-feeling jitter (traffic speed, pedestrian pace).
 */
export function randGauss(rng, mean = 0, std = 1) {
  return mean + ((rng() + rng() + rng()) / 3 - 0.5) * 2 * 1.732 * std;
}
