// Deterministic random numbers. The whole game is seeded (CONFIG.seed) so a
// screenshot seed reproduces the same city, traffic and pedestrians. Never
// use the built-in unseeded random anywhere in the game; always go through RNG.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Convenience wrapper around a mulberry32 stream with the helpers the game
// needs: ranges, integers, picks and chance rolls.
export class RNG {
  constructor(seed = 1) {
    this.nextFn = mulberry32(seed);
    this.seed = seed >>> 0;
  }

  next() {
    return this.nextFn();
  }

  range(min, max) {
    return min + this.next() * (max - min);
  }

  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  pick(array) {
    return array[Math.floor(this.next() * array.length)];
  }

  chance(p) {
    return this.next() < p;
  }

  // Fisher-Yates shuffle that returns a new array, leaving the input intact.
  shuffle(array) {
    const out = array.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // Fork an independent stream so subsystems do not disturb each other's
  // sequences when they consume different amounts of randomness.
  fork(salt) {
    return new RNG((this.seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0);
  }
}
