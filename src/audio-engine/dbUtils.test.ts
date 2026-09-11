import { describe, expect, it } from "vitest";
import { clamp, dbToGain, gainToDb } from "./dbUtils";

describe("dbToGain / gainToDb", () => {
  it("0 dB is unity gain", () => {
    expect(dbToGain(0)).toBeCloseTo(1);
  });

  it("round-trips through gainToDb", () => {
    for (const db of [-24, -12, -6, 0, 3, 6]) {
      expect(gainToDb(dbToGain(db))).toBeCloseTo(db, 5);
    }
  });

  it("-Infinity dB is silence", () => {
    expect(dbToGain(-Infinity)).toBeCloseTo(0);
  });

  it("silence maps back to -Infinity dB", () => {
    expect(gainToDb(0)).toBe(-Infinity);
  });
});

describe("clamp", () => {
  it("keeps in-range values untouched", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("clamps below min", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it("clamps above max", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
});
