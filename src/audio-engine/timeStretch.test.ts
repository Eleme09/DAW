import { describe, expect, it } from "vitest";
import { pitchShift, reverseChannels, timeStretch } from "./timeStretch";

const SR = 22050;

function sine(freq: number, seconds: number): Float32Array {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = 0.5 * Math.sin((2 * Math.PI * freq * i) / SR);
  return out;
}

/** Frequency estimate from upward zero crossings over the middle 60% (edges have fades). */
function estimateFreq(data: Float32Array): number {
  const start = Math.floor(data.length * 0.2);
  const end = Math.floor(data.length * 0.8);
  let crossings = 0;
  for (let i = start + 1; i < end; i++) if (data[i - 1] < 0 && data[i] >= 0) crossings++;
  return crossings / ((end - start) / SR);
}

describe("timeStretch", () => {
  it("2x speed halves the length and keeps the pitch", () => {
    const [out] = timeStretch([sine(220, 2)], SR, 2);
    expect(out.length).toBe(Math.round((2 * SR) / 2));
    expect(estimateFreq(out)).toBeGreaterThan(210);
    expect(estimateFreq(out)).toBeLessThan(230);
  });

  it("0.5x speed doubles the length and keeps the pitch", () => {
    const [out] = timeStretch([sine(220, 1)], SR, 0.5);
    expect(out.length).toBe(2 * SR);
    expect(estimateFreq(out)).toBeGreaterThan(210);
    expect(estimateFreq(out)).toBeLessThan(230);
  });

  it("keeps stereo channels the same length", () => {
    const out = timeStretch([sine(220, 1), sine(330, 1)], SR, 1.5);
    expect(out[0].length).toBe(out[1].length);
  });
});

describe("pitchShift", () => {
  it("+12 semitones doubles the frequency and keeps the length", () => {
    const input = sine(220, 1.5);
    const [out] = pitchShift([input], SR, 12);
    expect(out.length).toBe(input.length);
    expect(estimateFreq(out)).toBeGreaterThan(420);
    expect(estimateFreq(out)).toBeLessThan(460);
  });

  it("-5 semitones lowers the frequency by the right ratio", () => {
    const [out] = pitchShift([sine(440, 1.5)], SR, -5);
    const expected = 440 * Math.pow(2, -5 / 12);
    expect(Math.abs(estimateFreq(out) - expected)).toBeLessThan(expected * 0.05);
  });
});

describe("reverseChannels", () => {
  it("reverses each channel", () => {
    const [out] = reverseChannels([Float32Array.from([1, 2, 3])]);
    expect(Array.from(out)).toEqual([3, 2, 1]);
  });
});
