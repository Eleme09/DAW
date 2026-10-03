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

  /**
   * Direct measurement, not a restatement of the file header's own claim:
   * this file's comment says PSOLA here does "not preserve formants (no
   * spectral-envelope separation, just period-locked grains)". That framing
   * turned out to be misleading when checked against the same measurement
   * used to validate the realtime worklet's PSOLA rewrite (see
   * public/worklets/realtime-pitch-processor.js's header and PROGRESS.md) —
   * period-locked grains copied *unresampled* from the source is exactly
   * what keeps formants in place; spectral-envelope separation (cepstral/
   * LPC) is a separate, additional technique for reshaping formants
   * independently of pitch (e.g. a deliberate gender/character change), not
   * a prerequisite for "formants don't move when pitch does." This test
   * settles it with a number instead of trusting either comment.
   */
  it("keeps an isolated formant-like partial near its original frequency, not the shifted one", () => {
    const sampleRate = SAMPLE_RATE;
    const f0 = 150;
    const formantHz = 1430; // deliberately NOT an integer harmonic of f0 (1430/150=9.53) - real vocal formants are independent of pitch, unlike my first draft which accidentally used harmonic 10 exactly
    const durationSec = 1.5;
    const n = Math.floor(sampleRate * durationSec);
    const input = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      let s = 0;
      for (let h = 1; h <= 16; h++) s += (0.3 / h) * Math.sin(2 * Math.PI * f0 * h * t);
      s += 0.5 * Math.sin(2 * Math.PI * formantHz * t);
      input[i] = s * 0.2;
    }

    const shiftRatio = Math.pow(2, 4 / 12); // +4 semitones, a realistic correction amount
    const curve = constantCurve(f0, f0 * shiftRatio, durationSec);
    const output = psolaShift(input, sampleRate, curve);

    const dftMag = (samples: Float32Array, start: number, N: number, targetHz: number): number => {
      const w = (2 * Math.PI * targetHz) / sampleRate;
      let re = 0;
      let im = 0;
      for (let i = 0; i < N; i++) {
        const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
        const s = samples[start + i] * window;
        re += s * Math.cos(w * i);
        im += s * Math.sin(w * i);
      }
      return Math.sqrt(re * re + im * im);
    };

    const steadyStart = Math.floor(sampleRate * 0.5);
    const N = 8192;
    const magAtOriginalFormant = dftMag(output, steadyStart, N, formantHz);
    const magAtShiftedFormant = dftMag(output, steadyStart, N, formantHz * shiftRatio);

    // If formants moved with pitch (the old realtime shifter's bug), the
    // energy would concentrate at the SHIFTED location instead. Real TD-
    // PSOLA with period-locked, unresampled grains keeps it at the
    // original location by a wide margin.
    expect(magAtOriginalFormant).toBeGreaterThan(magAtShiftedFormant * 3);
  });
});
