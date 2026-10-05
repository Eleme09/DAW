import { describe, expect, it } from "vitest";
import { splitCyclePasses } from "./cyclePasses";

const loop = { enabled: true, startTime: 2, endTime: 6 };

describe("splitCyclePasses", () => {
  it("returns null when the cycle is off or the take never wrapped", () => {
    expect(splitCyclePasses(2, 10, { ...loop, enabled: false }, 0)).toBeNull();
    expect(splitCyclePasses(3, 2, loop, 0)).toBeNull();
    expect(splitCyclePasses(8, 10, loop, 0)).toBeNull();
  });

  it("makes one take per lap, all stacked on the cycle", () => {
    const passes = splitCyclePasses(2, 12, loop, 0)!;
    expect(passes).toEqual([
      { startTime: 2, sourceOffset: 0, duration: 4 },
      { startTime: 2, sourceOffset: 4, duration: 4 },
      { startTime: 2, sourceOffset: 8, duration: 4 },
    ]);
  });

  it("starts the first lap where recording started and drops a tiny leftover", () => {
    const passes = splitCyclePasses(4, 6.1, loop, 0)!;
    expect(passes).toEqual([
      { startTime: 4, sourceOffset: 0, duration: 2 },
      { startTime: 2, sourceOffset: 2, duration: 4 },
    ]);
  });

  it("skips the measured latency at the start of each lap's audio", () => {
    const passes = splitCyclePasses(2, 8.05, loop, 0.05)!;
    expect(passes[0].sourceOffset).toBeCloseTo(0.05);
    expect(passes[1].sourceOffset).toBeCloseTo(4.05);
  });
});
