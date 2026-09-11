import type { DetectedKeyResult } from "./pitch";

export interface TempoResult {
  bpm: number;
  /** Correlation strength at the winning lag, 0..1-ish — not a calibrated probability. */
  confidence: number;
}

export interface OnsetEvent {
  timeSec: number;
  strength: number; // relative onset strength, for filtering/visualization
}

export type DrumHitType = "kick" | "snare" | "hihat" | "other";

export interface DrumHit {
  timeSec: number;
  type: DrumHitType;
  confidence: number;
}

export interface BassNote {
  timeSec: number;
  frequencyHz: number | null;
}

export interface ChordSegment {
  startSec: number;
  endSec: number;
  /** Pitch class 0-11. */
  root: number;
  quality: "major" | "minor";
  confidence: number;
}

export interface SectionBoundary {
  timeSec: number;
  /** Coarse relative-energy read, not a true verse/chorus/etc. semantic label. */
  energyLevel: "low" | "medium" | "high";
}

export interface BeatAnalysisResult {
  tempo: TempoResult;
  key: DetectedKeyResult;
  bassLine: BassNote[];
  chords: ChordSegment[];
  drumHits: DrumHit[];
  sections: SectionBoundary[];
  durationSec: number;
}
