import { frequencyToMidi, midiToFrequency, scaleStepUp } from "./noteUtils";
import { psolaShift } from "./psola";
import type { CorrectionFrame } from "./correctionCurve";
import { trackPitch } from "./pitchDetection";
import type { PitchFrame } from "@/types/pitch";
import type { ScaleName } from "@/types/pitch";

/**
 * Brief mode 7, "Armonizador": generates a harmony voice a fixed number of
 * *scale degrees* above/below the detected melody (a diatonic interval -
 * see scaleStepUp's doc comment for why that's not the same as a fixed
 * semitone shift), reusing the same offline PSOLA-lite resynthesis the
 * scale-correction render already uses. Not a new pitch-shifting engine.
 */
export function buildHarmonyCurve(frames: PitchFrame[], key: number, scale: ScaleName, scaleSteps: number): CorrectionFrame[] {
  const VOICED_CONFIDENCE_MIN = 0.5;
  return frames.map((frame) => {
    if (frame.frequencyHz === null || frame.confidence < VOICED_CONFIDENCE_MIN) {
      return { timeSec: frame.timeSec, detectedFrequencyHz: frame.frequencyHz, targetFrequencyHz: null };
    }
    const detectedMidi = frequencyToMidi(frame.frequencyHz);
    const harmonyMidi = scaleStepUp(detectedMidi, key, scale, scaleSteps);
    return { timeSec: frame.timeSec, detectedFrequencyHz: frame.frequencyHz, targetFrequencyHz: midiToFrequency(harmonyMidi) };
  });
}

export function harmonizeChannel(
  channelData: Float32Array,
  sampleRate: number,
  key: number,
  scale: ScaleName,
  scaleSteps: number,
  frames?: PitchFrame[]
): Float32Array {
  const pitchFrames = frames ?? trackPitch(channelData, sampleRate);
  const curve = buildHarmonyCurve(pitchFrames, key, scale, scaleSteps);
  return psolaShift(channelData, sampleRate, curve);
}

export function harmonizeBuffer(
  channels: Float32Array[],
  sampleRate: number,
  key: number,
  scale: ScaleName,
  scaleSteps: number
): Float32Array[] {
  return channels.map((channel) => harmonizeChannel(channel, sampleRate, key, scale, scaleSteps));
}
