import { describe, expect, it } from "vitest";
import { approxLufsFromMix, computeMeanSquare, computePeakDb, computeRmsDb, meanSquareToLufsApprox } from "./loudness";

describe("computePeakDb / computeRmsDb", () => {
  it("full-scale sample reads 0 dBFS peak", () => {
    expect(computePeakDb([1, -1, 0.5])).toBeCloseTo(0, 5);
  });

  it("silence reads -Infinity", () => {
    expect(computePeakDb([0, 0, 0])).toBe(-Infinity);
    expect(computeRmsDb([0, 0, 0])).toBe(-Infinity);
  });

  it("RMS is lower than peak for a non-constant signal", () => {
    const samples = [1, -1, 0.2, -0.2];
    expect(computeRmsDb(samples)).toBeLessThan(computePeakDb(samples));
  });

  it("a full-scale DC signal has RMS equal to peak", () => {
    const samples = [1, 1, 1, 1];
    expect(computeRmsDb(samples)).toBeCloseTo(computePeakDb(samples), 5);
  });
});

describe("computeMeanSquare / meanSquareToLufsApprox", () => {
  it("mean square of silence is 0", () => {
    expect(computeMeanSquare([0, 0, 0])).toBe(0);
  });

  it("silence maps to -Infinity approx-LUFS", () => {
    expect(meanSquareToLufsApprox(0)).toBe(-Infinity);
  });

  it("louder signal (bigger mean square) reads a higher approx-LUFS", () => {
    const quiet = meanSquareToLufsApprox(0.001);
    const loud = meanSquareToLufsApprox(0.1);
    expect(loud).toBeGreaterThan(quiet);
  });

  it("full-scale DC mean square (1.0) maps to the ITU offset constant", () => {
    expect(meanSquareToLufsApprox(1)).toBeCloseTo(-0.691, 3);
  });
});

describe("approxLufsFromMix", () => {
  const SAMPLE_RATE = 44100;

  function makeTone(freqHz: number, amp: number, seconds: number): Float32Array {
    const n = Math.floor(SAMPLE_RATE * seconds);
    const data = new Float32Array(n);
    for (let i = 0; i < n; i++) data[i] = Math.sin((2 * Math.PI * freqHz * i) / SAMPLE_RATE) * amp;
    return data;
  }

  it("silence reads -Infinity", () => {
    const silence = new Float32Array(SAMPLE_RATE * 0.5);
    expect(approxLufsFromMix(silence, SAMPLE_RATE)).toBe(-Infinity);
  });

  it("a louder tone reads a higher approx-LUFS than a quieter one", () => {
    const quiet = approxLufsFromMix(makeTone(1000, 0.1, 0.5), SAMPLE_RATE);
    const loud = approxLufsFromMix(makeTone(1000, 0.5, 0.5), SAMPLE_RATE);
    expect(loud).toBeGreaterThan(quiet);
  });

  it("a sub-60Hz tone reads much quieter than a mid-range tone at the same amplitude (highpass in the K-weighting chain)", () => {
    const sub = approxLufsFromMix(makeTone(30, 0.5, 0.5), SAMPLE_RATE);
    const mid = approxLufsFromMix(makeTone(1000, 0.5, 0.5), SAMPLE_RATE);
    expect(sub).toBeLessThan(mid - 10);
  });
});
