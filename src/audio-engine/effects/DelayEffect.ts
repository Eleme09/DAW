import type { Effect } from "./Effect";
import type { DelayParams } from "@/types/effects";

const MAX_DELAY_SEC = 4;

/**
 * Feedback delay with a lowpass filter in the feedback loop (tape-style
 * damping) and a high-pass on the echoes. Two networks always run side by
 * side and a pair of gains picks one, so switching mode never rebuilds the
 * graph mid-song:
 *  - straight: one delay line, echoes centred;
 *  - ping-pong: two lines feeding each other through the feedback, the
 *    first echo on the left, the next on the right, and so on.
 */
export class DelayEffect implements Effect<DelayParams> {
  private ctx: BaseAudioContext;
  private input: GainNode;
  private output: GainNode;
  private lowCut: BiquadFilterNode;
  private delay: DelayNode;
  private feedback: GainNode;
  private dampingFilter: BiquadFilterNode;
  private straightOut: GainNode;
  private delayL: DelayNode;
  private delayR: DelayNode;
  private dampL: BiquadFilterNode;
  private dampR: BiquadFilterNode;
  private fbLR: GainNode;
  private fbRL: GainNode;
  private merger: ChannelMergerNode;
  private pingPongOut: GainNode;
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
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();
    this.wetAnalyser = ctx.createAnalyser();
    this.wetAnalyser.fftSize = 1024;

    // mono into the echoes (a ping-pong of a stereo source would smear it)
    this.lowCut = ctx.createBiquadFilter();
    this.lowCut.type = "highpass";
    this.lowCut.frequency.value = 20;
    this.lowCut.channelCount = 1;
    this.lowCut.channelCountMode = "explicit";

    const damp = () => {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      return f;
    };

    this.delay = ctx.createDelay(MAX_DELAY_SEC);
    this.feedback = ctx.createGain();
    this.dampingFilter = damp();
    this.straightOut = ctx.createGain();

    this.delayL = ctx.createDelay(MAX_DELAY_SEC);
    this.delayR = ctx.createDelay(MAX_DELAY_SEC);
    this.dampL = damp();
    this.dampR = damp();
    this.fbLR = ctx.createGain();
    this.fbRL = ctx.createGain();
    this.merger = ctx.createChannelMerger(2);
    this.pingPongOut = ctx.createGain();
    this.pingPongOut.gain.value = 0;

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.input.connect(this.lowCut);

    this.lowCut.connect(this.delay);
    this.delay.connect(this.dampingFilter);
    this.dampingFilter.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.dampingFilter.connect(this.straightOut);
    this.straightOut.connect(this.wetGain);

    this.lowCut.connect(this.delayL);
    this.delayL.connect(this.dampL);
    this.dampL.connect(this.merger, 0, 0);
    this.dampL.connect(this.fbLR);
    this.fbLR.connect(this.delayR);
    this.delayR.connect(this.dampR);
    this.dampR.connect(this.merger, 0, 1);
    this.dampR.connect(this.fbRL);
    this.fbRL.connect(this.delayL);
    this.merger.connect(this.pingPongOut);
    this.pingPongOut.connect(this.wetGain);

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
    const time = Math.min(MAX_DELAY_SEC, Math.max(0.001, params.timeMs / 1000));
    const fb = Math.min(0.95, Math.max(0, params.feedback));
    const ping = params.pingPong === true;
    for (const d of [this.delay, this.delayL, this.delayR]) d.delayTime.setTargetAtTime(time, t, 0.01);
    for (const g of [this.feedback, this.fbLR, this.fbRL]) g.gain.setTargetAtTime(fb, t, 0.01);
    for (const f of [this.dampingFilter, this.dampL, this.dampR]) f.frequency.setTargetAtTime(params.filterFreq, t, 0.01);
    this.lowCut.frequency.setTargetAtTime(Math.max(20, Math.min(2000, params.lowCutHz ?? 20)), t, 0.01);
    this.straightOut.gain.setTargetAtTime(ping ? 0 : 1, t, 0.02);
    this.pingPongOut.gain.setTargetAtTime(ping ? 1 : 0, t, 0.02);
    this.dryGain.gain.setTargetAtTime(1 - params.mix, t, 0.01);
    this.wetGain.gain.setTargetAtTime(params.mix, t, 0.01);
  }

  dispose(): void {
    for (const n of [
      this.input,
      this.lowCut,
      this.delay,
      this.feedback,
      this.dampingFilter,
      this.straightOut,
      this.delayL,
      this.delayR,
      this.dampL,
      this.dampR,
      this.fbLR,
      this.fbRL,
      this.merger,
      this.pingPongOut,
      this.dryGain,
      this.wetGain,
      this.wetAnalyser,
    ])
      n.disconnect();
  }
}
