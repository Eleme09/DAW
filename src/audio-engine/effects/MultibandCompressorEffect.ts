import type { Effect } from "./Effect";
import type { MultibandBandParams, MultibandCompressorParams } from "@/types/effects";
import { BUTTERWORTH_Q_DB } from "./latency";
import { nativeCompressorMakeupDb } from "./nativeCompressor";

/**
 * 3-band Linkwitz-Riley (4th-order) crossover: input splits at lowMidFreq
 * into low and rest, the rest splits at midHighFreq into mid and high. The
 * low band also goes through the second crossover's allpass (its own LP+HP
 * sum at midHighFreq) so its phase matches mid+high and the three bands sum
 * flat when nothing is compressing. Butterworth sections use Web Audio's
 * dB-valued Q (BUTTERWORTH_Q_DB). Each band gets its own
 * DynamicsCompressorNode + makeup gain; the three compressors share the same
 * look-ahead, so the bands stay aligned.
 */
export class MultibandCompressorEffect implements Effect<MultibandCompressorParams> {
  private ctx: BaseAudioContext;
  private input: GainNode;
  private output: GainNode;
  /** Filters tuned to lowMidFreq / midHighFreq. */
  private lowSplit: BiquadFilterNode[] = [];
  private highSplit: BiquadFilterNode[] = [];
  private nodes: AudioNode[] = [];

  private lowComp: DynamicsCompressorNode;
  private midComp: DynamicsCompressorNode;
  private highComp: DynamicsCompressorNode;
  private lowMakeup: GainNode;
  private midMakeup: GainNode;
  private highMakeup: GainNode;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    /** Two Butterworth sections in series (LR4); returns [first, last]. */
    const lr = (type: BiquadFilterType, group: BiquadFilterNode[]): [BiquadFilterNode, BiquadFilterNode] => {
      const a = ctx.createBiquadFilter();
      const b = ctx.createBiquadFilter();
      for (const f of [a, b]) {
        f.type = type;
        f.Q.value = BUTTERWORTH_Q_DB;
        group.push(f);
        this.nodes.push(f);
      }
      a.connect(b);
      return [a, b];
    };

    this.lowComp = ctx.createDynamicsCompressor();
    this.midComp = ctx.createDynamicsCompressor();
    this.highComp = ctx.createDynamicsCompressor();
    this.lowMakeup = ctx.createGain();
    this.midMakeup = ctx.createGain();
    this.highMakeup = ctx.createGain();

    // low: LP @ lowMid, then the allpass @ midHigh (LP + HP summed)
    const [lowIn, lowOut] = lr("lowpass", this.lowSplit);
    const [apLpIn, apLpOut] = lr("lowpass", this.highSplit);
    const [apHpIn, apHpOut] = lr("highpass", this.highSplit);
    const lowSum = ctx.createGain();
    this.nodes.push(lowSum);
    this.input.connect(lowIn);
    lowOut.connect(apLpIn);
    lowOut.connect(apHpIn);
    apLpOut.connect(lowSum);
    apHpOut.connect(lowSum);
    lowSum.connect(this.lowComp);

    // rest: HP @ lowMid, then split @ midHigh
    const [restIn, restOut] = lr("highpass", this.lowSplit);
    const [midIn, midOut] = lr("lowpass", this.highSplit);
    const [highIn, highOut] = lr("highpass", this.highSplit);
    this.input.connect(restIn);
    restOut.connect(midIn);
    restOut.connect(highIn);
    midOut.connect(this.midComp);
    highOut.connect(this.highComp);

    this.lowComp.connect(this.lowMakeup);
    this.midComp.connect(this.midMakeup);
    this.highComp.connect(this.highMakeup);
    this.lowMakeup.connect(this.output);
    this.midMakeup.connect(this.output);
    this.highMakeup.connect(this.output);
  }

  get inputNode(): AudioNode {
    return this.input;
  }
  get outputNode(): AudioNode {
    return this.output;
  }

  /** Real gain reduction in dB per band, from each band's own native
   * DynamicsCompressorNode.reduction - same telemetry pattern as
   * CompressorEffect/LimiterEffect/DeEsserEffect. */
  getReductionDb(): { low: number; mid: number; high: number } {
    return { low: this.lowComp.reduction, mid: this.midComp.reduction, high: this.highComp.reduction };
  }

  setParams(params: MultibandCompressorParams): void {
    const t = this.ctx.currentTime;

    for (const f of this.lowSplit) f.frequency.setTargetAtTime(params.lowMidFreq, t, 0.01);
    for (const f of this.highSplit) f.frequency.setTargetAtTime(params.midHighFreq, t, 0.01);

    this.applyBand(this.lowComp, this.lowMakeup, params.low, params);
    this.applyBand(this.midComp, this.midMakeup, params.mid, params);
    this.applyBand(this.highComp, this.highMakeup, params.high, params);
  }

  private applyBand(
    comp: DynamicsCompressorNode,
    makeup: GainNode,
    band: MultibandBandParams,
    shared: MultibandCompressorParams
  ): void {
    const t = this.ctx.currentTime;
    comp.threshold.setTargetAtTime(band.thresholdDb, t, 0.01);
    comp.ratio.setTargetAtTime(band.ratio, t, 0.01);
    comp.attack.setTargetAtTime(shared.attackMs / 1000, t, 0.005);
    comp.release.setTargetAtTime(shared.releaseMs / 1000, t, 0.01);
    // minus the node's automatic makeup (nativeCompressor.ts), which differs
    // per band with each band's threshold/ratio and tilted the tone
    const auto = nativeCompressorMakeupDb(band.thresholdDb, band.ratio, comp.knee.value);
    makeup.gain.setTargetAtTime(Math.pow(10, (band.makeupDb - auto) / 20), t, 0.01);
  }

  dispose(): void {
    this.input.disconnect();
    for (const n of this.nodes) n.disconnect();
    this.lowComp.disconnect();
    this.midComp.disconnect();
    this.highComp.disconnect();
    this.lowMakeup.disconnect();
    this.midMakeup.disconnect();
    this.highMakeup.disconnect();
  }
}
