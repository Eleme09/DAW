import type { EqBand, ReverbParams, SaturationParams } from "./effects";
import type { TrackId } from "./project";
import type { Severity } from "./analysis";

/**
 * Phase 13 (part 2) — natural-language AI Music Assistant. The assistant
 * only ever *proposes* actions from this fixed, typed vocabulary; nothing
 * here can express an arbitrary mutation. Same "AI proposes, DSP
 * executes" principle as every other AI feature in this project — an LLM
 * response is untrusted input, parsed into one of these known shapes
 * (see lib/ai/assistantTools.ts) before it's ever allowed near project
 * state, and even then it's shown to the user for review, never
 * auto-applied.
 */
export type AssistantAction =
  | { kind: "setTrackVolume"; trackId: TrackId; volumeDb: number }
  | { kind: "setTrackPan"; trackId: TrackId; pan: number }
  | { kind: "setTrackMute"; trackId: TrackId; muted: boolean }
  | { kind: "setTrackSolo"; trackId: TrackId; solo: boolean }
  | { kind: "addEqBand"; trackId: TrackId; eqType: EqBand["type"]; freq: number; gainDb: number; q: number }
  | {
      kind: "setCompressor";
      trackId: TrackId;
      thresholdDb: number;
      ratio: number;
      attackMs: number;
      releaseMs: number;
      makeupDb: number;
    }
  | { kind: "setReverb"; trackId: TrackId; mix: number; decaySec: number; sizeType: ReverbParams["sizeType"] }
  | { kind: "setDelay"; trackId: TrackId; timeMs: number; feedback: number; mix: number }
  | { kind: "setSaturation"; trackId: TrackId; driveDb: number; mix: number; tone: SaturationParams["tone"] };

export type AssistantActionKind = AssistantAction["kind"];

/** An action the assistant proposed, plus a human-readable summary — ready for the UI to list and let the user apply (or not). */
export interface AssistantProposedAction {
  id: string;
  action: AssistantAction;
  description: string;
}

export interface AssistantTurnResult {
  /** false when ANTHROPIC_API_KEY isn't set server-side — the UI must degrade gracefully, not fail unclearly (AI_FEATURES.md principle 1). */
  configured: boolean;
  reply: string;
  proposedActions: AssistantProposedAction[];
  errorMessage?: string;
}

export interface AssistantTrackSummary {
  id: TrackId;
  name: string;
}

/** A condensed version of MixAnalysisResult (see types/mixAnalysis.ts) sent
 * to the assistant so its reply is grounded in the actual measured mix
 * instead of generic advice - the AI Mix panel's real DSP analysis, read
 * out in natural language rather than a second, separate "AI opinion". */
export interface AssistantMixSummary {
  lowEnd: Severity;
  mud: Severity;
  harshness: Severity;
  sibilance: Severity;
  peakDb: number;
  rmsDb: number;
  integratedLufs: number;
  masking: { trackAName: string; trackBName: string; band: string; freqHz: number }[];
  gainStaging: { trackName: string; deltaFromMedianDb: number; direction: "louder" | "quieter" }[];
}

/** Minimal project context sent with each command — just enough for the assistant to reference tracks by id. */
export interface AssistantContext {
  bpm: number;
  tracks: AssistantTrackSummary[];
  /** Present only when called from the AI Mix panel, after analysis has run. */
  mix?: AssistantMixSummary;
}
