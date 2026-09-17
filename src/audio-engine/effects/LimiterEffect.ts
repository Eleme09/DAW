import type { Effect } from "./Effect";
import type { LimiterParams } from "@/types/effects";
import { makeHardClipCurve } from "./curves";

/**
 * Brickwall-ish limiter: a fast DynamicsCompressorNode does the gain
 * reduction, a hard-clip WaveShaper after it guarantees true peak never
 * exceeds `ceilingDb` even if the compressor's release lags a transient.
 */
export class LimiterEffect implements Effect<LimiterParams> {
  private ctx: BaseAudioContext;
  private compressor: DynamicsCompressorNode;
  private clipper: WaveShaperNode;
  private makeupGain: GainNode;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.knee.value = 0;
    this.compressor.ratio.value = 20;
    this.compressor.attack.value = 0.001;

    this.clipper = ctx.createWaveShaper();
    this.clipper.curve = makeHardClipCurve();
    this.clipper.oversample = "4x";
    this.makeupGain = ctx.createGain();

    this.compressor.connect(this.clipper);
    this.clipper.connect(this.makeupGain);
  }

  get inputNode(): AudioNode {
    return this.compressor;
  }
  get outputNode(): AudioNode {
    return this.makeupGain;
  }

  /** Real gain reduction in dB right now, from the native node's own
   * `.reduction` - see CompressorEffect.getReductionDb()'s doc comment. */
  getReductionDb(): number {
    return this.compressor.reduction;
  }

  setParams(params: LimiterParams): void {
    const t = this.ctx.currentTime;
    this.compressor.threshold.setTargetAtTime(params.thresholdDb, t, 0.005);
    this.compressor.release.setTargetAtTime(params.releaseMs / 1000, t, 0.01);
    // Clipper hard-limits to 0 dBFS; scale down afterward so true peak lands at the ceiling.
    const ceilingGainLinear = Math.pow(10, params.ceilingDb / 20);
    this.makeupGain.gain.setTargetAtTime(ceilingGainLinear, t, 0.01);
  }

  dispose(): void {
    this.compressor.disconnect();
    this.clipper.disconnect();
    this.makeupGain.disconnect();
  }
}
