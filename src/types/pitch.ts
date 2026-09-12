export interface PitchFrame {
  timeSec: number;
  /** null = unvoiced or no confident pitch found in this frame. */
  frequencyHz: number | null;
  confidence: number;
}

export type ScaleName = "major" | "naturalMinor" | "chromatic";

export type PitchMode = "natural" | "hardTune" | "modernTrap" | "extreme";

export interface PitchCorrectionSettings {
  /** Pitch class 0=C .. 11=B. Ignored when scale is "chromatic". */
  key: number;
  scale: ScaleName;
  /** Time (ms) to glide to the target pitch. ~0 = instant hard-tune snap. */
  retuneSpeedMs: number;
  /** 0..1 — adds subtle pseudo-random pitch variation so a hard snap doesn't sound perfectly robotic. */
  humanizeAmount: number;
  mode: PitchMode;
}

export interface DetectedKeyResult {
  key: number; // pitch class 0-11
  scale: "major" | "minor";
  confidence: number;
}

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export const PITCH_MODE_PRESETS: Record<PitchMode, { retuneSpeedMs: number; humanizeAmount: number }> = {
  natural: { retuneSpeedMs: 120, humanizeAmount: 0.4 },
  hardTune: { retuneSpeedMs: 15, humanizeAmount: 0.1 },
  modernTrap: { retuneSpeedMs: 5, humanizeAmount: 0.05 },
  extreme: { retuneSpeedMs: 0, humanizeAmount: 0 },
};
