/**
 * Common interface every effect wraps around its own Web Audio nodes.
 * EffectChain (see EffectChain.ts) only ever talks to this surface — it
 * never reaches into a specific effect's internals.
 *
 * Bypass is handled entirely by EffectChain (it just skips a bypassed
 * effect's nodes when wiring the chain together), so implementations don't
 * need to know about it — one less thing for each effect to get wrong.
 */
export interface Effect<Params> {
  readonly inputNode: AudioNode;
  readonly outputNode: AudioNode;
  setParams(params: Params): void;
  dispose(): void;
}
