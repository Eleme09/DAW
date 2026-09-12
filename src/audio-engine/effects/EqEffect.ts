import type { Effect } from "./Effect";
import type { EqParams } from "@/types/effects";

export const WEB_AUDIO_FILTER_TYPE: Record<EqParams["bands"][number]["type"], BiquadFilterType> = {
  highpass: "highpass",
  lowshelf: "lowshelf",
  peaking: "peaking",
  highshelf: "highshelf",
  lowpass: "lowpass",
};

/**
 * A chain of BiquadFilterNodes, one per band, rebuilt whenever the band
 * count/order changes and just AudioParam-updated otherwise (no clicks on a
 * plain parameter tweak).
 */
export class EqEffect implements Effect<EqParams> {
  private ctx: BaseAudioContext;
  private input: GainNode;
  private output: GainNode;
  private filters: BiquadFilterNode[] = [];
  private bandIds: string[] = [];

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.input.connect(this.output);
  }

  get inputNode(): AudioNode {
    return this.input;
  }
  get outputNode(): AudioNode {
    return this.output;
  }

  setParams(params: EqParams): void {
    const sameShape =
      params.bands.length === this.bandIds.length &&
      params.bands.every((b, i) => b.id === this.bandIds[i]);

    if (!sameShape) {
      this.rebuild(params);
      return;
    }

    params.bands.forEach((band, i) => {
      const filter = this.filters[i];
      filter.type = WEB_AUDIO_FILTER_TYPE[band.type];
      filter.frequency.setTargetAtTime(band.freq, this.ctx.currentTime, 0.01);
      filter.Q.setTargetAtTime(band.q, this.ctx.currentTime, 0.01);
      const gain = band.enabled ? band.gainDb : 0;
      filter.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.01);
    });
  }

  private rebuild(params: EqParams): void {
    this.input.disconnect();
    for (const f of this.filters) f.disconnect();
    this.filters = [];
    this.bandIds = params.bands.map((b) => b.id);

    let node: AudioNode = this.input;
    for (const band of params.bands) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = WEB_AUDIO_FILTER_TYPE[band.type];
      filter.frequency.value = band.freq;
      filter.Q.value = band.q;
      filter.gain.value = band.enabled ? band.gainDb : 0;
      node.connect(filter);
      node = filter;
      this.filters.push(filter);
    }
    node.connect(this.output);
  }

  dispose(): void {
    this.input.disconnect();
    for (const f of this.filters) f.disconnect();
  }
}
