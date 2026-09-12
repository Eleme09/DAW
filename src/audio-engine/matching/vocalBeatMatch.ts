import { computeChromagram, sumChroma } from "../beat/chromagram";
import { detectKeyFromChroma } from "../pitch/keyDetection";
import { frequencyToMidi, pitchClass, SCALE_INTERVALS } from "../pitch/noteUtils";
import { NOTE_NAMES, type DetectedKeyResult, type PitchFrame } from "@/types/pitch";
import type { VocalBeatMatchResult } from "@/types/match";

/**
 * Wires together two pieces that already exist rather than adding new
 * detection: Phase 6's chromagram + the shared key detector for the beat's
 * key, Phase 5's pitch track for the vocal's. Just comparison logic — see
 * AI_FEATURES.md.
 */
export function detectBeatKey(channelData: Float32Array, sampleRate: number): DetectedKeyResult {
  return detectKeyFromChroma(sumChroma(computeChromagram(channelData, sampleRate)));
}

function isRelativeKey(a: DetectedKeyResult, b: DetectedKeyResult): boolean {
  if (a.scale === b.scale) return false;
  if (a.scale === "major" && b.scale === "minor") return ((((a.key - 3) % 12) + 12) % 12) === b.key;
  if (a.scale === "minor" && b.scale === "major") return ((((b.key - 3) % 12) + 12) % 12) === a.key;
  return false;
}

function keyLabel(key: DetectedKeyResult): string {
  return `${NOTE_NAMES[key.key]} ${key.scale}`;
}

/**
 * Compatible means "same key" or "relative major/minor" (e.g. C major and
 * A minor share every note — a vocal in one over a beat in the other is
 * completely normal, not a mismatch). No music-theory essay in the
 * message, per the brief — just what's useful for recording.
 */
export function matchVocalToBeat(
  vocalFrames: PitchFrame[],
  vocalKey: DetectedKeyResult,
  beatKey: DetectedKeyResult
): VocalBeatMatchResult {
  const sameKey = vocalKey.key === beatKey.key && vocalKey.scale === beatKey.scale;
  const compatible = sameKey || isRelativeKey(vocalKey, beatKey);

  const vocalName = keyLabel(vocalKey);
  const beatName = keyLabel(beatKey);
  const message = compatible
    ? `Your vocal (${vocalName}) matches the beat (${beatName}).`
    : `The beat appears to be ${beatName}, while the vocal is centered around ${vocalName}.`;

  const beatScaleName = beatKey.scale === "minor" ? "naturalMinor" : "major";
  const beatPitchClasses = new Set(SCALE_INTERVALS[beatScaleName].map((interval) => (interval + beatKey.key) % 12));

  const sungPitchClasses = new Set<number>();
  for (const frame of vocalFrames) {
    if (frame.frequencyHz === null || frame.confidence < 0.5) continue;
    sungPitchClasses.add(pitchClass(frequencyToMidi(frame.frequencyHz)));
  }

  const notesOutsideScale = Array.from(sungPitchClasses)
    .filter((pc) => !beatPitchClasses.has(pc))
    .sort((a, b) => a - b);

  return { vocalKey, beatKey, compatible, message, notesOutsideScale };
}

export interface VocalTreatmentSuggestion {
  levelDeltaDb: number;
  vocalRmsDb: number;
  beatRmsDb: number;
  beatBpm: number;
  beatTempoConfidence: number;
  /** Eighth-note delay time at the beat's detected tempo, ms. */
  suggestedDelayMs: number;
}

/** A vocal-forward level target relative to the beat's own loudness - an
 * explicit named starting point (not a universal rule), same spirit as the
 * mastering targets in masteringTargets.ts: a stated number, not a black box. */
const TARGET_VOCAL_OVER_BEAT_DB = 4;

/**
 * "Space" here means rhythmic glue, not a (currently infeasible without
 * source separation) estimate of the beat's own reverb send - a delay
 * synced to the beat's tempo is a standard, honest technique for making a
 * vocal feel like it belongs to a specific track instead of an arbitrary
 * fixed delay time.
 */
export function suggestVocalTreatment(
  vocalDynamics: { rmsDb: number },
  beatDynamics: { rmsDb: number },
  beatTempo: { bpm: number; confidence: number }
): VocalTreatmentSuggestion {
  return {
    levelDeltaDb: beatDynamics.rmsDb + TARGET_VOCAL_OVER_BEAT_DB - vocalDynamics.rmsDb,
    vocalRmsDb: vocalDynamics.rmsDb,
    beatRmsDb: beatDynamics.rmsDb,
    beatBpm: beatTempo.bpm,
    beatTempoConfidence: beatTempo.confidence,
    suggestedDelayMs: 60000 / beatTempo.bpm / 2,
  };
}
