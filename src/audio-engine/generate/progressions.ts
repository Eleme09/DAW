import { SCALE_INTERVALS } from "../pitch/noteUtils";
import type { ChordEvent } from "@/types/beatGen";
import type { ScaleName } from "@/types/pitch";

/**
 * Chord progressions as scale-degree index sequences (0-6), not hardcoded
 * note names — the same progression works in any key/scale because degree
 * indices are relative. Triad quality is derived from the scale's own
 * interval structure (stack thirds at scale degrees d, d+2, d+4), not
 * hardcoded per-degree either — that's genuinely how diatonic harmony
 * works, not a shortcut. A short, deliberately small library of common
 * progressions (not an attempt at exhaustive coverage) picked because
 * they're genuinely idiomatic for trap/hip-hop and pop, matching the
 * project's genre focus.
 */

const MINOR_PROGRESSIONS: number[][] = [
  [0, 5, 2, 6], // i - VI - III - VII
  [0, 3, 4, 0], // i - iv - v - i
  [0, 6, 5, 6], // i - VII - VI - VII
];

const MAJOR_PROGRESSIONS: number[][] = [
  [0, 4, 5, 3], // I - V - vi - IV
  [0, 3, 4, 0], // I - IV - V - I
  [5, 3, 0, 4], // vi - IV - I - V
];

export function pickProgression(scale: ScaleName, seed: number): number[] {
  const table = scale === "major" ? MAJOR_PROGRESSIONS : MINOR_PROGRESSIONS;
  return table[Math.abs(seed) % table.length];
}

/** Builds the diatonic triad at scale degree `degreeIndex`, rooted at MIDI `rootOctaveMidi` + the key's pitch class. */
export function diatonicTriad(
  degreeIndex: number,
  key: number,
  scale: ScaleName,
  octaveMidi: number
): ChordEvent["notesMidi"] {
  const intervals = SCALE_INTERVALS[scale];
  const degreeMidi = (d: number) => {
    const octaveShift = Math.floor(d / intervals.length);
    const interval = intervals[((d % intervals.length) + intervals.length) % intervals.length];
    return octaveMidi + key + interval + 12 * octaveShift;
  };
  const root = degreeMidi(degreeIndex);
  const third = degreeMidi(degreeIndex + 2);
  const fifth = degreeMidi(degreeIndex + 4);
  return [root, third, fifth];
}

export function triadQuality(notes: ChordEvent["notesMidi"]): ChordEvent["quality"] {
  const [root, third, fifth] = notes;
  const rootThird = third - root;
  const thirdFifth = fifth - third;
  if (rootThird === 4 && thirdFifth === 3) return "major";
  if (rootThird === 3 && thirdFifth === 4) return "minor";
  if (rootThird === 3 && thirdFifth === 3) return "diminished";
  if (rootThird === 4 && thirdFifth === 4) return "augmented";
  // Any other stack (shouldn't occur for natural major/minor scales) — call it major as a safe default.
  return "major";
}

export function buildChordEvents(
  progressionDegrees: number[],
  key: number,
  scale: ScaleName,
  bars: number,
  octaveMidi = 48
): ChordEvent[] {
  const barsPerChord = bars / progressionDegrees.length;
  const beatsPerChord = barsPerChord * 4; // 4/4 assumed, see types/beatGen.ts

  return progressionDegrees.map((degree, i) => {
    const notesMidi = diatonicTriad(degree, key, scale, octaveMidi);
    return {
      notesMidi,
      quality: triadQuality(notesMidi),
      startBeat: i * beatsPerChord,
      lengthBeats: beatsPerChord,
    };
  });
}
