import { psolaShift } from "./psola";
import type { CorrectionFrame } from "./correctionCurve";
import { trackPitch } from "./pitchDetection";
import type { PitchFrame } from "@/types/pitch";

/**
 * A fixed-ratio transpose of a whole buffer by `semitones` - the region
 * "Transpose" feature BandLab's own mobile help docs describe, not vocal
 * pitch correction. Reuses the same real-time-period-tracking PSOLA engine
 * `doubler.ts`/`applyPitchCorrection.ts` already use (formant-preserving,
 * measured in `psola.test.ts`), just with a target curve that's always
 * "detected × 2^(semitones/12)" instead of a scale-snap or a pitch-
 * following walk. Unvoiced/undetected regions pass through PSOLA unshifted
 * (targetFrequencyHz null) - there's no pitch there to apply a ratio to.
 *
 * `MAX_SEMITONES` is ±10, not BandLab's ±12 - measured, not copied from
 * their spec: a synthetic test tone tracked the real shifted pitch
 * accurately from ±6 through ±10, but ±11/±12 locked onto the wrong
 * octave/alias instead (see `transpose.test.ts`'s range test for the
 * numbers). That's a real limit of `psolaShift`'s mark-spacing at extreme
 * ratios, the same wall the realtime worklet hit earlier (its own
 * fixed-semitone mode is clamped to ±6 for the same reason) - exposing a
 * bigger range here than what's actually verified to work would be
 * inventing capability this engine doesn't have.
 */
export const MAX_TRANSPOSE_SEMITONES = 10;
const VOICED_CONFIDENCE_MIN = 0.5;

export function buildTransposeCurve(frames: PitchFrame[], semitones: number): CorrectionFrame[] {
  const ratio = Math.pow(2, semitones / 12);
  return frames.map((frame) => ({
    timeSec: frame.timeSec,
    detectedFrequencyHz: frame.frequencyHz,
    targetFrequencyHz:
      frame.frequencyHz !== null && frame.confidence >= VOICED_CONFIDENCE_MIN ? frame.frequencyHz * ratio : null,
  }));
}

export function transposeChannel(
  channelData: Float32Array,
  sampleRate: number,
  semitones: number,
  frames?: PitchFrame[]
): Float32Array {
  if (semitones === 0) return Float32Array.from(channelData);
  const pitchFrames = frames ?? trackPitch(channelData, sampleRate);
  const curve = buildTransposeCurve(pitchFrames, semitones);
  return psolaShift(channelData, sampleRate, curve);
}

export function transposeBuffer(channels: Float32Array[], sampleRate: number, semitones: number): Float32Array[] {
  return channels.map((channel) => transposeChannel(channel, sampleRate, semitones));
}
