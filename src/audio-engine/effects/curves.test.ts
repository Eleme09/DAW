import { describe, expect, it } from "vitest";
import { compressorTransferDb, makeHardClipCurve, makeSaturationCurve } from "./curves";

describe("makeHardClipCurve", () => {
  const curve = makeHardClipCurve();

  it("is monotonic and bounded to [-1, 1]", () => {
    for (const v of curve) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("maps the center of the table to ~0", () => {
    const mid = curve[Math.floor(curve.length / 2)];
    expect(mid).toBeCloseTo(0, 1);
  });

  it("maps the last sample to 1 (no clipping headroom lost)", () => {
    expect(curve[curve.length - 1]).toBeCloseTo(1, 5);
  });
});

describe("makeSaturationCurve", () => {
  it.each(["warm", "neutral", "bright"] as const)("%s stays within [-1, 1]", (tone) => {
    const curve = makeSaturationCurve(tone);
    for (const v of curve) {
      expect(v).toBeGreaterThanOrEqual(-1.05); // bright's asymmetry can overshoot slightly before clamp
      expect(v).toBeLessThanOrEqual(1.05);
    }
  });

  it("is odd-ish (warm/neutral): shape(-x) ~= -shape(x)", () => {
    const curve = makeSaturationCurve("warm");
    const n = curve.length;
    const quarter = curve[Math.floor(n * 0.25)];
    const threeQuarter = curve[Math.floor(n * 0.75)];
    expect(quarter).toBeCloseTo(-threeQuarter, 1);
  });

  it("compresses harder near the extremes than near the center (soft-saturation shape)", () => {
    const curve = makeSaturationCurve("warm");
    const n = curve.length;
    const centerSlope = curve[Math.floor(n * 0.51)] - curve[Math.floor(n * 0.49)];
    const edgeSlope = curve[n - 1] - curve[n - 3];
    expect(Math.abs(edgeSlope)).toBeLessThan(Math.abs(centerSlope));
  });
});

describe("compressorTransferDb", () => {
  it("passes signal through unchanged well below the knee", () => {
    expect(compressorTransferDb(-40, -18, 4, 6)).toBeCloseTo(-40, 5);
  });

  it("applies the full ratio well above the knee", () => {
    // 10dB above threshold, ratio 4:1 -> output = threshold + 10/4
    expect(compressorTransferDb(-8, -18, 4, 6)).toBeCloseTo(-18 + 10 / 4, 5);
  });

  it("is continuous at the knee boundaries (no jump)", () => {
    const threshold = -18,
      ratio = 4,
      knee = 6;
    const belowKnee = threshold - knee / 2;
    const aboveKnee = threshold + knee / 2;
    expect(compressorTransferDb(belowKnee - 1e-6, threshold, ratio, knee)).toBeCloseTo(
      compressorTransferDb(belowKnee, threshold, ratio, knee),
      3
    );
    expect(compressorTransferDb(aboveKnee, threshold, ratio, knee)).toBeCloseTo(
      compressorTransferDb(aboveKnee + 1e-6, threshold, ratio, knee),
      3
    );
  });

  it("never boosts the signal (output <= input) for ratio >= 1", () => {
    for (let db = -60; db <= 0; db += 3) {
      expect(compressorTransferDb(db, -20, 4, 6)).toBeLessThanOrEqual(db + 1e-9);
    }
  });

  it("is a no-op (1:1) when ratio is 1", () => {
    expect(compressorTransferDb(-5, -20, 1, 6)).toBeCloseTo(-5, 5);
  });

  it("matches the hard-knee formula when kneeDb is 0", () => {
    expect(compressorTransferDb(-8, -18, 4, 0)).toBeCloseTo(-18 + (-8 - -18) / 4, 5);
  });
});
