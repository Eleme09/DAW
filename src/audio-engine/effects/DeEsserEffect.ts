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
  /** Sits inline right after `input` (input -> analyser -> low/high split),
   * same reasoning as NoiseGateEffect.inputAnalyser: a track/master
   * analyser is post-chain, so it would already reflect the de-esser's own
   * gain reduction, hiding exactly the sibilance the detection band needs
   * to show. Being in series (an AnalyserNode passes audio through
   * unchanged) also means it's genuinely pulled by the graph, unlike a
   * side-tap with no path to destination. */
  private inputAnalyser: AnalyserNode;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.inputAnalyser = ctx.createAnalyser();
    this.inputAnalyser.fftSize = 2048;

    this.lowBand = ctx.createBiquadFilter();
    this.lowBand.type = "lowpass";

    this.highBand = ctx.createBiquadFilter();
    this.highBand.type = "highpass";

    this.sibilanceCompressor = ctx.createDynamicsCompressor();
    this.sibilanceCompressor.knee.value = 0;
    this.sibilanceCompressor.attack.value = 0.001;
    this.sibilanceCompressor.release.value = 0.06;

    this.input.connect(this.inputAnalyser);
    this.inputAnalyser.connect(this.lowBand);
    this.inputAnalyser.connect(this.highBand);
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

  getInputAnalyser(): AnalyserNode {
    return this.inputAnalyser;
  }

  /** Real gain reduction in dB from the sibilance band's own
   * DynamicsCompressorNode - same native `.reduction` telemetry as
   * CompressorEffect/LimiterEffect. */
  getReductionDb(): number {
    return this.sibilanceCompressor.reduction;
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
