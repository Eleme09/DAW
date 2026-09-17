import { frequencyToMidi, midiToFrequency } from "./noteUtils";
import { psolaShift } from "./psola";
import type { CorrectionFrame } from "./correctionCurve";
import { trackPitch } from "./pitchDetection";
import type { PitchFrame } from "@/types/pitch";

/**
 * Brief mode 8, "Doblaje": duplicates a take with micro-variations of
 * pitch and timing, the classic "double-tracking" trick of singing the
 * same line twice and layering both - here approximated from a single
 * take rather than an actual second performance, same trade-off as any
 * DAW's "quick double" feature.
 *
 * Pitch: a slow, smoothed random walk (same shape as correctionCurve.ts's
 * humanize wobble) centered on the ORIGINAL detected pitch, not snapped to
 * any scale - a double should still be the same melody, just not
 * perfectly identical in cents from the source, like two human takes of
 * the same line never landing on exactly the same pitch. `detuneCents`
 * bounds how far the walk can wander.
 *
 * Timing: NOT handled here - a genuine timing micro-variation needs
 * either warping within the render (a bigger undertaking than this
 * function's scope) or, cheaply and honestly, offsetting where the
 * rendered clip is placed on the timeline. The caller (PitchStudioPanel)
 * does the latter: a few random milliseconds added to the new clip's
 * startTime, not faked here as if it were part of the pitch algorithm.
 */
const WALK_STEP = 0.08;
const WALK_DECAY = 0.9;
const VOICED_CONFIDENCE_MIN = 0.5;

export function buildDoubleCurve(
  frames: PitchFrame[],
  detuneCents: number,
  random: () => number = Math.random
): CorrectionFrame[] {
  let walk = 0;
  return frames.map((frame) => {
    if (frame.frequencyHz === null || frame.confidence < VOICED_CONFIDENCE_MIN) {
      walk = 0; // fresh wander next voiced run, same reasoning as humanize's reset
      return { timeSec: frame.timeSec, detectedFrequencyHz: frame.frequencyHz, targetFrequencyHz: null };
    }
    const step = (random() * 2 - 1) * WALK_STEP;
    walk = Math.max(-1, Math.min(1, walk * WALK_DECAY + step));
    const detectedMidi = frequencyToMidi(frame.frequencyHz);
    const targetMidi = detectedMidi + (walk * detuneCents) / 100;
    return { timeSec: frame.timeSec, detectedFrequencyHz: frame.frequencyHz, targetFrequencyHz: midiToFrequency(targetMidi) };
  });
}

export function doubleChannel(
  channelData: Float32Array,
  sampleRate: number,
  detuneCents: number,
  frames?: PitchFrame[],
  random: () => number = Math.random
): Float32Array {
  const pitchFrames = frames ?? trackPitch(channelData, sampleRate);
  const curve = buildDoubleCurve(pitchFrames, detuneCents, random);
  return psolaShift(channelData, sampleRate, curve);
}

export function doubleBuffer(
  channels: Float32Array[],
  sampleRate: number,
  detuneCents: number,
  random: () => number = Math.random
): Float32Array[] {
  return channels.map((channel) => doubleChannel(channel, sampleRate, detuneCents, undefined, random));
}
