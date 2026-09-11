import type { ScaleName } from "@/types/pitch";

export function frequencyToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function pitchClass(midi: number): number {
  return (((Math.round(midi) % 12) + 12) % 12) as number;
}

export const SCALE_INTERVALS: Record<ScaleName, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  naturalMinor: [0, 2, 3, 5, 7, 8, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

/** Nearest scale-degree MIDI note to `midi`, searching +/- one octave. */
export function nearestScaleMidi(midi: number, key: number, scale: ScaleName): number {
  const intervals = SCALE_INTERVALS[scale];
  const rounded = Math.round(midi);
  let best = rounded;
  let bestDist = Infinity;
  for (let candidate = rounded - 12; candidate <= rounded + 12; candidate++) {
    const pc = (((candidate - key) % 12) + 12) % 12;
    if (!intervals.includes(pc)) continue;
    const dist = Math.abs(candidate - midi);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}

export function nearestScaleFrequency(freq: number, key: number, scale: ScaleName): number {
  return midiToFrequency(nearestScaleMidi(frequencyToMidi(freq), key, scale));
}
