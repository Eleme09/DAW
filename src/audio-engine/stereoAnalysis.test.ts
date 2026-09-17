import { describe, expect, it } from "vitest";
import { computeStereoCorrelation } from "./stereoAnalysis";

describe("computeStereoCorrelation", () => {
  it("returns 1 for identical L/R (mono-compatible)", () => {
    const signal = [0.1, -0.3, 0.5, -0.7, 0.2];
    expect(computeStereoCorrelation(signal, signal)).toBeCloseTo(1, 5);
  });

  it("returns -1 for perfectly inverted L/R", () => {
    const left = [0.1, -0.3, 0.5, -0.7, 0.2];
    const right = left.map((v) => -v);
    expect(computeStereoCorrelation(left, right)).toBeCloseTo(-1, 5);
  });

  it("returns 0 for uncorrelated orthogonal signals", () => {
    // A sine and its quarter-period-shifted cosine over a full cycle are
    // orthogonal (their dot product is 0 in the continuous limit).
    const n = 256;
    const left = Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * i) / n));
    const right = Array.from({ length: n }, (_, i) => Math.cos((2 * Math.PI * i) / n));
    expect(computeStereoCorrelation(left, right)).toBeCloseTo(0, 2);
  });

  it("returns 1 for total silence on both channels", () => {
    const silence = new Array(10).fill(0);
    expect(computeStereoCorrelation(silence, silence)).toBe(1);
  });

  it("clamps to [-1, 1] even with floating point drift", () => {
    const signal = [1, 1, 1, 1];
    expect(computeStereoCorrelation(signal, signal)).toBeLessThanOrEqual(1);
  });

  it("handles empty input without throwing", () => {
    expect(computeStereoCorrelation([], [])).toBe(0);
  });
});
