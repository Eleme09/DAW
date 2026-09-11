import type { DetectedKeyResult } from "./pitch";

export interface VocalBeatMatchResult {
  vocalKey: DetectedKeyResult;
  beatKey: DetectedKeyResult;
  compatible: boolean;
  message: string;
  /** Pitch classes (0-11) the vocal actually sang that fall outside the beat's key/scale. */
  notesOutsideScale: number[];
}
