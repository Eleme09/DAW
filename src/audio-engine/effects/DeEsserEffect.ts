import type { Effect } from "./Effect";
import type { DeEsserParams } from "@/types/effects";
import { BUTTERWORTH_Q_DB, compressorLatencySec } from "./latency";
import { nativeCompressorMakeupDb } from "./nativeCompressor";

/**
 * Split-band de-esser: the signal above `freq` goes through a fast
 * compressor (ducking sibilance specifically), the signal below passes
 * untouched, and the two bands are summed back together. Standard technique,
 * built entirely from stock nodes — no custom DSP needed.
 *
 * The split is a 4th-order Linkwitz-Riley crossover (two Butterworth
 * sections per side). Web Audio's lowpass/highpass Q is in dB, so
 * Butterworth is BUTTERWORTH_Q_DB (-3.01), not 0.707. Measured in Chromium
 * (steady tones, 44.1 kHz, not compressing): this sums flat (0.00 dB from
 * 100 Hz to 14 kHz); the earlier single LP + HP sank -4.2 dB at 6.5 kHz on
 * every voice, compressing or not. The low band is delayed by the
 * compressor's look-ahead (whole samples, see compressorLatencySec) so the
 * two bands line up again.
 */
export class DeEsserEffect implements Effect<DeEsserParams> {
  private ctx: BaseAudioContext;
  private input: GainNode;
  private output: GainNode;
  private lowBand: BiquadFilterNode;
  private lowBand2: BiquadFilterNode;
  private lowDelay: DelayNode;
  private highBand: BiquadFilterNode;
  private highBand2: BiquadFilterNode;
  private sibilanceCompressor: DynamicsCompressorNode;
  /** Divides out the node's automatic makeup gain: the band is unity
   * until it compresses (it was +5-13 dB - a de-esser that BOOSTED the
   * sibilance band whenever it was not reducing it). */
  private highTrim: GainNode;
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

    const butter = (type: BiquadFilterType) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.Q.value = BUTTERWORTH_Q_DB;
      return f;
    };
    this.lowBand = butter("lowpass");
    this.lowBand2 = butter("lowpass");
    this.highBand = butter("highpass");
    this.highBand2 = butter("highpass");
    this.lowDelay = ctx.createDelay(0.05);
    this.lowDelay.delayTime.value = compressorLatencySec(ctx.sampleRate);

    this.sibilanceCompressor = ctx.createDynamicsCompressor();
    this.sibilanceCompressor.knee.value = 0;
    this.sibilanceCompressor.attack.value = 0.001;
    this.sibilanceCompressor.release.value = 0.06;
    this.highTrim = ctx.createGain();

    this.input.connect(this.inputAnalyser);
    this.inputAnalyser.connect(this.lowBand);
    this.inputAnalyser.connect(this.highBand);
    this.lowBand.connect(this.lowBand2);
    this.lowBand2.connect(this.lowDelay);
    this.lowDelay.connect(this.output);
    this.highBand.connect(this.highBand2);
    this.highBand2.connect(this.sibilanceCompressor);
    this.sibilanceCompressor.connect(this.highTrim);
    this.highTrim.connect(this.output);
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
    for (const f of [this.lowBand, this.lowBand2, this.highBand, this.highBand2]) f.frequency.setTargetAtTime(params.freq, t, 0.01);
    this.sibilanceCompressor.threshold.setTargetAtTime(params.thresholdDb, t, 0.01);
    this.sibilanceCompressor.ratio.setTargetAtTime(params.ratio, t, 0.01);
    this.highTrim.gain.setTargetAtTime(Math.pow(10, -nativeCompressorMakeupDb(params.thresholdDb, params.ratio, 0) / 20), t, 0.01);
  }

  dispose(): void {
    this.input.disconnect();
    this.lowBand.disconnect();
    this.lowBand2.disconnect();
    this.lowDelay.disconnect();
    this.highBand.disconnect();
    this.highBand2.disconnect();
    this.sibilanceCompressor.disconnect();
    this.highTrim.disconnect();
  }
}
