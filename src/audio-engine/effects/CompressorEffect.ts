import type { Effect } from "./Effect";
import type { CompressorParams } from "@/types/effects";

/** Thin wrapper around the native DynamicsCompressorNode + a makeup-gain stage. */
export class CompressorEffect implements Effect<CompressorParams> {
  private ctx: AudioContext;
  private compressor: DynamicsCompressorNode;
  private makeup: GainNode;

  constructor(ctx: AudioContext) {
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

  setParams(params: CompressorParams): void {
    const t = this.ctx.currentTime;
    this.compressor.threshold.setTargetAtTime(params.thresholdDb, t, 0.01);
    this.compressor.ratio.setTargetAtTime(params.ratio, t, 0.01);
    this.compressor.attack.setTargetAtTime(params.attackMs / 1000, t, 0.005);
    this.compressor.release.setTargetAtTime(params.releaseMs / 1000, t, 0.01);
    this.compressor.knee.setTargetAtTime(params.kneeDb, t, 0.01);
    this.makeup.gain.setTargetAtTime(Math.pow(10, params.makeupDb / 20), t, 0.01);
  }

  dispose(): void {
    this.compressor.disconnect();
    this.makeup.disconnect();
  }
}
