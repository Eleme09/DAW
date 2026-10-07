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
  /** Used as a send: only the echoes come out (the voice itself is not in it). */
  private sendMode = false;

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

  /** As a send the voice reaches the output through the chain, not through
   * here: dry off, and `mix` is the send level. */
  setSendMode(on: boolean): void {
    this.sendMode = on;
  }

  getWetAnalyser(): AnalyserNode {
    return this.wetAnalyser;
  }

  setParams(params: DelayParams): void {
    const t = this.ctx.currentTime;
    const time = Math.min(MAX_DELAY_SEC, Math.max(0.001, params.timeMs / 1000));
    const fb = Math.min(0.95, Math.max(0, params.feedback));
    const ping = params.pingPong === true;
    this.glideTime(time, t);
    for (const g of [this.feedback, this.fbLR, this.fbRL]) g.gain.setTargetAtTime(fb, t, 0.01);
    for (const f of [this.dampingFilter, this.dampL, this.dampR]) f.frequency.setTargetAtTime(params.filterFreq, t, 0.01);
    this.lowCut.frequency.setTargetAtTime(Math.max(20, Math.min(2000, params.lowCutHz ?? 20)), t, 0.01);
    this.straightOut.gain.setTargetAtTime(ping ? 0 : 1, t, 0.02);
    this.pingPongOut.gain.setTargetAtTime(ping ? 1 : 0, t, 0.02);
    this.dryGain.gain.setTargetAtTime(this.sendMode ? 0 : 1 - params.mix, t, 0.01);
    this.wetGain.gain.setTargetAtTime(params.mix, t, 0.01);
  }

  /** Current delay-time ramp, so a new target starts exactly where the
   * old one is (reading `.value` lags a block: re-anchoring on it jumped
   * the read point and clicked). */
  private ramp: { from: number; to: number; t0: number; t1: number } | null = null;

  /** Delay time glides no faster than 0.3 s per second (a tape delay's pitch
   * bend while the knob turns). It used to follow in 10 ms: dragging across
   * the range read the buffer BACKWARDS - garbled noise. */
  private glideTime(time: number, t: number): void {
    const lines = [this.delay, this.delayL, this.delayR];
    if (!this.ramp) {
      for (const d of lines) d.delayTime.value = time;
      this.ramp = { from: time, to: time, t0: t, t1: t };
      return;
    }
    const r = this.ramp;
    if (Math.abs(r.to - time) < 1e-6) return;
    const now = t >= r.t1 ? r.to : r.from + ((r.to - r.from) * (t - r.t0)) / (r.t1 - r.t0);
    const end = t + Math.max(0.03, Math.abs(time - now) / 0.3);
    for (const d of lines) {
      d.delayTime.cancelScheduledValues(t);
      d.delayTime.setValueAtTime(now, t);
      d.delayTime.linearRampToValueAtTime(time, end);
    }
    this.ramp = { from: now, to: time, t0: t, t1: end };
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
