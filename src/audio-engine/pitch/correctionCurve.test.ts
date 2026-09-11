import { describe, expect, it } from "vitest";
import { buildCorrectionCurve } from "./correctionCurve";
import { frequencyToMidi, midiToFrequency } from "./noteUtils";
import type { PitchCorrectionSettings, PitchFrame } from "@/types/pitch";

const noHumanizeRandom = () => 0.5; // step becomes 0, so humanize contributes nothing

function baseSettings(overrides: Partial<PitchCorrectionSettings> = {}): PitchCorrectionSettings {
  return { key: 0, scale: "major", retuneSpeedMs: 0, humanizeAmount: 0, mode: "hardTune", ...overrides };
}

function slightlyFlatC4Frames(count: number, hopSec = 0.01): PitchFrame[] {
  const flatFreq = midiToFrequency(59.7); // ~30 cents flat of C4
  return Array.from({ length: count }, (_, i) => ({
    timeSec: i * hopSec,
    frequencyHz: flatFreq,
    confidence: 1,
  }));
}

describe("buildCorrectionCurve", () => {
  it("instant snap (retuneSpeedMs=0) hits the target on the very first voiced frame", () => {
    const frames = slightlyFlatC4Frames(3);
    const curve = buildCorrectionCurve(frames, baseSettings({ retuneSpeedMs: 0 }), noHumanizeRandom);
    expect(curve[0].targetFrequencyHz).toBeCloseTo(midiToFrequency(60), 1);
  });

  it("gradual glide (large retuneSpeedMs) starts at the sung pitch and converges toward the target", () => {
    const frames = slightlyFlatC4Frames(50, 0.01); // 500ms total, tau = 300ms below
    const curve = buildCorrectionCurve(frames, baseSettings({ retuneSpeedMs: 300 }), noHumanizeRandom);
    const targetMidi = 60;

    // Nothing to glide from at the very first sample (no elapsed time yet).
    const firstMidi = frequencyToMidi(curve[0].targetFrequencyHz!);
    expect(firstMidi).toBeCloseTo(frequencyToMidi(frames[0].frequencyHz!), 3);

    // An early-but-not-first frame should still be well short of the target...
    const earlyMidi = frequencyToMidi(curve[5].targetFrequencyHz!);
    // ...while a late frame should have mostly converged.
    const lateMidi = frequencyToMidi(curve[curve.length - 1].targetFrequencyHz!);

    expect(Math.abs(lateMidi - targetMidi)).toBeLessThan(Math.abs(earlyMidi - targetMidi));
    expect(Math.abs(lateMidi - targetMidi)).toBeLessThan(0.1);
  });

  it("leaves unvoiced frames uncorrected", () => {
    const voiced = slightlyFlatC4Frames(5, 0.01);
    const gap: PitchFrame = { timeSec: 0.06, frequencyHz: null, confidence: 0 };
    const moreVoiced = slightlyFlatC4Frames(3, 0.01).map((f) => ({ ...f, timeSec: f.timeSec + 0.1 }));
    const frames = [...voiced, gap, ...moreVoiced];

    const curve = buildCorrectionCurve(frames, baseSettings({ retuneSpeedMs: 300 }), noHumanizeRandom);
    const gapIndex = voiced.length;
    expect(curve[gapIndex].targetFrequencyHz).toBeNull();
  });

  it("with instant snap, re-corrects immediately after a gap (reset doesn't linger as a slow glide)", () => {
    const voiced = slightlyFlatC4Frames(5, 0.01);
    const gap: PitchFrame = { timeSec: 0.06, frequencyHz: null, confidence: 0 };
    const moreVoiced = slightlyFlatC4Frames(3, 0.01).map((f) => ({ ...f, timeSec: f.timeSec + 0.1 }));
    const frames = [...voiced, gap, ...moreVoiced];

    const curve = buildCorrectionCurve(frames, baseSettings({ retuneSpeedMs: 0 }), noHumanizeRandom);
    const afterGap = curve[voiced.length + 1];
    expect(frequencyToMidi(afterGap.targetFrequencyHz!)).toBeCloseTo(60, 0);
  });

  it("with a gradual glide, a new voiced run after a gap restarts the glide from the sung pitch", () => {
    const voiced = slightlyFlatC4Frames(30, 0.01); // long enough to fully glide to target
    const gap: PitchFrame = { timeSec: 0.31, frequencyHz: null, confidence: 0 };
    const moreVoiced = slightlyFlatC4Frames(3, 0.01).map((f) => ({ ...f, timeSec: f.timeSec + 0.4 }));
    const frames = [...voiced, gap, ...moreVoiced];

    const curve = buildCorrectionCurve(frames, baseSettings({ retuneSpeedMs: 300 }), noHumanizeRandom);
    const lastBeforeGap = frequencyToMidi(curve[voiced.length - 1].targetFrequencyHz!);
    const firstAfterGap = frequencyToMidi(curve[voiced.length + 1].targetFrequencyHz!);

    // Just before the gap it should have nearly converged on the target (60);
    // right after the gap it should be pulled back toward the detected (flat) pitch.
    expect(Math.abs(lastBeforeGap - 60)).toBeLessThan(Math.abs(firstAfterGap - 60));
  });

  it("humanize adds variation around the snapped pitch when the RNG isn't constant", () => {
    let seed = 1;
    const pseudoRandom = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const frames = slightlyFlatC4Frames(30, 0.01);
    const curve = buildCorrectionCurve(frames, baseSettings({ retuneSpeedMs: 0, humanizeAmount: 1 }), pseudoRandom);

    const targets = curve.map((f) => frequencyToMidi(f.targetFrequencyHz!));
    const allEqual = targets.every((t) => Math.abs(t - targets[0]) < 1e-9);
    expect(allEqual).toBe(false);

    // Humanize should stay a subtle effect, not send pitch wildly off-target.
    for (const t of targets) expect(Math.abs(t - 60)).toBeLessThan(0.5);
  });

  it("humanizeAmount=0 with a non-constant RNG produces no variation", () => {
    let seed = 1;
    const pseudoRandom = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const frames = slightlyFlatC4Frames(10, 0.01);
    const curve = buildCorrectionCurve(frames, baseSettings({ retuneSpeedMs: 0, humanizeAmount: 0 }), pseudoRandom);
    for (const f of curve) expect(f.targetFrequencyHz).toBeCloseTo(midiToFrequency(60), 3);
  });
});
