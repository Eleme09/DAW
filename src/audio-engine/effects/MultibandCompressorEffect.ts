import type { Effect } from "./Effect";
import type { MultibandBandParams, MultibandCompressorParams } from "@/types/effects";
import { BUTTERWORTH_Q_DB } from "./latency";
import { DynamicsNode } from "./dynamics";

/**
 * 3-band Linkwitz-Riley (4th-order) crossover: input splits at lowMidFreq
 * into low and rest, the rest splits at midHighFreq into mid and high. The
 * low band also goes through the second crossover's allpass (its own LP+HP
 * sum at midHighFreq) so its phase matches mid+high and the three bands sum
 * flat when nothing is compressing. Butterworth sections use Web Audio's
 * dB-valued Q (BUTTERWORTH_Q_DB). Each band gets its own
 * dynamics-processor compressor (makeup included, no hidden gain, no
 * look-ahead), so the bands stay aligned.
 */
export class MultibandCompressorEffect implements Effect<MultibandCompressorParams> {
  private ctx: BaseAudioContext;
  private input: GainNode;
  private output: GainNode;
  /** Filters tuned to lowMidFreq / midHighFreq. */
  private lowSplit: BiquadFilterNode[] = [];
  private highSplit: BiquadFilterNode[] = [];
  private nodes: AudioNode[] = [];

  private lowComp: DynamicsNode;
  private midComp: DynamicsNode;
  private highComp: DynamicsNode;

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

    this.lowComp = new DynamicsNode(ctx, "comp");
    this.midComp = new DynamicsNode(ctx, "comp");
    this.highComp = new DynamicsNode(ctx, "comp");

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
    lowSum.connect(this.lowComp.node);

    // rest: HP @ lowMid, then split @ midHigh
    const [restIn, restOut] = lr("highpass", this.lowSplit);
    const [midIn, midOut] = lr("lowpass", this.highSplit);
    const [highIn, highOut] = lr("highpass", this.highSplit);
    this.input.connect(restIn);
    restOut.connect(midIn);
    restOut.connect(highIn);
    midOut.connect(this.midComp.node);
    highOut.connect(this.highComp.node);

    this.lowComp.node.connect(this.output);
    this.midComp.node.connect(this.output);
    this.highComp.node.connect(this.output);
  }

  get inputNode(): AudioNode {
    return this.input;
  }
  get outputNode(): AudioNode {
    return this.output;
  }

  /** Gain reduction in dB per band, reported by each band's worklet - same
   * telemetry pattern as
   * CompressorEffect/LimiterEffect/DeEsserEffect. */
  getReductionDb(): { low: number; mid: number; high: number } {
    return { low: this.lowComp.getReductionDb(), mid: this.midComp.getReductionDb(), high: this.highComp.getReductionDb() };
  }

  setParams(params: MultibandCompressorParams): void {
    const t = this.ctx.currentTime;

    for (const f of this.lowSplit) f.frequency.setTargetAtTime(params.lowMidFreq, t, 0.01);
    for (const f of this.highSplit) f.frequency.setTargetAtTime(params.midHighFreq, t, 0.01);

    this.applyBand(this.lowComp, params.low, params);
    this.applyBand(this.midComp, params.mid, params);
    this.applyBand(this.highComp, params.high, params);
  }

  private applyBand(comp: DynamicsNode, band: MultibandBandParams, shared: MultibandCompressorParams): void {
    comp.set({
      thresholdDb: band.thresholdDb,
      ratio: band.ratio,
      kneeDb: 6,
      attackSec: shared.attackMs / 1000,
      releaseSec: shared.releaseMs / 1000,
      makeupDb: band.makeupDb,
    });
  }

  dispose(): void {
    this.input.disconnect();
    for (const n of this.nodes) n.disconnect();
    this.lowComp.disconnect();
    this.midComp.disconnect();
    this.highComp.disconnect();
  }
}
