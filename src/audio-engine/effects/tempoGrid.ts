/**
 * Standard musical note divisions relative to a quarter-note beat (the
 * same convention every delay/tempo-sync plugin uses). `beats` is how
 * many quarter-note beats the division spans.
 */
export interface TempoDivision {
  label: string;
  beats: number;
}

export const TEMPO_DIVISIONS: TempoDivision[] = [
  { label: "1/1", beats: 4 },
  { label: "1/2.", beats: 3 },
  { label: "1/2", beats: 2 },
  { label: "1/4.", beats: 1.5 },
  { label: "1/4", beats: 1 },
  { label: "1/4T", beats: 2 / 3 },
  { label: "1/8.", beats: 0.75 },
  { label: "1/8", beats: 0.5 },
  { label: "1/8T", beats: 1 / 3 },
  { label: "1/16", beats: 0.25 },
  { label: "1/16T", beats: 1 / 6 },
];

export function divisionToMs(beats: number, bpm: number): number {
  return beats * (60000 / bpm);
}

export function msToClosestDivision(ms: number, bpm: number): { division: TempoDivision; ms: number; diffMs: number } {
  let best = TEMPO_DIVISIONS[0];
  let bestDiffMs = Infinity;
  for (const division of TEMPO_DIVISIONS) {
    const divisionMs = divisionToMs(division.beats, bpm);
    const diffMs = Math.abs(divisionMs - ms);
    if (diffMs < bestDiffMs) {
      bestDiffMs = diffMs;
      best = division;
    }
  }
  return { division: best, ms: divisionToMs(best.beats, bpm), diffMs: bestDiffMs };
}
