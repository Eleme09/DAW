import type { Effect } from "./Effect";
import type { CompressorParams } from "@/types/effects";
import { nativeCompressorMakeupDb } from "./nativeCompressor";

/** Thin wrapper around the native DynamicsCompressorNode + a makeup-gain
 * stage. The node's own automatic makeup (nativeCompressor.ts) is divided
 * back out, so `makeupDb` is the real makeup: lowering the threshold
 * compresses more and gets quieter, as on any hardware compressor, instead
 * of getting louder by itself. */
export class CompressorEffect implements Effect<CompressorParams> {
  private ctx: BaseAudioContext;
  private compressor: DynamicsCompressorNode;
  private makeup: GainNode;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.compressor = ctx.createDynamicsCompressor();
    this.makeup = ctx.createGain();
    this.compressor.connect(this.makeup);
  }

  get inputNode(): AudioNode {
    return this.compressor;
  }
  get outputNode(): AudioNode {
    return this.makeup;
  }

  /** Real gain reduction in dB right now, straight from the native node's
   * own `.reduction` (Web Audio computes this internally from its actual
   * attack/release/knee state) - not a value derived from our own transfer
   * function, which would only be the idealized/instantaneous shape. */
  getReductionDb(): number {
    return this.compressor.reduction;
  }

  setParams(params: CompressorParams): void {
    const t = this.ctx.currentTime;
    this.compressor.threshold.setTargetAtTime(params.thresholdDb, t, 0.01);
    this.compressor.ratio.setTargetAtTime(params.ratio, t, 0.01);
    this.compressor.attack.setTargetAtTime(params.attackMs / 1000, t, 0.005);
    this.compressor.release.setTargetAtTime(params.releaseMs / 1000, t, 0.01);
    this.compressor.knee.setTargetAtTime(params.kneeDb, t, 0.01);
    const auto = nativeCompressorMakeupDb(params.thresholdDb, params.ratio, params.kneeDb);
    this.makeup.gain.setTargetAtTime(Math.pow(10, (params.makeupDb - auto) / 20), t, 0.01);
  }

  dispose(): void {
    this.compressor.disconnect();
    this.makeup.disconnect();
  }
}
