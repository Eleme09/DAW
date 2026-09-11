import { describe, expect, it } from "vitest";
import { computePeaks } from "./waveform";

function fakeBuffer(samples: number[]): AudioBuffer {
  const data = Float32Array.from(samples);
  return {
    numberOfChannels: 1,
    length: data.length,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

describe("computePeaks", () => {
  it("produces one min/max pair per bucket", () => {
    const buffer = fakeBuffer(new Array(100).fill(0).map((_, i) => Math.sin(i)));
    const peaks = computePeaks(buffer, 10);
    expect(peaks.min.length).toBe(10);
    expect(peaks.max.length).toBe(10);
    expect(peaks.bucketCount).toBe(10);
  });

  it("captures the full amplitude range within a single bucket", () => {
    const buffer = fakeBuffer([-1, -0.5, 0, 0.5, 1]);
    const peaks = computePeaks(buffer, 1);
    expect(peaks.min[0]).toBeCloseTo(-1);
    expect(peaks.max[0]).toBeCloseTo(1);
  });

  it("handles silence", () => {
    const buffer = fakeBuffer(new Array(50).fill(0));
    const peaks = computePeaks(buffer, 5);
    expect(Array.from(peaks.min)).toEqual([0, 0, 0, 0, 0]);
    expect(Array.from(peaks.max)).toEqual([0, 0, 0, 0, 0]);
  });
});
