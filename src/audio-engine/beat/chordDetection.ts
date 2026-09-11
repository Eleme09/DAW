import type { ChordSegment } from "@/types/beat";
import type { ChromaFrame } from "./chromagram";

/**
 * Chord-per-segment estimation via chroma template matching (24 templates:
 * major/minor triads rooted on each of 12 pitch classes), cosine-similarity
 * scored. A real, standard MIR technique — but only triads, only fixed-
 * length segments (not beat-synced), and not chord-sequence-aware (each
 * segment is scored independently, no smoothing/HMM across segments). This
 * is a heuristic estimate, not professional chord recognition — surfaced
 * with a confidence per segment rather than presented as certain.
 */

const MAJOR_TRIAD = [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0];
const MINOR_TRIAD = [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0];

function rotate(template: number[], root: number): number[] {
  const rotated = new Array(12);
  for (let pc = 0; pc < 12; pc++) rotated[pc] = template[(((pc - root) % 12) + 12) % 12];
  return rotated;
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function cosineSimilarity(a: number[], b: number[]): number {
  const denom = Math.sqrt(dot(a, a)) * Math.sqrt(dot(b, b));
  return denom > 0 ? dot(a, b) / denom : 0;
}

export function matchChord(chroma: number[]): { root: number; quality: "major" | "minor"; confidence: number } {
  let best: { root: number; quality: "major" | "minor"; confidence: number } = {
    root: 0,
    quality: "major",
    confidence: -Infinity,
  };
  for (let root = 0; root < 12; root++) {
    const majorScore = cosineSimilarity(chroma, rotate(MAJOR_TRIAD, root));
    const minorScore = cosineSimilarity(chroma, rotate(MINOR_TRIAD, root));
    if (majorScore > best.confidence) best = { root, quality: "major", confidence: majorScore };
    if (minorScore > best.confidence) best = { root, quality: "minor", confidence: minorScore };
  }
  return best;
}

export function detectChordSegments(frames: ChromaFrame[], durationSec: number, segmentSec = 1): ChordSegment[] {
  const segments: ChordSegment[] = [];
  for (let t = 0; t < durationSec; t += segmentSec) {
    const endSec = Math.min(durationSec, t + segmentSec);
    const segFrames = frames.filter((f) => f.timeSec >= t && f.timeSec < endSec);
    if (segFrames.length === 0) continue;

    const chroma = new Array(12).fill(0);
    for (const f of segFrames) {
      for (let i = 0; i < 12; i++) chroma[i] += f.chroma[i];
    }

    const { root, quality, confidence } = matchChord(chroma);
    segments.push({ startSec: t, endSec, root, quality, confidence });
  }
  return segments;
}
