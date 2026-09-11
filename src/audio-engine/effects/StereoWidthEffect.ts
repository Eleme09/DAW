import type { Effect } from "./Effect";
import type { StereoWidthParams } from "@/types/effects";

/**
 * Mid-side width control. Splits L/R via ChannelSplitterNode, derives
 * mid = 0.5(L+R) and side = 0.5(L-R) using plain GainNode addition (Web
 * Audio sums multiple connections into one node — that's the "+"; a
 * negative gain is the "-"), scales side by `width`, and recombines
 * (mid + width*side, mid - width*side) via ChannelMergerNode.
 *
 * Only audibly does anything on genuinely stereo material — see
 * StereoWidthParams's doc comment in types/effects.ts. A ChannelSplitterNode
 * fed a true mono (1-channel) source leaves its second output silent per
 * the Web Audio spec (no up-mixing), so mid/side reduce to 0.5*L/0.5*L in
 * that case and widening has no effect, which is the correct (not buggy)
 * behavior for genuinely mono input.
 */
export class StereoWidthEffect implements Effect<StereoWidthParams> {
  private ctx: BaseAudioContext;
  private input: GainNode;
  private output: GainNode;
  private splitter: ChannelSplitterNode;
  private merger: ChannelMergerNode;
  private midFromL: GainNode;
  private midFromR: GainNode;
  private mid: GainNode;
  private sideFromL: GainNode;
  private sideFromRInverted: GainNode;
  private side: GainNode;
  private widthPos: GainNode;
  private widthNeg: GainNode;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.splitter = ctx.createChannelSplitter(2);
    this.merger = ctx.createChannelMerger(2);

    this.midFromL = ctx.createGain();
    this.midFromL.gain.value = 0.5;
    this.midFromR = ctx.createGain();
    this.midFromR.gain.value = 0.5;
    this.mid = ctx.createGain();

    this.sideFromL = ctx.createGain();
    this.sideFromL.gain.value = 0.5;
    this.sideFromRInverted = ctx.createGain();
    this.sideFromRInverted.gain.value = -0.5;
    this.side = ctx.createGain();

    this.widthPos = ctx.createGain();
    this.widthNeg = ctx.createGain();

    this.input.connect(this.splitter);
    this.splitter.connect(this.midFromL, 0);
    this.splitter.connect(this.midFromR, 1);
    this.midFromL.connect(this.mid);
    this.midFromR.connect(this.mid);

    this.splitter.connect(this.sideFromL, 0);
    this.splitter.connect(this.sideFromRInverted, 1);
    this.sideFromL.connect(this.side);
    this.sideFromRInverted.connect(this.side);

    this.side.connect(this.widthPos);
    this.side.connect(this.widthNeg);

    this.mid.connect(this.merger, 0, 0);
    this.widthPos.connect(this.merger, 0, 0);
    this.mid.connect(this.merger, 0, 1);
    this.widthNeg.connect(this.merger, 0, 1);

    this.merger.connect(this.output);
  }

  get inputNode(): AudioNode {
    return this.input;
  }
  get outputNode(): AudioNode {
    return this.output;
  }

  setParams(params: StereoWidthParams): void {
    const t = this.ctx.currentTime;
    this.widthPos.gain.setTargetAtTime(params.width, t, 0.01);
    this.widthNeg.gain.setTargetAtTime(-params.width, t, 0.01);
  }

  dispose(): void {
    this.input.disconnect();
    this.splitter.disconnect();
    this.merger.disconnect();
    this.midFromL.disconnect();
    this.midFromR.disconnect();
    this.mid.disconnect();
    this.sideFromL.disconnect();
    this.sideFromRInverted.disconnect();
    this.side.disconnect();
    this.widthPos.disconnect();
    this.widthNeg.disconnect();
    this.output.disconnect();
  }
}
