import { describe, expect, it } from "vitest";
import { analyzeDynamics } from "./dynamicsAnalysis";

const SAMPLE_RATE = 44100;

function silence(seconds: number): Float32Array {
  return new Float32Array(Math.floor(SAMPLE_RATE * seconds));
}

function toneWithNoiseFloor(seconds: number, noiseAmplitude: number, loudBurstAt: number): Float32Array {
  const n = Math.floor(SAMPLE_RATE * seconds);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * noiseAmplitude;
  const burstStart = Math.floor(loudBurstAt * SAMPLE_RATE);
  const burstLen = Math.floor(0.2 * SAMPLE_RATE);
  for (let i = burstStart; i < Math.min(n, burstStart + burstLen); i++) {
    data[i] = Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE) * 0.9;
  }
  return data;
}

describe("analyzeDynamics", () => {
  it("silence reads -Infinity peak/RMS and no clipping", () => {
    const result = analyzeDynamics(silence(0.5), SAMPLE_RATE);
    expect(result.peakDb).toBe(-Infinity);
    expect(result.clippedSampleRatio).toBe(0);
  });

  it("detects clipped samples", () => {
    const data = new Float32Array(1000).fill(0.5);
    data.fill(1, 100, 200);
    const result = analyzeDynamics(data, SAMPLE_RATE);
    expect(result.clippedSampleRatio).toBeCloseTo(0.1, 2);
  });

  it("a quiet-noise-floor + loud-burst recording has a large dynamic range", () => {
    const data = toneWithNoiseFloor(1, 0.005, 0.4);
    const result = analyzeDynamics(data, SAMPLE_RATE);
    expect(result.dynamicRangeDb).toBeGreaterThan(20);
    expect(result.noiseFloorDb).toBeLessThan(-30);
  });

  it("a constant-level signal has a small dynamic range", () => {
    const data = new Float32Array(SAMPLE_RATE);
    for (let i = 0; i < data.length; i++) data[i] = Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE) * 0.5;
    const result = analyzeDynamics(data, SAMPLE_RATE);
    expect(result.dynamicRangeDb).toBeLessThan(3);
  });
});
