import type { ScaleName } from "./pitch";

/**
 * Phase 11 (Beat Generator) shared shapes. Generation is deterministic and
 * rule-based (a fixed library of progressions/patterns plus a seeded PRNG
 * for controlled variation, never a trained model) — same principle-3
 * reasoning as every other "AI" feature in this project. Everything here
 * assumes 4/4 time; a project in another time signature can still
 * generate over it, the result just won't respect that meter — a real,
 * named limitation, not silently wrong.
 */

export type GenGenre = "trap" | "boomBap" | "dance" | "halfTime";
export type GenMood = "dark" | "bright" | "chill" | "aggressive";

export interface GenerateBeatOptions {
  bpm: number;
  /** Pitch class 0=C .. 11=B. */
  key: number;
  scale: ScaleName;
  genre: GenGenre;
  mood: GenMood;
  /** Total bars to generate. Must be a multiple of the chosen progression's chord count. */
  bars?: number;
  /** Seeds the PRNG driving hihat rolls/pattern variation — same seed, same output. */
  seed?: number;
}

export interface ChordEvent {
  /** MIDI note numbers for the stacked triad (root, third, fifth). */
  notesMidi: [number, number, number];
  quality: "major" | "minor" | "diminished" | "augmented";
  startBeat: number;
  lengthBeats: number;
}

export type DrumHitType = "kick" | "snare" | "hihat" | "openhat";

export interface DrumHitEvent {
  type: DrumHitType;
  startBeat: number;
  velocity: number; // 0..1
}

export interface BassNoteEvent {
  midi: number;
  startBeat: number;
  lengthBeats: number;
  velocity: number;
}

export interface MelodyNoteEvent {
  midi: number;
  startBeat: number;
  lengthBeats: number;
  velocity: number;
}

export interface GeneratedBeat {
  bpm: number;
  key: number;
  scale: ScaleName;
  genre: GenGenre;
  mood: GenMood;
  bars: number;
  /** Scale-degree indices (0-6) making up the chosen progression, one per chord. */
  progressionDegrees: number[];
  chords: ChordEvent[];
  drums: DrumHitEvent[];
  bass: BassNoteEvent[];
  melody: MelodyNoteEvent[];
}
