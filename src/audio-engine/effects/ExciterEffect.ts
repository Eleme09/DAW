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

    // Dry signal passes through untouched.
    this.input.connect(this.output);

    this.input.connect(this.highpass);
    this.highpass.connect(this.drive);
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

  setParams(params: ExciterParams): void {
    const t = this.ctx.currentTime;
    this.highpass.frequency.setTargetAtTime(params.freq, t, 0.01);
    this.drive.gain.setTargetAtTime(Math.pow(10, params.driveDb / 20), t, 0.01);
    this.wetGain.gain.setTargetAtTime(params.mix, t, 0.01);
  }

  dispose(): void {
    this.input.disconnect();
    this.highpass.disconnect();
    this.drive.disconnect();
    this.shaper.disconnect();
    this.postGain.disconnect();
    this.wetGain.disconnect();
  }
}
