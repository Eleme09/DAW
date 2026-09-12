import type { Effect } from "./Effect";
import type { PitchCorrectionParams, PitchCorrectionScale } from "@/types/effects";

/** Must match SCALE_NAMES_BY_INDEX in public/worklets/realtime-pitch-processor.js
 * - scale is an AudioParam (not a port message) so it's correct from the
 * very first render quantum, see that file's comment for why. */
const SCALE_TO_INDEX: Record<PitchCorrectionScale, number> = {
  major: 0,
  naturalMinor: 1,
  harmonicMinor: 2,
  chromatic: 3,
  custom: 4,
};

export interface PitchCorrectionLiveInfo {
  detectedHz: number | null;
  targetHz: number | null;
  /** Unsmoothed nearest scale note, as a MIDI number - null when unvoiced. */
  snappedMidi: number | null;
  confidence: number;
  /** Cents from the raw detected pitch to `snappedMidi` - a tuner-style
   * "how far off" reading, distinct from targetHz (which is smoothed by
   * retuneSpeedMs/humanize and lags behind what you actually just sang). */
  centsOff: number | null;
}

/**
 * Wraps realtime-pitch-processor.js as a normal insert effect - the same
 * worklet the old global "Live Tune" monitor used, now placeable anywhere
 * in a track's chain instead of hardwired straight to the destination. The
 * worklet module must already be loaded on `ctx` (see EffectChain's
 * worklet-backed-placeholder handling) before this is constructed.
 *
 * Mono in, mono out (`channelCount: 1`): the pitch-detection/shifting
 * algorithm operates on a single channel, so a stereo track passing
 * through this effect is downmixed to mono from this point in its chain
 * onward - expected for a vocal-focused effect, named here rather than
 * silently surprising on a stereo import.
 */
export class PitchCorrectionEffect implements Effect<PitchCorrectionParams> {
  private node: AudioWorkletNode;
  private lastInfo: PitchCorrectionLiveInfo | null = null;

  constructor(ctx: BaseAudioContext) {
    this.node = new AudioWorkletNode(ctx, "realtime-pitch-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: "explicit",
    });
    this.node.port.onmessage = (event: MessageEvent<{ type: string } & PitchCorrectionLiveInfo>) => {
      if (event.data?.type !== "pitch") return;
      this.lastInfo = event.data;
    };
  }

  get inputNode(): AudioNode {
    return this.node;
  }
  get outputNode(): AudioNode {
    return this.node;
  }

  /** Most recent detected/target pitch reading, ~46ms old at most (posted
   * every 4 analysis hops) - polled from PitchCorrectionPanel's canvas draw
   * loop. Null until the first hop lands or the input has gone unvoiced. */
  getLastInfo(): PitchCorrectionLiveInfo | null {
    return this.lastInfo;
  }

  setParams(params: PitchCorrectionParams): void {
    const t = this.node.context.currentTime;
    const set = (name: string, value: number) => {
      const param = this.node.parameters.get(name);
      param?.setTargetAtTime(value, t, 0.01);
    };
    set("key", params.key);
    set("scaleIndex", SCALE_TO_INDEX[params.scale]);
    set("customMask", params.customMask);
    set("retuneSpeedMs", params.retuneSpeedMs);
    set("humanizeAmount", params.humanize);
    set("mix", params.mix);
    set("referenceHz", params.referenceHz);
    set("detectMinHz", params.detectMinHz);
    set("detectMaxHz", params.detectMaxHz);
  }

  dispose(): void {
    this.node.port.onmessage = null;
    this.node.disconnect();
    this.node.port.close();
  }
}
