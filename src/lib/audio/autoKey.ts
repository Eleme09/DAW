import { trackPitch } from "@/audio-engine/pitch/pitchDetection";
import { detectKey } from "@/audio-engine/pitch/keyDetection";
import { ensureSampleLoaded } from "./sampleLoader";
import type { DetectedKeyResult, PitchFrame } from "@/types/pitch";
import type { Track } from "@/types/project";

/** Analysis cap: two minutes of a track is plenty to tell its key. */
const MAX_SECONDS = 120;
const SLICE_SECONDS = 8;

/**
 * BandLab's "AutoKey" ("Detectar automáticamente la clave"): the key of what
 * is recorded on the track, from its audible regions - pitch tracking (YIN)
 * plus Krumhansl-Kessler key profiles, the same analysis the rest of the app
 * uses. Works in slices and yields between them so the UI keeps responding;
 * `signal` cancels it. Null when the track has no pitched audio.
 */
export async function detectTrackKey(track: Track, signal?: AbortSignal): Promise<DetectedKeyResult | null> {
  const frames: PitchFrame[] = [];
  let budget = MAX_SECONDS;
  for (const clip of track.clips) {
    if (clip.muted || budget <= 0) continue;
    const buffer = await ensureSampleLoaded(clip.sampleId);
    if (signal?.aborted) return null;
    if (!buffer) continue;
    const sr = buffer.sampleRate;
    const data = buffer.getChannelData(0);
    const from = Math.floor(clip.sourceOffset * sr);
    const to = Math.min(data.length, from + Math.floor(Math.min(clip.duration, budget) * sr));
    budget -= (to - from) / sr;
    for (let start = from; start < to; start += SLICE_SECONDS * sr) {
      const end = Math.min(to, start + SLICE_SECONDS * sr);
      frames.push(...trackPitch(data.subarray(start, end), sr));
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (signal?.aborted) return null;
    }
  }
  const voiced = frames.filter((f) => f.frequencyHz !== null && f.confidence > 0.5);
  if (voiced.length < 20) return null;
  return detectKey(frames);
}
