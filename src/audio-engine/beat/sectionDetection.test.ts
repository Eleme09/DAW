import { describe, expect, it } from "vitest";
import { detectSections } from "./sectionDetection";

const SAMPLE_RATE = 44100;

function makeToneAtAmplitude(freqHz: number, amplitude: number, seconds: number, sampleRate = SAMPLE_RATE): Float32Array {
  const n = Math.floor(sampleRate * seconds);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) data[i] = Math.sin((2 * Math.PI * freqHz * i) / sampleRate) * amplitude;
  return data;
}

describe("detectSections", () => {
  it("finds a boundary near a quiet-to-loud transition", () => {
    const quiet = makeToneAtAmplitude(220, 0.05, 6);
    const loud = makeToneAtAmplitude(220, 0.9, 6);
    const full = new Float32Array(quiet.length + loud.length);
    full.set(quiet, 0);
    full.set(loud, quiet.length);

    const boundaries = detectSections(full, SAMPLE_RATE);
    expect(boundaries[0].timeSec).toBe(0);
    expect(boundaries[0].energyLevel).toBe("low");

    const midBoundary = boundaries.find((b) => b.timeSec > 3 && b.timeSec < 9);
    expect(midBoundary).toBeDefined();
  });

  it("a track with constant energy reports no extra boundaries beyond the start", () => {
    const constant = makeToneAtAmplitude(220, 0.5, 10);
    const boundaries = detectSections(constant, SAMPLE_RATE);
    expect(boundaries.length).toBe(1);
  });

  it("labels a loud section as high energy relative to a quiet one", () => {
    const quiet = makeToneAtAmplitude(220, 0.05, 6);
    const loud = makeToneAtAmplitude(220, 0.9, 6);
    const full = new Float32Array(quiet.length + loud.length);
    full.set(quiet, 0);
    full.set(loud, quiet.length);

    const boundaries = detectSections(full, SAMPLE_RATE);
    const loudBoundary = boundaries[boundaries.length - 1];
    expect(loudBoundary.energyLevel).toBe("high");
  });
});
