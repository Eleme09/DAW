import type { Effect } from "./Effect";
import type { ReverbParams } from "@/types/effects";
import { generateImpulseResponseSamples } from "./impulseResponse";
import { BUTTERWORTH_Q_DB } from "./latency";

export class ReverbEffect implements Effect<ReverbParams> {
  private ctx: BaseAudioContext;
  private input: GainNode;
  private output: GainNode;
  private convolver: ConvolverNode;
  private predelay: DelayNode;
  private lowCut: BiquadFilterNode;
  private highCut: BiquadFilterNode;
  private dryGain: GainNode;
  private wetGain: GainNode;
  private irKey: string | null = null;
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
    this.convolver.connect(this.wetGain);
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

  setParams(params: ReverbParams): void {
    const key = `${params.decaySec}:${params.sizeType}`;
    if (key !== this.irKey) {
      this.convolver.buffer = this.buildImpulseResponse(params.decaySec, params.sizeType);
      this.irKey = key;
    }
    const t = this.ctx.currentTime;
    const nyquist = this.ctx.sampleRate / 2 - 100;
    this.predelay.delayTime.setTargetAtTime(Math.min(0.25, Math.max(0, (params.predelayMs ?? 0) / 1000)), t, 0.01);
    this.lowCut.frequency.setTargetAtTime(Math.max(20, Math.min(2000, params.lowCutHz ?? 20)), t, 0.01);
    this.highCut.frequency.setTargetAtTime(Math.max(1000, Math.min(nyquist, params.highCutHz ?? 20000)), t, 0.01);
    this.dryGain.gain.setTargetAtTime(1 - params.mix, t, 0.01);
    this.wetGain.gain.setTargetAtTime(params.mix, t, 0.01);
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
