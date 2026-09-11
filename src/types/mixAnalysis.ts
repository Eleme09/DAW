import type { EffectInstance } from "./effects";
import type { Severity } from "./analysis";
import type { TrackId } from "./project";

/**
 * Phase 10 (AI Mix Assistant) shared shapes. See
 * `src/audio-engine/analysis/mixDiagnostics.ts` (pure detection logic,
 * unit-tested), `mixSuggestions.ts` (pure suggestion generation, unit-
 * tested), and `mixAnalysis.ts` (the OfflineAudioContext-dependent glue
 * that renders the project and calls both — not unit-tested, verified via
 * Playwright instead, same split as `audio-engine/bounce.ts`).
 */

/** One track's measured contribution to the mix, rendered in isolation. */
export interface TrackBandProfile {
  trackId: TrackId;
  trackName: string;
  /** RMS level of this track's own rendered output. -Infinity if silent (or fully muted). */
  rmsDb: number;
  /**
   * Fraction of this track's own spectral power falling in each
   * spectralAnalysis.ts VOCAL_BANDS band. Not required to sum to 1 (the
   * bands overlap by design — see spectralAnalysis.ts). Null when the
   * track produced no audio to analyze.
   */
  bandShares: Record<string, number> | null;
}

/** Two tracks whose energy concentrates in the same frequency band — a real risk of masking. */
export interface MaskingFinding {
  trackAId: TrackId;
  trackAName: string;
  trackBId: TrackId;
  trackBName: string;
  band: string;
  freqHz: number;
  /** min(shareA, shareB) for the contested band — how strongly both compete there, 0..1. */
  overlapScore: number;
}

/** A track whose level sits well away from the session's typical track level. */
export interface GainStagingFinding {
  trackId: TrackId;
  trackName: string;
  rmsDb: number;
  /** rmsDb minus the session's median track rmsDb. Positive = louder than typical. */
  deltaFromMedianDb: number;
  direction: "louder" | "quieter";
}

interface MixSuggestionBase {
  id: string;
  trackId: TrackId;
  trackName: string;
  reason: string;
}

/** A single-band EQ cut, ready to append to a track's insert chain. Never applied automatically. */
export interface EqCutSuggestion extends MixSuggestionBase {
  kind: "eqCut";
  band: string;
  freqHz: number;
  effect: EffectInstance;
  /** The other track in the masking pair this suggestion addresses — for UI grouping. */
  pairedWithTrackId: TrackId;
}

/** A volume trim, applied as track.volumeDb + deltaDb. Never applied automatically. */
export interface GainTrimSuggestion extends MixSuggestionBase {
  kind: "gainTrim";
  deltaDb: number;
}

export type MixSuggestion = EqCutSuggestion | GainTrimSuggestion;

export interface MixAnalysisResult {
  /** Read of the actual summed/rendered mix, reusing Phase 4's categorical vocal-analysis logic. */
  mix: {
    mud: Severity;
    harshness: Severity;
    sibilance: Severity;
    lowEnd: Severity;
    dynamicRangeDb: number;
    peakDb: number;
    rmsDb: number;
  };
  tracks: TrackBandProfile[];
  masking: MaskingFinding[];
  gainStaging: GainStagingFinding[];
  suggestions: MixSuggestion[];
  limitations: string[];
}
