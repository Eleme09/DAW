import type { Effect } from "./Effect";
import type { ReverbParams } from "@/types/effects";
import { generateImpulseResponseSamples } from "./impulseResponse";

export class ReverbEffect implements Effect<ReverbParams> {
  private ctx: BaseAudioContext;
  private input: GainNode;
  private output: GainNode;
  private convolver: ConvolverNode;
  private dryGain: GainNode;
  private wetGain: GainNode;
  private irKey: string | null = null;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.convolver = ctx.createConvolver();
    this.convolver.normalize = true;
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.input.connect(this.convolver);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.output);
  }

  get inputNode(): AudioNode {
    return this.input;
  }
  get outputNode(): AudioNode {
    return this.output;
  }

  setParams(params: ReverbParams): void {
    const key = `${params.decaySec}:${params.sizeType}`;
    if (key !== this.irKey) {
      this.convolver.buffer = this.buildImpulseResponse(params.decaySec, params.sizeType);
      this.irKey = key;
    }
    const t = this.ctx.currentTime;
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
    this.convolver.disconnect();
    this.dryGain.disconnect();
    this.wetGain.disconnect();
  }
}
