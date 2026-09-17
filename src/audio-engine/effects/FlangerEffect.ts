import type { Effect } from "./Effect";
import type { FlangerParams } from "@/types/effects";

const BASE_DELAY_SEC = 0.003; // ~3ms — flanger territory (much shorter than chorus's ~20ms)
const MAX_DELAY_SEC = 0.02;

/**
 * Modulated delay with a feedback loop (unlike Chorus, which has none) —
 * the feedback is what produces flanging's characteristic resonant comb-
 * filter sweep instead of chorus's simple doubling/thickening.
 */
export const FLANGER_BASE_DELAY_MS = BASE_DELAY_SEC * 1000;

export class FlangerEffect implements Effect<FlangerParams> {
  private ctx: BaseAudioContext;
  private input: GainNode;
  private output: GainNode;
  private delay: DelayNode;
  private feedback: GainNode;
  private lfo: OscillatorNode;
  private lfoDepth: GainNode;
  private dryGain: GainNode;
  private wetGain: GainNode;
  private lfoStartTime: number;
  private lastRateHz = 1;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.delay = ctx.createDelay(MAX_DELAY_SEC);
    this.delay.delayTime.value = BASE_DELAY_SEC;
    this.feedback = ctx.createGain();
    this.lfo = ctx.createOscillator();
    this.lfo.type = "sine";
    this.lfoDepth = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    this.input.connect(this.delay);
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.wetGain);
    this.wetGain.connect(this.output);

    this.lfo.connect(this.lfoDepth);
    this.lfoDepth.connect(this.delay.delayTime);
    this.lfoStartTime = ctx.currentTime;
    this.lfo.start();
  }

  get inputNode(): AudioNode {
    return this.input;
  }
  get outputNode(): AudioNode {
    return this.output;
  }

  /** Same exact-phase computation as ChorusEffect.getLfoPhase() - see its
   * doc comment. */
  getLfoPhase(): number {
    const cycles = (this.ctx.currentTime - this.lfoStartTime) * this.lastRateHz;
    return cycles - Math.floor(cycles);
  }

  setParams(params: FlangerParams): void {
    const t = this.ctx.currentTime;
    this.lastRateHz = params.rateHz;
    this.lfo.frequency.setTargetAtTime(params.rateHz, t, 0.01);
    this.lfoDepth.gain.setTargetAtTime(params.depthMs / 1000, t, 0.01);
    this.feedback.gain.setTargetAtTime(Math.min(0.9, params.feedback), t, 0.01);
    this.dryGain.gain.setTargetAtTime(1 - params.mix, t, 0.01);
    this.wetGain.gain.setTargetAtTime(params.mix, t, 0.01);
  }

  dispose(): void {
    this.lfo.stop();
    this.input.disconnect();
    this.delay.disconnect();
    this.feedback.disconnect();
    this.lfo.disconnect();
    this.lfoDepth.disconnect();
    this.dryGain.disconnect();
    this.wetGain.disconnect();
  }
}
