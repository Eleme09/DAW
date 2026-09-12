/** Musical grid math shared by the ruler (bar:beat labels) and clip
 * drag/trim (snap-to-grid) — kept independent of BPM/time-signature UI so
 * both stay perfectly in sync with the same definition of "a beat". */

export type GridResolution = "off" | "1/4" | "1/8" | "1/16" | "1/32" | "1/8t" | "1/16t";

export const GRID_RESOLUTIONS: GridResolution[] = ["off", "1/4", "1/8", "1/16", "1/32", "1/8t", "1/16t"];

/** BPM is quarter-notes-per-minute regardless of time signature denominator
 * (the standard DAW convention) - a "beat" for grid/ruler purposes is one
 * unit of the signature's denominator (e.g. an eighth note in 6/8). */
export function beatSeconds(bpm: number, timeSignatureDen: number): number {
  return (60 / bpm) * (4 / timeSignatureDen);
}

export function barSeconds(bpm: number, timeSignature: [number, number]): number {
  return beatSeconds(bpm, timeSignature[1]) * timeSignature[0];
}

export function gridStepSeconds(bpm: number, timeSignature: [number, number], resolution: GridResolution): number | null {
  if (resolution === "off") return null;
  const beat = beatSeconds(bpm, timeSignature[1]);
  switch (resolution) {
    case "1/4":
      return beat;
    case "1/8":
      return beat / 2;
    case "1/16":
      return beat / 4;
    case "1/32":
      return beat / 8;
    case "1/8t":
      return (beat * 2) / 3;
    case "1/16t":
      return beat / 3;
  }
}

export function snapToGrid(
  seconds: number,
  bpm: number,
  timeSignature: [number, number],
  resolution: GridResolution
): number {
  const step = gridStepSeconds(bpm, timeSignature, resolution);
  if (!step) return seconds;
  return Math.round(seconds / step) * step;
}

/** 1-based bar and beat-within-bar for a ruler label, e.g. bar 2 beat 3 in
 * 4/4 -> { bar: 2, beat: 3 }. */
export function secondsToBarBeat(seconds: number, bpm: number, timeSignature: [number, number]): { bar: number; beat: number } {
  const beat = beatSeconds(bpm, timeSignature[1]);
  const totalBeats = seconds / beat;
  const beatsPerBar = timeSignature[0];
  const bar = Math.floor(totalBeats / beatsPerBar) + 1;
  const beatInBar = Math.floor(totalBeats % beatsPerBar) + 1;
  return { bar, beat: beatInBar };
}
