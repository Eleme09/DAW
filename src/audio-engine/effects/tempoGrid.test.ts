import { describe, expect, it } from "vitest";
import { divisionToMs, msToClosestDivision, TEMPO_DIVISIONS } from "./tempoGrid";

describe("divisionToMs", () => {
  it("a quarter note at 120 BPM is 500ms", () => {
    expect(divisionToMs(1, 120)).toBeCloseTo(500, 5);
  });

  it("an eighth note at 120 BPM is 250ms", () => {
    expect(divisionToMs(0.5, 120)).toBeCloseTo(250, 5);
  });

  it("a whole note at 60 BPM is 4000ms", () => {
    expect(divisionToMs(4, 60)).toBeCloseTo(4000, 5);
  });
});

describe("msToClosestDivision", () => {
  it("finds the exact quarter note at 120 BPM", () => {
    const result = msToClosestDivision(500, 120);
    expect(result.division.label).toBe("1/4");
    expect(result.diffMs).toBeCloseTo(0, 5);
  });

  it("snaps a nearby value to the closest division", () => {
    const result = msToClosestDivision(245, 120); // close to the 250ms eighth note
    expect(result.division.label).toBe("1/8");
  });

  it("covers every division with a positive duration", () => {
    for (const division of TEMPO_DIVISIONS) {
      expect(divisionToMs(division.beats, 120)).toBeGreaterThan(0);
    }
  });
});
