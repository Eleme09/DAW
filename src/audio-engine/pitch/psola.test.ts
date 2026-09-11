import { describe, expect, it } from "vitest";
import { psolaShift } from "./psola";
import { detectPitchYin } from "./pitchDetection";
import type { CorrectionFrame } from "./correctionCurve";

const SAMPLE_RATE = 44100;

function makeTone(freqHz: number, seconds: number, sampleRate = SAMPLE_RATE): Float32Array {
  const n = Math.floor(sampleRate * seconds);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) data[i] = Math.sin((2 * Math.PI * freqHz * i) / sampleRate);
  return data;
}

function constantCurve(
  detectedHz: number,
  targetHz: number | null,
  durationSec: number,
  hopSec = 512 / SAMPLE_RATE
): CorrectionFrame[] {
  const frames: CorrectionFrame[] = [];
  for (let t = 0; t < durationSec; t += hopSec) {
    frames.push({ timeSec: t, detectedFrequencyHz: detectedHz, targetFrequencyHz: targetHz });
  }
  return frames;
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

describe("psolaShift", () => {
  it("preserves the input length (pitch shift, not time stretch)", () => {
    const input = makeTone(220, 1);
    const curve = constantCurve(220, 330, 1);
    const output = psolaShift(input, SAMPLE_RATE, curve);
    expect(output.length).toBe(input.length);
  });

  it("shifts a 220Hz tone toward a 330Hz target", () => {
    const input = makeTone(220, 1);
    const curve = constantCurve(220, 330, 1);
    const output = psolaShift(input, SAMPLE_RATE, curve);

    const before = averageDetectedFrequency(input);
    const after = averageDetectedFrequency(output);

    expect(Math.abs(after - 330)).toBeLessThan(Math.abs(before - 330));
    expect(Math.abs(after - 330) / 330).toBeLessThan(0.05);
  });

  it("shifts downward too (330Hz -> 220Hz)", () => {
    const input = makeTone(330, 1);
    const curve = constantCurve(330, 220, 1);
    const output = psolaShift(input, SAMPLE_RATE, curve);
    const after = averageDetectedFrequency(output);
    expect(Math.abs(after - 220) / 220).toBeLessThan(0.05);
  });

  it("leaves an unvoiced/no-target signal close to unchanged", () => {
    const input = makeTone(220, 0.5);
    const curve = constantCurve(220, null, 0.5); // no target anywhere -> shiftRatio 1 throughout
    const output = psolaShift(input, SAMPLE_RATE, curve);

    let errorSum = 0;
    for (let i = 0; i < input.length; i++) errorSum += Math.abs(output[i] - input[i]);
    const meanAbsError = errorSum / input.length;
    expect(meanAbsError).toBeLessThan(0.15); // small OLA coloration is expected, not silence/noise
  });

  it("does not blow up amplitude (no runaway overlap-add gain)", () => {
    const input = makeTone(220, 0.5);
    const curve = constantCurve(220, 330, 0.5);
    const output = psolaShift(input, SAMPLE_RATE, curve);
    let peak = 0;
    for (const v of output) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeLessThan(2); // generous bound - just guards against normalization bugs
  });
});
