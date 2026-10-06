import type { Effect } from "./Effect";
import type { CompressorParams } from "@/types/effects";
import { DynamicsNode } from "./dynamics";

/** Gravedad: one feed-forward compressor (dynamics-processor worklet).
 * `makeupDb` is the only gain added - no hidden automatic makeup - and
 * every knob glides, so turning one while the music plays never clicks. */
export class CompressorEffect implements Effect<CompressorParams> {
  private dyn: DynamicsNode;

  constructor(ctx: BaseAudioContext) {
    this.dyn = new DynamicsNode(ctx, "comp");
  }

  get inputNode(): AudioNode {
    return this.dyn.node;
  }
  get outputNode(): AudioNode {
    return this.dyn.node;
  }

  /** Gain reduction the worklet reports (most over the last ~50 ms), dB. */
  getReductionDb(): number {
    return this.dyn.getReductionDb();
  }

  setParams(params: CompressorParams): void {
    this.dyn.set({
      thresholdDb: params.thresholdDb,
      ratio: params.ratio,
      kneeDb: params.kneeDb,
      attackSec: params.attackMs / 1000,
      releaseSec: params.releaseMs / 1000,
      makeupDb: params.makeupDb,
    });
  }

  dispose(): void {
    this.dyn.disconnect();
  }
}
