export type Severity = "low" | "medium" | "high";

export interface VocalAnalysisResult {
  /** Overall noise floor level, from the quietest ~10% of the recording. */
  noise: Severity;
  /** Excess low-frequency energy (subBass+bass) relative to the recording's own average. */
  lowEnd: Severity;
  /** Excess 250-500Hz — boxiness/mud. */
  mud: Severity;
  /** Excess 2-4kHz — harsh upper mids. */
  harshness: Severity;
  /** Excess 5-9kHz — sibilance. */
  sibilance: Severity;
  /** How inconsistent the level is across the recording (dynamic range). */
  dynamics: "controlled" | "uncontrolled";
  /** Honest callouts for things DSP can't fix — see PROJECT_SPEC.md. */
  limitations: string[];
  /** Raw numbers behind the categorical read, for anyone who wants them. */
  metrics: {
    peakDb: number;
    rmsDb: number;
    noiseFloorDb: number;
    dynamicRangeDb: number;
    clippedSampleRatio: number;
    lowEndRelativeDb: number;
    mudRelativeDb: number;
    harshnessRelativeDb: number;
    sibilanceRelativeDb: number;
  };
}
