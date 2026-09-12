import { describe, expect, it } from "vitest";
import { barSeconds, beatSeconds, gridStepSeconds, secondsToBarBeat, snapToGrid } from "./grid";

describe("beatSeconds/barSeconds", () => {
  it("computes a quarter-note beat at 120bpm in 4/4", () => {
    expect(beatSeconds(120, 4)).toBeCloseTo(0.5);
    expect(barSeconds(120, [4, 4])).toBeCloseTo(2);
  });

  it("adjusts beat length for a different denominator (6/8)", () => {
    // an eighth note at 120bpm is half a quarter note
    expect(beatSeconds(120, 8)).toBeCloseTo(0.25);
    expect(barSeconds(120, [6, 8])).toBeCloseTo(1.5);
  });
});

describe("gridStepSeconds", () => {
  it("returns null when snapping is off", () => {
    expect(gridStepSeconds(120, [4, 4], "off")).toBeNull();
  });

  it("subdivides a quarter-note beat", () => {
    expect(gridStepSeconds(120, [4, 4], "1/4")).toBeCloseTo(0.5);
    expect(gridStepSeconds(120, [4, 4], "1/8")).toBeCloseTo(0.25);
    expect(gridStepSeconds(120, [4, 4], "1/16")).toBeCloseTo(0.125);
  });

  it("computes triplet subdivisions", () => {
    expect(gridStepSeconds(120, [4, 4], "1/8t")).toBeCloseTo((0.5 * 2) / 3);
  });
});

describe("snapToGrid", () => {
  it("rounds to the nearest grid step", () => {
    expect(snapToGrid(0.6, 120, [4, 4], "1/4")).toBeCloseTo(0.5);
    expect(snapToGrid(0.8, 120, [4, 4], "1/4")).toBeCloseTo(1.0);
  });

  it("passes through unchanged when off", () => {
    expect(snapToGrid(0.637, 120, [4, 4], "off")).toBeCloseTo(0.637);
  });
});

describe("secondsToBarBeat", () => {
  it("starts at bar 1 beat 1", () => {
    expect(secondsToBarBeat(0, 120, [4, 4])).toEqual({ bar: 1, beat: 1 });
  });

  it("advances beats within a bar and rolls over to the next bar", () => {
    expect(secondsToBarBeat(0.5, 120, [4, 4])).toEqual({ bar: 1, beat: 2 });
    expect(secondsToBarBeat(2, 120, [4, 4])).toEqual({ bar: 2, beat: 1 });
  });
});
