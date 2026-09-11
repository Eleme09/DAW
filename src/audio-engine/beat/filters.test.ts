import { describe, expect, it } from "vitest";
import { lowpassFilter } from "./filters";

const SAMPLE_RATE = 44100;

function makeTone(freqHz: number, seconds: number, sampleRate = SAMPLE_RATE): Float32Array {
  const n = Math.floor(sampleRate * seconds);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) data[i] = Math.sin((2 * Math.PI * freqHz * i) / sampleRate);
  return data;
}

function rms(data: Float32Array): number {
  let sum = 0;
  for (const v of data) sum += v * v;
  return Math.sqrt(sum / data.length);
}

describe("lowpassFilter", () => {
  it("passes a low-frequency tone through with little attenuation", () => {
    const tone = makeTone(80, 0.5);
    const filtered = lowpassFilter(tone, SAMPLE_RATE, 250);
    // skip the filter's settling transient at the start
    const settled = filtered.subarray(2000);
    const original = tone.subarray(2000);
    expect(rms(settled) / rms(original)).toBeGreaterThan(0.85);
  });

  it("attenuates a high-frequency tone well above the cutoff", () => {
    const tone = makeTone(4000, 0.5);
    const filtered = lowpassFilter(tone, SAMPLE_RATE, 250);
    const settled = filtered.subarray(2000);
    const original = tone.subarray(2000);
    expect(rms(settled) / rms(original)).toBeLessThan(0.2);
  });
});
