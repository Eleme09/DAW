import type { Effect } from "./Effect";
import type { ReverbParams } from "@/types/effects";
import { generateImpulseResponseSamples } from "./impulseResponse";
import { BUTTERWORTH_Q_DB } from "./latency";

/** A new tail is built this long after the last Decay/Size change (not on
 * every knob step: building a 3 s stereo tail and swapping it into a
 * convolver on each move froze the UI and clicked)... */
const REBUILD_DELAY_MS = 140;
/** ...and faded in against the old one, so the swap is never heard as a cut. */
const SWAP_FADE_SEC = 0.08;

export class ReverbEffect implements Effect<ReverbParams> {
  private ctx: BaseAudioContext;
  private input: GainNode;
  private output: GainNode;
  /** Two convolvers: the live tail and the one the next tail is built into. */
  private convolver: ConvolverNode;
  private convolverB: ConvolverNode;
  private tailGain: GainNode;
  private tailGainB: GainNode;
  private live: 0 | 1 = 0;
  private rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  private predelay: DelayNode;
  private lowCut: BiquadFilterNode;
  private highCut: BiquadFilterNode;
  private dryGain: GainNode;
  private wetGain: GainNode;
  private irKey: string | null = null;
  /** Used as a send: only the tail comes out (the voice itself is not in it). */
  private sendMode = false;
  /** In series right after the wet path's own gain, before it rejoins the
   * dry signal - a real level reading of just the reverb tail this
   * instance is producing right now (not the dry+wet mix a track/master
   * analyser would show). */
  private wetAnalyser: AnalyserNode;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.convolver = ctx.createConvolver();
    this.convolver.normalize = true;
    this.convolverB = ctx.createConvolver();
    this.convolverB.normalize = true;
    this.tailGain = ctx.createGain();
    this.tailGainB = ctx.createGain();
    this.tailGainB.gain.value = 0;
    this.predelay = ctx.createDelay(0.25);
    this.lowCut = ctx.createBiquadFilter();
    this.lowCut.type = "highpass";
    this.lowCut.frequency.value = 20;
    this.lowCut.Q.value = BUTTERWORTH_Q_DB;
    this.highCut = ctx.createBiquadFilter();
    this.highCut.type = "lowpass";
    this.highCut.frequency.value = 20000;
    this.highCut.Q.value = BUTTERWORTH_Q_DB;
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();
    this.wetAnalyser = ctx.createAnalyser();
    this.wetAnalyser.fftSize = 1024;

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    // wet: pre-delay -> tail filters -> convolver (all linear, so filtering
    // before the convolution is the same as filtering the tail)
    this.input.connect(this.predelay);
    this.predelay.connect(this.lowCut);
    this.lowCut.connect(this.highCut);
    this.highCut.connect(this.convolver);
    this.convolver.connect(this.tailGain);
    this.tailGain.connect(this.wetGain);
    // B is fed only while it is (or is becoming) the live tail: an idle
    // convolver still convolves, which would double the reverb's cost
    this.convolverB.connect(this.tailGainB);
    this.tailGainB.connect(this.wetGain);
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

  setParams(params: ReverbParams): void {
    const key = `${params.decaySec}:${params.sizeType}`;
    if (key !== this.irKey) {
      if (this.irKey === null) {
        // first tail (and the only one an offline render ever sets): at once
        this.convolver.buffer = this.buildImpulseResponse(params.decaySec, params.sizeType);
      } else {
        if (this.rebuildTimer !== null) clearTimeout(this.rebuildTimer);
        const { decaySec, sizeType } = params;
        this.rebuildTimer = setTimeout(() => {
          this.rebuildTimer = null;
          this.swapTail(decaySec, sizeType);
        }, REBUILD_DELAY_MS);
      }
      this.irKey = key;
    }
    const t = this.ctx.currentTime;
    const nyquist = this.ctx.sampleRate / 2 - 100;
    this.predelay.delayTime.setTargetAtTime(Math.min(0.25, Math.max(0, (params.predelayMs ?? 0) / 1000)), t, 0.01);
    this.lowCut.frequency.setTargetAtTime(Math.max(20, Math.min(2000, params.lowCutHz ?? 20)), t, 0.01);
    this.highCut.frequency.setTargetAtTime(Math.max(1000, Math.min(nyquist, params.highCutHz ?? 20000)), t, 0.01);
    this.dryGain.gain.setTargetAtTime(this.sendMode ? 0 : 1 - params.mix, t, 0.01);
    this.wetGain.gain.setTargetAtTime(params.mix, t, 0.01);
  }

  private swapTail(decaySec: number, sizeType: ReverbParams["sizeType"]): void {
    const next = this.live === 0 ? this.convolverB : this.convolver;
    const old = this.live === 0 ? this.convolver : this.convolverB;
    const nextGain = this.live === 0 ? this.tailGainB : this.tailGain;
    const oldGain = this.live === 0 ? this.tailGain : this.tailGainB;
    next.buffer = this.buildImpulseResponse(decaySec, sizeType);
    this.highCut.connect(next);
    const t = this.ctx.currentTime;
    nextGain.gain.cancelScheduledValues(t);
    oldGain.gain.cancelScheduledValues(t);
    nextGain.gain.setValueAtTime(nextGain.gain.value, t);
    oldGain.gain.setValueAtTime(oldGain.gain.value, t);
    nextGain.gain.linearRampToValueAtTime(1, t + SWAP_FADE_SEC);
    oldGain.gain.linearRampToValueAtTime(0, t + SWAP_FADE_SEC);
    this.live = this.live === 0 ? 1 : 0;
    const live = this.live;
    setTimeout(() => {
      // still the old one (no newer swap brought it back): stop feeding it
      if ((live === 1 ? this.convolver : this.convolverB) !== old) return;
      try {
        this.highCut.disconnect(old);
      } catch {
        // already disconnected
      }
    }, SWAP_FADE_SEC * 1000 + 60);
  }

  private buildImpulseResponse(decaySec: number, sizeType: ReverbParams["sizeType"]): AudioBuffer {
    const sampleRate = this.ctx.sampleRate;
    const left = generateImpulseResponseSamples(sampleRate, decaySec, sizeType);
    const right = generateImpulseResponseSamples(sampleRate, decaySec, sizeType);
    const buffer = this.ctx.createBuffer(2, left.length, sampleRate);
    buffer.copyToChannel(left, 0);
    buffer.copyToChannel(right, 1);
    return buffer;
  }

  dispose(): void {
    if (this.rebuildTimer !== null) clearTimeout(this.rebuildTimer);
    this.convolverB.disconnect();
    this.tailGain.disconnect();
    this.tailGainB.disconnect();
    this.input.disconnect();
    this.predelay.disconnect();
    this.lowCut.disconnect();
    this.highCut.disconnect();
    this.convolver.disconnect();
    this.dryGain.disconnect();
    this.wetGain.disconnect();
    this.wetAnalyser.disconnect();
  }
}
