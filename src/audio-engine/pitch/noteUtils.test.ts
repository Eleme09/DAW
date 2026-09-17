import { describe, expect, it } from "vitest";
import {
  frequencyToMidi,
  midiToFrequency,
  nearestScaleFrequency,
  nearestScaleMidi,
  pitchClass,
  scaleStepUp,
} from "./noteUtils";

describe("frequencyToMidi / midiToFrequency", () => {
  it("A4 (440Hz) is MIDI 69", () => {
    expect(frequencyToMidi(440)).toBeCloseTo(69, 5);
  });

  it("round-trips", () => {
    for (const midi of [40, 60, 69, 84]) {
      expect(frequencyToMidi(midiToFrequency(midi))).toBeCloseTo(midi, 5);
    }
  });

  it("one octave up doubles frequency", () => {
    expect(midiToFrequency(81)).toBeCloseTo(880, 1); // A5
  });
});

describe("pitchClass", () => {
  it("wraps to 0-11", () => {
    expect(pitchClass(60)).toBe(0); // C4
    expect(pitchClass(61)).toBe(1); // C#4
    expect(pitchClass(72)).toBe(0); // C5
  });
});

describe("nearestScaleMidi / nearestScaleFrequency", () => {
  it("leaves an in-scale note unchanged", () => {
    expect(nearestScaleMidi(60, 0, "major")).toBe(60); // C in C major
  });

  it("snaps an out-of-scale note to the nearer scale tone", () => {
    // C#4 (61) in C major: nearer to C (60, dist 1) or D (62, dist 1) - tie, either is valid
    const snapped = nearestScaleMidi(61, 0, "major");
    expect([60, 62]).toContain(snapped);
  });

  it("chromatic scale never moves the note", () => {
    for (const midi of [60, 61, 62, 63]) {
      expect(nearestScaleMidi(midi, 0, "chromatic")).toBe(midi);
    }
  });

  it("nearestScaleFrequency snaps a slightly-flat note up to pitch", () => {
    const flatC4 = midiToFrequency(59.7); // ~30 cents flat of C4
    const snapped = nearestScaleFrequency(flatC4, 0, "major");
    expect(snapped).toBeCloseTo(midiToFrequency(60), 1);
  });
});

describe("scaleStepUp", () => {
  it("a diatonic third above C in C major is E (+4 semitones, not +3)", () => {
    expect(scaleStepUp(60, 0, "major", 2)).toBe(64); // C4 -> E4
  });

  it("a diatonic third above D in C major is F (+3 semitones) - interval width depends on the degree", () => {
    expect(scaleStepUp(62, 0, "major", 2)).toBe(65); // D4 -> F4
  });

  it("a diatonic fifth above C in C major is G (+7 semitones)", () => {
    expect(scaleStepUp(60, 0, "major", 4)).toBe(67); // C4 -> G4
  });

  it("an octave (7 scale degrees in a 7-note scale) is always +12 semitones exactly", () => {
    for (const root of [60, 62, 64, 65, 67, 69, 71]) {
      expect(scaleStepUp(root, 0, "major", 7)).toBe(root + 12);
    }
  });

  it("snaps an out-of-scale input onto the scale before stepping", () => {
    // C#4 (61) is not in C major - nearest is C(60) or D(62); either way,
    // a third up must land on a real scale tone, never 61+4=65 directly.
    const result = scaleStepUp(61, 0, "major", 2);
    expect(SCALE_MIDI_SET(0, "major").has(((result % 12) + 12) % 12)).toBe(true);
  });

  it("negative steps move down the scale", () => {
    expect(scaleStepUp(67, 0, "major", -4)).toBe(60); // G4 -> C4, a fifth down
  });

  it("chromatic scale treats steps as plain semitones", () => {
    expect(scaleStepUp(60, 0, "chromatic", 4)).toBe(64);
    expect(scaleStepUp(60, 0, "chromatic", -3)).toBe(57);
  });

  it("works for a minor key too (diatonic third above A in A minor is C)", () => {
    expect(scaleStepUp(69, 9, "naturalMinor", 2)).toBe(72); // A4 -> C5
  });
});

function SCALE_MIDI_SET(key: number, scale: "major" | "naturalMinor" | "chromatic"): Set<number> {
  const intervals = { major: [0, 2, 4, 5, 7, 9, 11], naturalMinor: [0, 2, 3, 5, 7, 8, 10], chromatic: [0,1,2,3,4,5,6,7,8,9,10,11] }[scale];
  return new Set(intervals.map((i) => (i + key) % 12));
}
