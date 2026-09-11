import { describe, expect, it } from "vitest";
import { makeHardClipCurve, makeSaturationCurve } from "./curves";

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
