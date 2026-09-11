import { describe, expect, it } from "vitest";
import { frequencyToMidi, midiToFrequency, nearestScaleFrequency, nearestScaleMidi, pitchClass } from "./noteUtils";

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
