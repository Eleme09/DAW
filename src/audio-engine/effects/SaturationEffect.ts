import type { Effect } from "./Effect";
import type { SaturationParams } from "@/types/effects";
import { makeSaturationCurve } from "./curves";

const POST_GAIN_COMPENSATION = 0.85; // shaped signal reads louder than input; pull back a bit

export class SaturationEffect implements Effect<SaturationParams> {
  private ctx: BaseAudioContext;
  private input: GainNode;
  private output: GainNode;
  private drive: GainNode;
  private shaper: WaveShaperNode;
  private postGain: GainNode;
  private dryGain: GainNode;
  private wetGain: GainNode;
  private currentTone: SaturationParams["tone"] | null = null;
  /** In series before the dry/wet split and after the final mix
   * respectively - same reasoning as NoiseGate/DeEsser's inline analysers:
   * a track/master analyser only sees the post-*chain* result, which
   * would already include whatever runs after this effect. These two are
   * the real signal arriving at THIS instance and the real signal this
   * instance hands onward, regardless of what else is inserted around it -
   * exactly what an honest before/after spectrum comparison needs. */
  private inputAnalyser: AnalyserNode;
  private outputAnalyser: AnalyserNode;

  constructor(ctx: BaseAudioContext) {
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
    this.inputAnalyser = ctx.createAnalyser();
    this.inputAnalyser.fftSize = 2048;
    this.outputAnalyser = ctx.createAnalyser();
    this.outputAnalyser.fftSize = 2048;

    this.input.connect(this.inputAnalyser);

    this.inputAnalyser.connect(this.dryGain);
    this.dryGain.connect(this.output);

    this.inputAnalyser.connect(this.drive);
    this.drive.connect(this.shaper);
    this.shaper.connect(this.postGain);
    this.postGain.connect(this.wetGain);
    this.wetGain.connect(this.output);

    this.output.connect(this.outputAnalyser);
  }

  get inputNode(): AudioNode {
    return this.input;
  }
  get outputNode(): AudioNode {
    return this.outputAnalyser;
  }

  getInputAnalyser(): AnalyserNode {
    return this.inputAnalyser;
  }
  getOutputAnalyser(): AnalyserNode {
    return this.outputAnalyser;
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
