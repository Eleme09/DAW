import type { Effect } from "./Effect";
import type { DeEsserParams } from "@/types/effects";

/**
 * Split-band de-esser: the signal above `freq` goes through a fast
 * compressor (ducking sibilance specifically), the signal below passes
 * untouched, and the two bands are summed back together. Standard technique,
 * built entirely from stock nodes — no custom DSP needed.
 */
export class DeEsserEffect implements Effect<DeEsserParams> {
  private ctx: BaseAudioContext;
  private input: GainNode;
  private output: GainNode;
  private lowBand: BiquadFilterNode;
  private highBand: BiquadFilterNode;
  private sibilanceCompressor: DynamicsCompressorNode;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.lowBand = ctx.createBiquadFilter();
    this.lowBand.type = "lowpass";

    this.highBand = ctx.createBiquadFilter();
    this.highBand.type = "highpass";

    this.sibilanceCompressor = ctx.createDynamicsCompressor();
    this.sibilanceCompressor.knee.value = 0;
    this.sibilanceCompressor.attack.value = 0.001;
    this.sibilanceCompressor.release.value = 0.06;

    this.input.connect(this.lowBand);
    this.input.connect(this.highBand);
    this.lowBand.connect(this.output);
    this.highBand.connect(this.sibilanceCompressor);
    this.sibilanceCompressor.connect(this.output);
  }

  get inputNode(): AudioNode {
    return this.input;
  }
  get outputNode(): AudioNode {
    return this.output;
  }

  setParams(params: DeEsserParams): void {
    const t = this.ctx.currentTime;
    this.lowBand.frequency.setTargetAtTime(params.freq, t, 0.01);
    this.highBand.frequency.setTargetAtTime(params.freq, t, 0.01);
    this.sibilanceCompressor.threshold.setTargetAtTime(params.thresholdDb, t, 0.01);
    this.sibilanceCompressor.ratio.setTargetAtTime(params.ratio, t, 0.01);
  }

  dispose(): void {
    this.input.disconnect();
    this.lowBand.disconnect();
    this.highBand.disconnect();
    this.sibilanceCompressor.disconnect();
  }
}
