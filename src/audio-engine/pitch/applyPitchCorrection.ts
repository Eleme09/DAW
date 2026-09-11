import { trackPitch } from "./pitchDetection";
import { detectKey } from "./keyDetection";
import { buildCorrectionCurve } from "./correctionCurve";
import { psolaShift } from "./psola";
import type { DetectedKeyResult, PitchCorrectionSettings, PitchFrame } from "@/types/pitch";

/**
 * Ties detection -> correction curve -> resynthesis together. This is an
 * offline **render**, not a real-time insert effect: unlike Phase 3's
 * effect chain (non-destructive, live, reversible), our pitch correction
 * needs the whole take's pitch track before it can compute a sensible
 * correction curve (retune-speed glide and humanize both need to see
 * forward/backward in time), and PSOLA resynthesis isn't a per-block
 * streaming operation. Real-time pitch correction (monitor-while-singing)
 * would need a fundamentally different approach — a streaming pitch
 * tracker + an AudioWorklet-based shifter with bounded look-ahead — and is
 * explicitly not attempted here. See AUDIO_ENGINE.md / AI_FEATURES.md.
 *
 * The output is a *new* buffer/sample, never an in-place mutation — the
 * original recording is always preserved (see BrowserPanel's "Apply Pitch
 * Correction" flow, which creates a new sample + clip rather than
 * overwriting the source take).
 */

export interface PitchAnalysis {
  frames: PitchFrame[];
  detectedKey: DetectedKeyResult;
}

export function analyzePitch(channelData: Float32Array, sampleRate: number): PitchAnalysis {
  const frames = trackPitch(channelData, sampleRate);
  return { frames, detectedKey: detectKey(frames) };
}

export function correctPitchChannel(
  channelData: Float32Array,
  sampleRate: number,
  settings: PitchCorrectionSettings,
  frames?: PitchFrame[]
): Float32Array {
  const pitchFrames = frames ?? trackPitch(channelData, sampleRate);
  const curve = buildCorrectionCurve(pitchFrames, settings);
  return psolaShift(channelData, sampleRate, curve);
}

/** Runs correction independently per channel (each channel gets its own pitch track). */
export function correctPitchBuffer(
  channels: Float32Array[],
  sampleRate: number,
  settings: PitchCorrectionSettings
): Float32Array[] {
  return channels.map((channel) => correctPitchChannel(channel, sampleRate, settings));
}
