/**
 * Tiny deterministic PRNG (mulberry32) — same seed always produces the same
 * sequence. Used for controlled variation (hihat roll placement) in the
 * beat generator, not for anything that needs cryptographic randomness.
 * A plain `Math.random()`-based approach would make generation
 * unreproducible and untestable; this keeps "generate again with the same
 * seed" a real, checkable guarantee.
 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
