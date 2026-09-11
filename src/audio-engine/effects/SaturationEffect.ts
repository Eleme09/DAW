import type { Effect } from "./Effect";
import type { SaturationParams } from "@/types/effects";
import { makeSaturationCurve } from "./curves";

const POST_GAIN_COMPENSATION = 0.85; // shaped signal reads louder than input; pull back a bit

export class SaturationEffect implements Effect<SaturationParams> {
  private ctx: AudioContext;
  private input: GainNode;
  private output: GainNode;
  private drive: GainNode;
  private shaper: WaveShaperNode;
  private postGain: GainNode;
  private dryGain: GainNode;
  private wetGain: GainNode;
  private currentTone: SaturationParams["tone"] | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.drive = ctx.createGain();
    this.shaper = ctx.createWaveShaper();
    this.shaper.oversample = "4x";
    this.postGain = ctx.createGain();
    this.postGain.gain.value = POST_GAIN_COMPENSATION;
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    this.input.connect(this.drive);
    this.drive.connect(this.shaper);
    this.shaper.connect(this.postGain);
    this.postGain.connect(this.wetGain);
    this.wetGain.connect(this.output);
  }

  get inputNode(): AudioNode {
    return this.input;
  }
  get outputNode(): AudioNode {
    return this.output;
  }

  setParams(params: SaturationParams): void {
    if (params.tone !== this.currentTone) {
      this.shaper.curve = makeSaturationCurve(params.tone);
      this.currentTone = params.tone;
    }
    const t = this.ctx.currentTime;
    this.drive.gain.setTargetAtTime(Math.pow(10, params.driveDb / 20), t, 0.01);
    this.dryGain.gain.setTargetAtTime(1 - params.mix, t, 0.01);
    this.wetGain.gain.setTargetAtTime(params.mix, t, 0.01);
  }

  dispose(): void {
    this.input.disconnect();
    this.drive.disconnect();
    this.shaper.disconnect();
    this.postGain.disconnect();
    this.dryGain.disconnect();
    this.wetGain.disconnect();
  }
}
