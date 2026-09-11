import type { Effect } from "./Effect";
import type { MultibandBandParams, MultibandCompressorParams } from "@/types/effects";

/**
 * 3-band parallel crossover: each band is split off with standard 2nd-order
 * (12dB/oct) highpass/lowpass BiquadFilterNodes, not a phase-corrected
 * Linkwitz-Riley crossover — simpler, but leaves some band overlap/
 * coloration right at the crossover frequencies. A known simplification,
 * named in types/effects.ts's doc comment rather than presented as
 * mastering-grade band splitting. Each band gets its own
 * DynamicsCompressorNode + makeup gain; all three sum back together
 * (multiple connections into one GainNode is exactly that sum).
 */
export class MultibandCompressorEffect implements Effect<MultibandCompressorParams> {
  private ctx: BaseAudioContext;
  private input: GainNode;
  private output: GainNode;

  private lowLowpass: BiquadFilterNode;
  private midHighpass: BiquadFilterNode;
  private midLowpass: BiquadFilterNode;
  private highHighpass: BiquadFilterNode;

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

    this.lowLowpass = ctx.createBiquadFilter();
    this.lowLowpass.type = "lowpass";
    this.midHighpass = ctx.createBiquadFilter();
    this.midHighpass.type = "highpass";
    this.midLowpass = ctx.createBiquadFilter();
    this.midLowpass.type = "lowpass";
    this.highHighpass = ctx.createBiquadFilter();
    this.highHighpass.type = "highpass";

    this.lowComp = ctx.createDynamicsCompressor();
    this.midComp = ctx.createDynamicsCompressor();
    this.highComp = ctx.createDynamicsCompressor();
    this.lowMakeup = ctx.createGain();
    this.midMakeup = ctx.createGain();
    this.highMakeup = ctx.createGain();

    this.input.connect(this.lowLowpass);
    this.lowLowpass.connect(this.lowComp);
    this.lowComp.connect(this.lowMakeup);
    this.lowMakeup.connect(this.output);

    this.input.connect(this.midHighpass);
    this.midHighpass.connect(this.midLowpass);
    this.midLowpass.connect(this.midComp);
    this.midComp.connect(this.midMakeup);
    this.midMakeup.connect(this.output);

    this.input.connect(this.highHighpass);
    this.highHighpass.connect(this.highComp);
    this.highComp.connect(this.highMakeup);
    this.highMakeup.connect(this.output);
  }

  get inputNode(): AudioNode {
    return this.input;
  }
  get outputNode(): AudioNode {
    return this.output;
  }

  setParams(params: MultibandCompressorParams): void {
    const t = this.ctx.currentTime;

    this.lowLowpass.frequency.setTargetAtTime(params.lowMidFreq, t, 0.01);
    this.midHighpass.frequency.setTargetAtTime(params.lowMidFreq, t, 0.01);
    this.midLowpass.frequency.setTargetAtTime(params.midHighFreq, t, 0.01);
    this.highHighpass.frequency.setTargetAtTime(params.midHighFreq, t, 0.01);

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
    makeup.gain.setTargetAtTime(Math.pow(10, band.makeupDb / 20), t, 0.01);
  }

  dispose(): void {
    this.input.disconnect();
    this.lowLowpass.disconnect();
    this.midHighpass.disconnect();
    this.midLowpass.disconnect();
    this.highHighpass.disconnect();
    this.lowComp.disconnect();
    this.midComp.disconnect();
    this.highComp.disconnect();
    this.lowMakeup.disconnect();
    this.midMakeup.disconnect();
    this.highMakeup.disconnect();
  }
}
