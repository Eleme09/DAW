import type { Effect } from "./Effect";
import type { DelayParams } from "@/types/effects";

const MAX_DELAY_SEC = 4;

/** Feedback delay with a lowpass filter in the feedback loop (tape-style damping). */
export class DelayEffect implements Effect<DelayParams> {
  private ctx: BaseAudioContext;
  private input: GainNode;
  private output: GainNode;
  private delay: DelayNode;
  private feedback: GainNode;
  private dampingFilter: BiquadFilterNode;
  private dryGain: GainNode;
  private wetGain: GainNode;
  /** In series right after wetGain, before it rejoins the dry signal -
   * same reasoning as ReverbEffect.wetAnalyser: real level of just this
   * instance's echoes, not the dry+wet mix a track/master analyser sees. */
  private wetAnalyser: AnalyserNode;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.delay = ctx.createDelay(MAX_DELAY_SEC);
    this.feedback = ctx.createGain();
    this.dampingFilter = ctx.createBiquadFilter();
    this.dampingFilter.type = "lowpass";
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();
    this.wetAnalyser = ctx.createAnalyser();
    this.wetAnalyser.fftSize = 1024;

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    this.input.connect(this.delay);
    this.delay.connect(this.dampingFilter);
    this.dampingFilter.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.dampingFilter.connect(this.wetGain);
    this.wetGain.connect(this.wetAnalyser);
    this.wetAnalyser.connect(this.output);
  }

  get inputNode(): AudioNode {
    return this.input;
  }
  get outputNode(): AudioNode {
    return this.output;
  }

  getWetAnalyser(): AnalyserNode {
    return this.wetAnalyser;
  }

  setParams(params: DelayParams): void {
    const t = this.ctx.currentTime;
    this.delay.delayTime.setTargetAtTime(Math.min(MAX_DELAY_SEC, params.timeMs / 1000), t, 0.01);
    this.feedback.gain.setTargetAtTime(Math.min(0.95, params.feedback), t, 0.01);
    this.dampingFilter.frequency.setTargetAtTime(params.filterFreq, t, 0.01);
    this.dryGain.gain.setTargetAtTime(1 - params.mix, t, 0.01);
    this.wetGain.gain.setTargetAtTime(params.mix, t, 0.01);
  }

  dispose(): void {
    this.input.disconnect();
    this.delay.disconnect();
    this.feedback.disconnect();
    this.dampingFilter.disconnect();
    this.dryGain.disconnect();
    this.wetGain.disconnect();
    this.wetAnalyser.disconnect();
  }
}
