import { describe, expect, it } from "vitest";
import { faderDbToPos, faderPosToDb } from "./faderLaw";

describe("fader law", () => {
  it("puts 0 dB high on the travel and halfway at -6 dB, not -27", () => {
    expect(faderDbToPos(0)).toBeCloseTo(0.708, 2);
    expect(faderPosToDb(0.5)).toBeCloseTo(-6, 0);
    expect(faderPosToDb(1)).toBeCloseTo(6, 5);
    expect(faderPosToDb(0)).toBe(-60);
  });
  it("round-trips", () => {
    for (const db of [-48, -24, -12, -6, -3, 0, 3, 6]) expect(faderPosToDb(faderDbToPos(db))).toBeCloseTo(db, 6);
  });
});
