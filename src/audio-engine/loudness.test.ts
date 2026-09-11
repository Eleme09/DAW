import { describe, expect, it } from "vitest";
import { computeMeanSquare, computePeakDb, computeRmsDb, meanSquareToLufsApprox } from "./loudness";

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
