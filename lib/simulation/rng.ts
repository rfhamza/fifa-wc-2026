/**
 * Deterministic RNG
 * -----------------
 * mulberry32 — a tiny, fast, seedable PRNG. Determinism matters: given the
 * same seed the entire tournament simulation reproduces exactly, which keeps
 * snapshots stable and tests reliable.
 */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return {
    next() {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/**
 * Sample a Poisson-distributed integer using Knuth's algorithm.
 * Fine for the small lambdas (< ~6) seen in football scorelines.
 */
export function samplePoisson(rng: Rng, lambda: number): number {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rng.next();
  } while (p > L);
  return k - 1;
}
