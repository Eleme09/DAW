import { describe, expect, it } from "vitest";
import { computeAveragePowerSpectrum, computeBandEnergies, VOCAL_BANDS } from "./spectralAnalysis";

const SAMPLE_RATE = 44100;

function makeToneChannel(freqHz: number, seconds: number, sampleRate = SAMPLE_RATE): Float32Array {
  const n = Math.floor(sampleRate * seconds);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) data[i] = Math.sin((2 * Math.PI * freqHz * i) / sampleRate);
  return data;
}

describe("computeAveragePowerSpectrum + computeBandEnergies", () => {
  it("flags a low-frequency tone as concentrated in the bass band", () => {
    const channel = makeToneChannel(150, 1); // squarely in the "bass" band (60-250Hz)
    const spectrum = computeAveragePowerSpectrum(channel);
    const bands = computeBandEnergies(spectrum, SAMPLE_RATE, 2048);

    const bass = bands.find((b) => b.name === "bass")!;
    const sibilance = bands.find((b) => b.name === "sibilance")!;
    expect(bass.relativeDb).toBeGreaterThan(sibilance.relativeDb);
    expect(bass.relativeDb).toBeGreaterThan(0); // above the recording's own average
  });

  it("flags a high-frequency tone as concentrated in the sibilance/air bands", () => {
    const channel = makeToneChannel(7000, 1); // in the "sibilance" band (5000-9000Hz)
    const spectrum = computeAveragePowerSpectrum(channel);
    const bands = computeBandEnergies(spectrum, SAMPLE_RATE, 2048);

    const bass = bands.find((b) => b.name === "bass")!;
    const sibilance = bands.find((b) => b.name === "sibilance")!;
    expect(sibilance.relativeDb).toBeGreaterThan(bass.relativeDb);
  });

  it("returns one entry per configured band", () => {
    const channel = makeToneChannel(1000, 0.5);
    const spectrum = computeAveragePowerSpectrum(channel);
    const bands = computeBandEnergies(spectrum, SAMPLE_RATE, 2048);
    expect(bands).toHaveLength(VOCAL_BANDS.length);
  });

  it("handles audio shorter than one FFT frame without throwing", () => {
    const channel = new Float32Array(100).fill(0.1);
    expect(() => computeAveragePowerSpectrum(channel)).not.toThrow();
  });
});
