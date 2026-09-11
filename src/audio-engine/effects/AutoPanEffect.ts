import type { Effect } from "./Effect";
import type { AutoPanParams } from "@/types/effects";

/**
 * LFO-driven StereoPannerNode. `depth` scales the LFO's -1..1 sine output
 * before it reaches panner.pan, so depth=1 sweeps full hard-left to
 * hard-right and depth=0 sits dead center (silent effect, by design).
 */
export class AutoPanEffect implements Effect<AutoPanParams> {
  private ctx: BaseAudioContext;
  private panner: StereoPannerNode;
  private lfo: OscillatorNode;
  private lfoDepth: GainNode;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.panner = ctx.createStereoPanner();
    this.lfo = ctx.createOscillator();
    this.lfo.type = "sine";
    this.lfoDepth = ctx.createGain();

    this.lfo.connect(this.lfoDepth);
    this.lfoDepth.connect(this.panner.pan);
    this.lfo.start();
  }

  get inputNode(): AudioNode {
    return this.panner;
  }
  get outputNode(): AudioNode {
    return this.panner;
  }

  setParams(params: AutoPanParams): void {
    const t = this.ctx.currentTime;
    this.lfo.frequency.setTargetAtTime(params.rateHz, t, 0.01);
    this.lfoDepth.gain.setTargetAtTime(params.depth, t, 0.01);
  }

  dispose(): void {
    this.lfo.stop();
    this.panner.disconnect();
    this.lfo.disconnect();
    this.lfoDepth.disconnect();
  }
}
