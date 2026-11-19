// Seeded randomness for Solmar City. The whole game is deterministic: every
// random choice flows through a mulberry32 generator so a screenshot seed
// reproduces the same world, traffic and pedestrians on every machine. Never
// use the unseeded built-in random in game code — always draw from an RNG.

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

export class RNG {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this.nextFn = mulberry32(this.seed);
  }

  // Float in [0, 1).
  next() {
    return this.nextFn();
  }

  // Float in [min, max).
  range(min, max) {
    return min + this.next() * (max - min);
  }

  // Integer in [min, max] inclusive.
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  // One random element of a non-empty array.
  pick(array) {
    return array[Math.floor(this.next() * array.length)];
  }

  // True with probability p (0..1).
  chance(p) {
    return this.next() < p;
  }

  // A fresh RNG derived from this one (independent stream, still seeded).
  fork(salt = 0) {
    const derived = (this.seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
    return new RNG(derived);
  }

  // Reset the stream to its original seed.
  reset() {
    this.nextFn = mulberry32(this.seed);
  }
}
