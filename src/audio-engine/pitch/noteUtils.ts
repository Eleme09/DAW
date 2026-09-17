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

/**
 * Moves a note `steps` scale degrees up (or down, for negative `steps`)
 * within `key`/`scale`, first snapping it onto the scale if it isn't
 * already on it - this is diatonic transposition ("a third up within the
 * key"), not a fixed chromatic interval: a third above C in C major is E
 * (+4 semitones) but a third above D is F (+3 semitones). Used by the
 * harmonizer (brief mode 7, "terceras/quintas/octavas dentro de la
 * escala") so generated harmony notes always land on a real scale tone,
 * never a fixed-semitone interval that could fall off the key.
 *
 * `scale === "chromatic"` has no meaningful "scale degree" (every
 * semitone is in it), so `steps` is treated as semitones directly in
 * that case - the only sane fallback, not a special harmonizer feature.
 */
export function scaleStepUp(midi: number, key: number, scale: ScaleName, steps: number): number {
  const intervals = SCALE_INTERVALS[scale];
  if (scale === "chromatic") return midi + steps;

  const snapped = nearestScaleMidi(midi, key, scale);
  const octave = Math.floor((snapped - key) / 12);
  const pc = (((snapped - key) % 12) + 12) % 12;
  const degreeIndex = intervals.indexOf(pc); // guaranteed present, snapped is on-scale

  const totalDegree = octave * intervals.length + degreeIndex + steps;
  const targetOctave = Math.floor(totalDegree / intervals.length);
  const targetIndex = ((totalDegree % intervals.length) + intervals.length) % intervals.length;

  return key + targetOctave * 12 + intervals[targetIndex];
}
