import { describe, expect, it } from "vitest";
import { buildHarmonyCurve } from "./harmonize";
import { frequencyToMidi, midiToFrequency } from "./noteUtils";
import type { PitchFrame } from "@/types/pitch";

function frameAt(midi: number, timeSec: number, confidence = 1): PitchFrame {
  return { timeSec, frequencyHz: midiToFrequency(midi), confidence };
}

describe("buildHarmonyCurve", () => {
  it("a third-up (2 scale steps) harmony in C major follows the diatonic interval, not a fixed semitone gap", () => {
    const frames = [frameAt(60, 0), frameAt(62, 0.01)]; // C4, D4
    const curve = buildHarmonyCurve(frames, 0, "major", 2);
    expect(frequencyToMidi(curve[0].targetFrequencyHz!)).toBeCloseTo(64, 3); // C -> E, +4 semitones
    expect(frequencyToMidi(curve[1].targetFrequencyHz!)).toBeCloseTo(65, 3); // D -> F, +3 semitones
  });

  it("a fifth-up (4 scale steps) harmony", () => {
    const curve = buildHarmonyCurve([frameAt(60, 0)], 0, "major", 4);
    expect(frequencyToMidi(curve[0].targetFrequencyHz!)).toBeCloseTo(67, 3); // C -> G
  });

  it("an octave-up (7 scale steps) harmony is always exactly +12 semitones", () => {
    const curve = buildHarmonyCurve([frameAt(60, 0), frameAt(64, 0.01), frameAt(67, 0.02)], 0, "major", 7);
    expect(frequencyToMidi(curve[0].targetFrequencyHz!)).toBeCloseTo(72, 3);
    expect(frequencyToMidi(curve[1].targetFrequencyHz!)).toBeCloseTo(76, 3);
    expect(frequencyToMidi(curve[2].targetFrequencyHz!)).toBeCloseTo(79, 3);
  });

  it("leaves unvoiced frames uncorrected", () => {
    const frames: PitchFrame[] = [frameAt(60, 0), { timeSec: 0.01, frequencyHz: null, confidence: 0 }];
    const curve = buildHarmonyCurve(frames, 0, "major", 2);
    expect(curve[1].targetFrequencyHz).toBeNull();
  });

  it("harmony below the melody uses negative steps", () => {
    const curve = buildHarmonyCurve([frameAt(67, 0)], 0, "major", -4); // G -> C, a fifth down
    expect(frequencyToMidi(curve[0].targetFrequencyHz!)).toBeCloseTo(60, 3);
  });
});
