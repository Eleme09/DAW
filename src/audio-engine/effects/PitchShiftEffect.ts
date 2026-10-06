import type { Effect } from "./Effect";
import type { PitchShiftParams } from "@/types/effects";
import { autoPitchLatencySec } from "../autopitch/resolveAutoPitch";

/**
 * Pitch shifter for a voice: the autopitch-processor worklet with the tuner
 * off (amount 0) and its lead shifted by a fixed amount - TD-PSOLA on the
 * voice's own tracked pitch marks, so the timbre stays (formants move only
 * with `formantSt`), and unvoiced consonants pass unshifted and aligned.
 * Measured on the user's vocal (median of the output pitch vs the input):
 * -12 st -> -1197 c, -7 -> -700, -5 -> -501, +7 -> +699, +12 -> +1199;
 * formants unchanged at formantSt 0 (F1/F2 ratio 1.00).
 *
 * Mono in (a voice), stereo out. Delays its signal by the engine's constant
 * latency (~38 ms), which the chain reports so playback starts the track's
 * clips that much earlier. The module must already be loaded on `ctx`.
 */
export class PitchShiftEffect implements Effect<PitchShiftParams> {
  private ctx: BaseAudioContext;
  private node: AudioWorkletNode;
  private first = true;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.node = new AudioWorkletNode(ctx, "autopitch-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 1,
      channelCountMode: "explicit",
      channelInterpretation: "speakers",
    });
    // no tuning, nothing but the shifted lead
    this.write({ amount: 0, speedMs: 0, transitionMs: 0, humanize: 0, flex: 0, hard: 0, leadGain: 1, lowLatency: 0 }, true);
  }

  get inputNode(): AudioNode {
    return this.node;
  }
  get outputNode(): AudioNode {
    return this.node;
  }

  static latencySec(sampleRate: number): number {
    return autoPitchLatencySec(false, sampleRate);
  }

  setParams(params: PitchShiftParams): void {
    const semis = Math.max(-12, Math.min(12, params.semitones)) + Math.max(-50, Math.min(50, params.cents)) / 100;
    this.write(
      {
        shift: semis,
        leadFormant: Math.max(0.5, Math.min(2, Math.pow(2, Math.max(-12, Math.min(12, params.formantSt)) / 12))),
        shiftMix: Math.max(0, Math.min(1, params.mix)),
      },
      this.first
    );
    this.first = false;
  }

  private write(values: Record<string, number>, now: boolean): void {
    const t = this.ctx.currentTime;
    for (const [name, value] of Object.entries(values)) {
      const param = this.node.parameters.get(name);
      if (!param) continue;
      // first write lands at once (an offline render must be right from
      // sample zero); later ones glide so a knob move doesn't click
      if (now) param.value = value;
      else param.setTargetAtTime(value, t, 0.02);
    }
  }

  dispose(): void {
    this.node.disconnect();
    this.node.port.close();
  }
}
