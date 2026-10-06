import type { Effect } from "./Effect";
import type { LimiterParams } from "@/types/effects";
import { DynamicsNode, LIMITER_LOOKAHEAD_MS } from "./dynamics";

/**
 * Horizonte: look-ahead brickwall limiter (dynamics-processor worklet,
 * "limit" mode). `thresholdDb` is how hard it is pushed (drive = -threshold,
 * the "Empuje" knob); nothing passes `ceilingDb` - the worklet lowers the
 * gain before a peak arrives and clips whatever slips through.
 */
export class LimiterEffect implements Effect<LimiterParams> {
  private dyn: DynamicsNode;

  constructor(ctx: BaseAudioContext) {
    this.dyn = new DynamicsNode(ctx, "limit");
    // fast enough to be fully down within the look-ahead
    this.dyn.set({ attackSec: LIMITER_LOOKAHEAD_MS / 1000 / 4 });
  }

  get inputNode(): AudioNode {
    return this.dyn.node;
  }
  get outputNode(): AudioNode {
    return this.dyn.node;
  }

  getReductionDb(): number {
    return this.dyn.getReductionDb();
  }

  setParams(params: LimiterParams): void {
    this.dyn.set({
      driveDb: Math.max(0, -params.thresholdDb),
      ceilingDb: params.ceilingDb,
      releaseSec: params.releaseMs / 1000,
    });
  }

  dispose(): void {
    this.dyn.disconnect();
  }
}
