import { lowpassFilter } from "./filters";
import { trackPitch } from "../pitch/pitchDetection";
import type { BassNote } from "@/types/beat";

/**
 * Bass/808 line tracking: lowpass-isolate the low end, then run the same
 * YIN tracker Phase 5 uses for vocals, tuned to the bass range instead.
 * This is monophonic pitch tracking on a filtered signal, not source
 * separation — a loud kick or 808 sub will still dominate and can pull the
 * detected pitch off the actual bassline note in busy sections. Reasonable
 * for a "what's the 808 roughly doing" read, not a transcription-grade
 * result.
 */

const BASS_LOWPASS_HZ = 250;
const BASS_MIN_HZ = 30;
const BASS_MAX_HZ = 260;
const FRAME_SIZE = 4096; // low frequencies need a longer window to resolve
// Coarser than Phase 5's vocal hop on purpose: YIN's difference-function is
// the most expensive step in beat analysis (O(period range x window) per
// frame), and a beat can run minutes long where a vocal take runs seconds —
// a bassline also doesn't move nearly as fast as a vocal line, so ~46ms
// resolution is a fine trade for keeping "Analyzing..." from taking forever.
const HOP_SIZE = 2048;

export function trackBassLine(channelData: Float32Array, sampleRate: number): BassNote[] {
  const filtered = lowpassFilter(channelData, sampleRate, BASS_LOWPASS_HZ);
  const frames = trackPitch(filtered, sampleRate, FRAME_SIZE, HOP_SIZE, BASS_MIN_HZ, BASS_MAX_HZ);
  return frames.map((f) => ({ timeSec: f.timeSec, frequencyHz: f.confidence >= 0.5 ? f.frequencyHz : null }));
}
