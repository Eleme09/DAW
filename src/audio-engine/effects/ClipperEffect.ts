import type { Effect } from "./Effect";
import type { ClipperParams } from "@/types/effects";
import { makeHardClipCurve } from "./curves";

/** Standalone hard clipper — distinct from LimiterEffect (no compression stage first). */
export class ClipperEffect implements Effect<ClipperParams> {
  private ctx: BaseAudioContext;
  private preGain: GainNode;
  private shaper: WaveShaperNode;
  private makeupGain: GainNode;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.preGain = ctx.createGain();
    this.shaper = ctx.createWaveShaper();
    this.shaper.curve = makeHardClipCurve();
    this.shaper.oversample = "4x";
    this.makeupGain = ctx.createGain();

    this.preGain.connect(this.shaper);
    this.shaper.connect(this.makeupGain);
  }

  get inputNode(): AudioNode {
    return this.preGain;
  }
  get outputNode(): AudioNode {
    return this.makeupGain;
  }

  setParams(params: ClipperParams): void {
    const t = this.ctx.currentTime;
    const ceilingGainLinear = Math.pow(10, params.ceilingDb / 20);
    // Drive into the clip curve at unity, then attenuate to the ceiling.
    this.preGain.gain.setTargetAtTime(1, t, 0.01);
    this.makeupGain.gain.setTargetAtTime(ceilingGainLinear, t, 0.01);
  }

  dispose(): void {
    this.preGain.disconnect();
    this.shaper.disconnect();
    this.makeupGain.disconnect();
  }
}
