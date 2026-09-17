import { describe, expect, it } from "vitest";
import { adsrLevel, adsrTotalSec, oscillatorSample } from "./waveformShapes";

describe("oscillatorSample", () => {
  it("sine matches Math.sin at key phases", () => {
    expect(oscillatorSample("sine", 0)).toBeCloseTo(0, 5);
    expect(oscillatorSample("sine", 0.25)).toBeCloseTo(1, 5);
    expect(oscillatorSample("sine", 0.75)).toBeCloseTo(-1, 5);
  });

  it("square is +1 for the first half-cycle, -1 for the second", () => {
    expect(oscillatorSample("square", 0)).toBe(1);
    expect(oscillatorSample("square", 0.49)).toBe(1);
    expect(oscillatorSample("square", 0.5)).toBe(-1);
    expect(oscillatorSample("square", 0.99)).toBe(-1);
  });

  it("sawtooth ramps linearly from -1 to 1 across one cycle", () => {
    expect(oscillatorSample("sawtooth", 0)).toBeCloseTo(-1, 5);
    expect(oscillatorSample("sawtooth", 0.5)).toBeCloseTo(0, 5);
    expect(oscillatorSample("sawtooth", 1)).toBeCloseTo(-1, 5); // wraps
  });

  it("triangle rises then falls symmetrically", () => {
    expect(oscillatorSample("triangle", 0)).toBeCloseTo(-1, 5);
    expect(oscillatorSample("triangle", 0.25)).toBeCloseTo(0, 5);
    expect(oscillatorSample("triangle", 0.5)).toBeCloseTo(1, 5);
    expect(oscillatorSample("triangle", 0.75)).toBeCloseTo(0, 5);
  });

  it("wraps phase outside 0..1", () => {
    expect(oscillatorSample("sine", 1.25)).toBeCloseTo(oscillatorSample("sine", 0.25), 5);
  });

  it("stays within [-1, 1] across a full cycle for every type", () => {
    for (const type of ["sine", "square", "sawtooth", "triangle"] as const) {
      for (let i = 0; i <= 100; i++) {
        const v = oscillatorSample(type, i / 100);
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("adsrLevel", () => {
  it("starts at 0 and reaches the peak (1) at the end of attack", () => {
    expect(adsrLevel(0, 0.5, 0.2, 0.6, 0.3)).toBeCloseTo(0, 5);
    expect(adsrLevel(0.5, 0.5, 0.2, 0.6, 0.3)).toBeCloseTo(1, 5);
  });

  it("decays linearly from peak to the sustain level", () => {
    expect(adsrLevel(0.6, 0.5, 0.2, 0.6, 0.3)).toBeCloseTo(0.8, 5); // halfway through decay: 1 -> 0.6, so 0.8
    expect(adsrLevel(0.7, 0.5, 0.2, 0.6, 0.3)).toBeCloseTo(0.6, 5); // decay end
  });

  it("holds flat at the sustain level", () => {
    expect(adsrLevel(0.9, 0.5, 0.2, 0.6, 0.3)).toBeCloseTo(0.6, 5);
  });

  it("releases linearly back to 0", () => {
    const total = adsrTotalSec(0.5, 0.2, 0.3);
    expect(adsrLevel(total, 0.5, 0.2, 0.6, 0.3)).toBeCloseTo(0, 5);
  });

  it("handles zero attack without dividing by zero", () => {
    expect(adsrLevel(0, 0, 0.2, 0.6, 0.3)).toBeCloseTo(1, 5);
  });
});
