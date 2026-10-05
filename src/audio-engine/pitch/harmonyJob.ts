import { trackPitchFast, type FastTrackHooks } from "./fastPitchTrack";
import { detectKey } from "./keyDetection";
import { harmonizeChannel } from "./harmonize";
import type { PitchFrame, ScaleName } from "@/types/pitch";

/**
 * The pure compute behind BandLab-style "Armonizar", split from the UI and
 * from storage so it can run in a Web Worker (see clipWorker.ts) and be
 * unit-tested in Node. Two steps, both cancellable and reporting progress:
 *
 *  - `analyzeMelody`: pitch track + the region's key (done ONCE; its frames
 *    are handed to `renderHarmonyChannels` so the audio isn't analysed twice)
 *  - `renderHarmonyChannels`: one resynthesised voice per requested interval
 */

export interface MelodyAnalysis {
  frames: PitchFrame[];
  key: number;
  scale: ScaleName;
  /** False when there was no clear melody - the caller asks for the key. */
  detected: boolean;
}

const MIN_VOICED_FRAMES = 10;

export function analyzeMelody(mono: Float32Array, sampleRate: number, hooks: FastTrackHooks = {}): MelodyAnalysis {
  const frames = trackPitchFast(mono, sampleRate, hooks);
  const voiced = frames.filter((f) => f.frequencyHz !== null && f.confidence >= 0.5).length;
  if (voiced < MIN_VOICED_FRAMES) return { frames, key: 0, scale: "major", detected: false };
  const result = detectKey(frames);
  return { frames, key: result.key, scale: result.scale === "minor" ? "naturalMinor" : "major", detected: true };
}

/** Per-voice "Humanizar" values: alternating sharp/flat by a few cents and a
 * growing few-ms delay, so a stack of voices doesn't read as one cloned voice. */
export function humanizeSettings(voiceIndex: number): { cents: number; delayMs: number } {
  return { cents: (voiceIndex % 2 === 0 ? 1 : -1) * (6 + 3 * voiceIndex), delayMs: 12 + 7 * voiceIndex };
}

export interface RenderHooks {
  /** 0..1 over all voices. */
  onProgress?: (fraction: number) => void;
  shouldCancel?: () => boolean;
}

/** Returns one Float32Array per entry of `steps` (diatonic degrees from the
 * melody: +2 = third up, -4 = fifth down, +7 = octave up...), or fewer if
 * cancelled. */
export function renderHarmonyChannels(
  mono: Float32Array,
  sampleRate: number,
  key: number,
  scale: ScaleName,
  frames: PitchFrame[],
  steps: number[],
  humanize: boolean,
  hooks: RenderHooks = {}
): Float32Array[] {
  const out: Float32Array[] = [];
  for (let v = 0; v < steps.length; v++) {
    if (hooks.shouldCancel?.()) return out;
    const { cents, delayMs } = humanize ? humanizeSettings(v) : { cents: 0, delayMs: 0 };
    let harmony = harmonizeChannel(mono, sampleRate, key, scale, steps[v], frames, cents);
    if (humanize) {
      const delaySamples = Math.round((delayMs / 1000) * sampleRate);
      const delayed = new Float32Array(harmony.length);
      delayed.set(harmony.subarray(0, Math.max(0, harmony.length - delaySamples)), delaySamples);
      harmony = delayed;
    }
    out.push(harmony);
    hooks.onProgress?.((v + 1) / steps.length);
  }
  return out;
}
