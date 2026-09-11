import { describe, expect, it } from "vitest";
import { highShelfFilter, highpassFilter, lowpassFilter } from "./filters";

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

describe("highpassFilter", () => {
  it("attenuates a low-frequency tone well below the cutoff", () => {
    const tone = makeTone(30, 0.5);
    const filtered = highpassFilter(tone, SAMPLE_RATE, 250);
    const settled = filtered.subarray(2000);
    const original = tone.subarray(2000);
    expect(rms(settled) / rms(original)).toBeLessThan(0.2);
  });

  it("passes a high-frequency tone through with little attenuation", () => {
    const tone = makeTone(4000, 0.5);
    const filtered = highpassFilter(tone, SAMPLE_RATE, 250);
    const settled = filtered.subarray(2000);
    const original = tone.subarray(2000);
    expect(rms(settled) / rms(original)).toBeGreaterThan(0.85);
  });
});

describe("highShelfFilter", () => {
  it("leaves a low-frequency tone roughly unchanged", () => {
    const tone = makeTone(100, 0.5);
    const filtered = highShelfFilter(tone, SAMPLE_RATE, 1500, 6);
    const settled = filtered.subarray(2000);
    const original = tone.subarray(2000);
    const ratio = rms(settled) / rms(original);
    expect(ratio).toBeGreaterThan(0.9);
    expect(ratio).toBeLessThan(1.1);
  });

  it("boosts a high-frequency tone by roughly the requested gain", () => {
    const tone = makeTone(6000, 0.5);
    const filtered = highShelfFilter(tone, SAMPLE_RATE, 1500, 6);
    const settled = filtered.subarray(2000);
    const original = tone.subarray(2000);
    const gainDb = 20 * Math.log10(rms(settled) / rms(original));
    expect(gainDb).toBeGreaterThan(3);
    expect(gainDb).toBeLessThan(9);
  });

  it("a 0dB shelf leaves the signal essentially unchanged at any frequency", () => {
    const tone = makeTone(6000, 0.5);
    const filtered = highShelfFilter(tone, SAMPLE_RATE, 1500, 0);
    const settled = filtered.subarray(2000);
    const original = tone.subarray(2000);
    expect(rms(settled) / rms(original)).toBeCloseTo(1, 1);
  });
});
