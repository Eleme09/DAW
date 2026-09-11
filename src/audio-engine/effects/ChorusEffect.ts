import type { Effect } from "./Effect";
import type { ChorusParams } from "@/types/effects";

const BASE_DELAY_SEC = 0.02; // ~20ms — classic chorus territory (vs. flanger's ~1-10ms)
const MAX_DELAY_SEC = 0.05;

/**
 * Single-voice modulated delay: an LFO drives the delay time around
 * BASE_DELAY_SEC, the delayed (wet) signal is blended with the dry
 * signal. The LFO oscillator starts once at construction and runs for
 * the node's lifetime — same pattern used for every other continuously-
 * running LFO in this file family (Flanger, AutoPan).
 */
export class ChorusEffect implements Effect<ChorusParams> {
  private ctx: BaseAudioContext;
  private input: GainNode;
  private output: GainNode;
  private delay: DelayNode;
  private lfo: OscillatorNode;
  private lfoDepth: GainNode;
  private dryGain: GainNode;
  private wetGain: GainNode;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.delay = ctx.createDelay(MAX_DELAY_SEC);
    this.delay.delayTime.value = BASE_DELAY_SEC;
    this.lfo = ctx.createOscillator();
    this.lfo.type = "sine";
    this.lfoDepth = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    this.input.connect(this.delay);
    this.delay.connect(this.wetGain);
    this.wetGain.connect(this.output);

    this.lfo.connect(this.lfoDepth);
    this.lfoDepth.connect(this.delay.delayTime);
    this.lfo.start();
  }

  get inputNode(): AudioNode {
    return this.input;
  }
  get outputNode(): AudioNode {
    return this.output;
  }

  setParams(params: ChorusParams): void {
    const t = this.ctx.currentTime;
    this.lfo.frequency.setTargetAtTime(params.rateHz, t, 0.01);
    this.lfoDepth.gain.setTargetAtTime(params.depthMs / 1000, t, 0.01);
    this.dryGain.gain.setTargetAtTime(1 - params.mix, t, 0.01);
    this.wetGain.gain.setTargetAtTime(params.mix, t, 0.01);
  }

  dispose(): void {
    this.lfo.stop();
    this.input.disconnect();
    this.delay.disconnect();
    this.lfo.disconnect();
    this.lfoDepth.disconnect();
    this.dryGain.disconnect();
    this.wetGain.disconnect();
  }
}
