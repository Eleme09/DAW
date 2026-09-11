import { describe, expect, it } from "vitest";
import { analyzePitch, correctPitchChannel } from "./applyPitchCorrection";
import { detectPitchYin } from "./pitchDetection";
import { midiToFrequency } from "./noteUtils";
import type { PitchCorrectionSettings } from "@/types/pitch";

const SAMPLE_RATE = 44100;

function makeTone(freqHz: number, seconds: number, sampleRate = SAMPLE_RATE): Float32Array {
  const n = Math.floor(sampleRate * seconds);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) data[i] = Math.sin((2 * Math.PI * freqHz * i) / sampleRate);
  return data;
}

function averageDetectedFrequency(data: Float32Array): number {
  const frameSize = 2048;
  const hop = 1024;
  const freqs: number[] = [];
  for (let start = 0; start + frameSize <= data.length; start += hop) {
    const { frequencyHz } = detectPitchYin(data.subarray(start, start + frameSize), SAMPLE_RATE);
    if (frequencyHz !== null) freqs.push(frequencyHz);
  }
  return freqs.reduce((s, f) => s + f, 0) / freqs.length;
}

describe("analyzePitch", () => {
  it("returns one frame per hop and a key result with a confidence score", () => {
    const channel = makeTone(261.63, 1); // C4
    const { frames, detectedKey } = analyzePitch(channel, SAMPLE_RATE);
    expect(frames.length).toBeGreaterThan(0);
    expect(detectedKey.confidence).toBeGreaterThan(0);
  });
});

describe("correctPitchChannel end-to-end", () => {
  it("pulls a flat C4 take toward true C4 pitch (full pipeline: detect -> curve -> PSOLA)", () => {
    const flatFreq = midiToFrequency(59.6); // ~40 cents flat of C4
    const channel = makeTone(flatFreq, 1);
    const settings: PitchCorrectionSettings = {
      key: 0,
      scale: "major",
      retuneSpeedMs: 0,
      humanizeAmount: 0,
      mode: "hardTune",
    };

    const corrected = correctPitchChannel(channel, SAMPLE_RATE, settings);
    const before = averageDetectedFrequency(channel);
    const after = averageDetectedFrequency(corrected);
    const target = midiToFrequency(60);

    expect(Math.abs(after - target)).toBeLessThan(Math.abs(before - target));
    expect(Math.abs(after - target) / target).toBeLessThan(0.03);
  });

  it("returns audio the same length as the input", () => {
    const channel = makeTone(220, 0.5);
    const settings: PitchCorrectionSettings = {
      key: 0,
      scale: "chromatic",
      retuneSpeedMs: 50,
      humanizeAmount: 0.2,
      mode: "natural",
    };
    const corrected = correctPitchChannel(channel, SAMPLE_RATE, settings);
    expect(corrected.length).toBe(channel.length);
  });
});
