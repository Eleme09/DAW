/**
 * Common interface every effect wraps around its own Web Audio nodes.
 * EffectChain (see EffectChain.ts) only ever talks to this surface — it
 * never reaches into a specific effect's internals.
 *
 * Bypass is handled entirely by EffectChain, via a `BypassWrapper` around
 * each instance (loudness-matched dry/wet crossfade — see its own doc
 * comment, "bypass honesto" per PROGRESS.md's plugin-anatomy work), so
 * implementations don't need to know about it — one less thing for each
 * effect to get wrong. An implication worth knowing: the effect keeps
 * processing audio even while its own bypass is on (the wrapper still
 * needs its real output to measure and compensate against), not fully
 * silenced the way "skip this node" used to mean.
 */
export interface Effect<Params> {
  readonly inputNode: AudioNode;
  readonly outputNode: AudioNode;
  setParams(params: Params): void;
  dispose(): void;
}
