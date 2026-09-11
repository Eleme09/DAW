import { frequencyToMidi, pitchClass } from "./noteUtils";
import type { DetectedKeyResult, PitchFrame } from "@/types/pitch";

/**
 * Krumhansl-Kessler key-finding: build a confidence-weighted chroma
 * histogram from the pitch track, correlate it against the standard major/
 * minor key profiles rotated to each of the 12 possible tonics, pick the
 * best match. A well-established MIR technique, not something invented for
 * this project — but still a statistical best guess, hence `confidence` is
 * surfaced rather than presenting the result as certain.
 */

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export function buildChromaHistogram(frames: PitchFrame[]): number[] {
  const chroma = new Array(12).fill(0);
  for (const f of frames) {
    if (f.frequencyHz === null) continue;
    chroma[pitchClass(frequencyToMidi(f.frequencyHz))] += f.confidence;
  }
  return chroma;
}

function rotateProfile(profile: number[], key: number): number[] {
  const rotated = new Array(12);
  for (let pc = 0; pc < 12; pc++) rotated[pc] = profile[(((pc - key) % 12) + 12) % 12];
  return rotated;
}

function correlate(a: number[], b: number[]): number {
  const meanA = a.reduce((s, v) => s + v, 0) / a.length;
  const meanB = b.reduce((s, v) => s + v, 0) / b.length;
  let num = 0;
  let denomA = 0;
  let denomB = 0;
  for (let i = 0; i < a.length; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denomA += da * da;
    denomB += db * db;
  }
  const denom = Math.sqrt(denomA * denomB);
  return denom > 0 ? num / denom : 0;
}

export function detectKeyFromChroma(chroma: number[]): DetectedKeyResult {
  let best: DetectedKeyResult = { key: 0, scale: "major", confidence: 0 };
  let bestScore = -Infinity;
  for (let key = 0; key < 12; key++) {
    const majorScore = correlate(chroma, rotateProfile(MAJOR_PROFILE, key));
    const minorScore = correlate(chroma, rotateProfile(MINOR_PROFILE, key));
    if (majorScore > bestScore) {
      bestScore = majorScore;
      best = { key, scale: "major", confidence: majorScore };
    }
    if (minorScore > bestScore) {
      bestScore = minorScore;
      best = { key, scale: "minor", confidence: minorScore };
    }
  }
  return best;
}

export function detectKey(frames: PitchFrame[]): DetectedKeyResult {
  return detectKeyFromChroma(buildChromaHistogram(frames));
}
