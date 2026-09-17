import { describe, expect, it } from "vitest";
import { buildDoubleCurve } from "./doubler";
import { frequencyToMidi, midiToFrequency } from "./noteUtils";
import type { PitchFrame } from "@/types/pitch";

const noWander = () => 0.5; // step becomes 0, walk stays at 0

function steadyC4Frames(count: number, hopSec = 0.01): PitchFrame[] {
  return Array.from({ length: count }, (_, i) => ({
    timeSec: i * hopSec,
    frequencyHz: midiToFrequency(60),
    confidence: 1,
  }));
}

describe("buildDoubleCurve", () => {
  it("with a constant RNG (no wander), the target stays exactly on the detected pitch", () => {
    const curve = buildDoubleCurve(steadyC4Frames(10), 25, noWander);
    for (const f of curve) expect(f.targetFrequencyHz).toBeCloseTo(midiToFrequency(60), 5);
  });

  it("with a varying RNG, the target wanders around the detected pitch, not toward any fixed scale note", () => {
    let seed = 1;
    const pseudoRandom = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const curve = buildDoubleCurve(steadyC4Frames(30), 25, pseudoRandom);
    const targets = curve.map((f) => frequencyToMidi(f.targetFrequencyHz!));
    const allEqual = targets.every((t) => Math.abs(t - targets[0]) < 1e-9);
    expect(allEqual).toBe(false);
    // Bounded by detuneCents (25 cents = 0.25 semitones) - a double shouldn't drift far off pitch.
    for (const t of targets) expect(Math.abs(t - 60)).toBeLessThan(0.3);
  });

  it("detuneCents=0 produces no variation regardless of RNG", () => {
    let seed = 1;
    const pseudoRandom = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const curve = buildDoubleCurve(steadyC4Frames(10), 0, pseudoRandom);
    for (const f of curve) expect(f.targetFrequencyHz).toBeCloseTo(midiToFrequency(60), 5);
  });

  it("leaves unvoiced frames uncorrected and resets the wander on the next voiced run", () => {
    const voiced = steadyC4Frames(5, 0.01);
    const gap: PitchFrame = { timeSec: 0.06, frequencyHz: null, confidence: 0 };
    const moreVoiced = steadyC4Frames(3, 0.01).map((f) => ({ ...f, timeSec: f.timeSec + 0.1 }));
    const frames = [...voiced, gap, ...moreVoiced];
    const curve = buildDoubleCurve(frames, 25, noWander);
    expect(curve[voiced.length].targetFrequencyHz).toBeNull();
    expect(curve[voiced.length + 1].targetFrequencyHz).toBeCloseTo(midiToFrequency(60), 5);
  });
});
