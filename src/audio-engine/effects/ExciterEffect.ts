import type { Effect } from "./Effect";
import type { ExciterParams } from "@/types/effects";
import { makeSaturationCurve } from "./curves";

const POST_GAIN_COMPENSATION = 0.6; // the shaped+highpassed band still reads hot; pull back before blending in

/**
 * Harmonic exciter: highpass-isolates the top end, drives it through the
 * same saturation curve SaturationEffect uses (reused rather than
 * inventing a second waveshaping curve), and blends the result back on
 * top of the untouched dry signal — additive, not a dry/wet crossfade,
 * matching how hardware/plugin exciters actually behave (they add
 * harmonic "air," they don't replace the source).
 */
export class ExciterEffect implements Effect<ExciterParams> {
  private ctx: BaseAudioContext;
  private input: GainNode;
  private output: GainNode;
  private highpass: BiquadFilterNode;
  private drive: GainNode;
  private shaper: WaveShaperNode;
  private postGain: GainNode;
  private wetGain: GainNode;
  /** In series before the dry/wet split and after the final mix - same
   * pattern as SaturationEffect's inputAnalyser/outputAnalyser, needed
   * for the same reason: a post-chain track/master analyser would already
   * include whatever runs after this effect. */
  private inputAnalyser: AnalyserNode;
  private outputAnalyser: AnalyserNode;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.highpass = ctx.createBiquadFilter();
    this.highpass.type = "highpass";
    this.drive = ctx.createGain();
    this.shaper = ctx.createWaveShaper();
    this.shaper.curve = makeSaturationCurve("bright");
    this.shaper.oversample = "4x";
    this.postGain = ctx.createGain();
    this.postGain.gain.value = POST_GAIN_COMPENSATION;
    this.wetGain = ctx.createGain();
    this.inputAnalyser = ctx.createAnalyser();
    this.inputAnalyser.fftSize = 2048;
    this.outputAnalyser = ctx.createAnalyser();
    this.outputAnalyser.fftSize = 2048;

    this.input.connect(this.inputAnalyser);

    // Dry signal passes through untouched.
    this.inputAnalyser.connect(this.output);

    this.inputAnalyser.connect(this.highpass);
    this.highpass.connect(this.drive);
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

  setParams(params: ExciterParams): void {
    const t = this.ctx.currentTime;
    this.highpass.frequency.setTargetAtTime(params.freq, t, 0.01);
    this.drive.gain.setTargetAtTime(Math.pow(10, params.driveDb / 20), t, 0.01);
    this.wetGain.gain.setTargetAtTime(params.mix, t, 0.01);
  }

  dispose(): void {
    this.input.disconnect();
    this.inputAnalyser.disconnect();
    this.highpass.disconnect();
    this.drive.disconnect();
    this.shaper.disconnect();
    this.postGain.disconnect();
    this.wetGain.disconnect();
    this.outputAnalyser.disconnect();
  }
}
