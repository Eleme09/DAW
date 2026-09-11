import { describe, expect, it } from "vitest";
import { estimateNoiseProfile, reduceNoiseChannel, reduceNoiseBuffer } from "./spectralNoiseReduction";
import { fftInPlace, hannWindow } from "./fft";

const SAMPLE_RATE = 44100;

function makeTone(freqHz: number, amp: number, seconds: number): Float32Array {
  const n = Math.floor(SAMPLE_RATE * seconds);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) data[i] = Math.sin((2 * Math.PI * freqHz * i) / SAMPLE_RATE) * amp;
  return data;
}

// Deterministic pseudo-random "noise" so tests are reproducible.
function makeNoise(amp: number, seconds: number, seed = 1): Float32Array {
  const n = Math.floor(SAMPLE_RATE * seconds);
  const data = new Float32Array(n);
  let state = seed;
  for (let i = 0; i < n; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    data[i] = ((state / 0x7fffffff) * 2 - 1) * amp;
  }
  return data;
}

function add(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(Math.max(a.length, b.length));
  for (let i = 0; i < out.length; i++) out[i] = (a[i] ?? 0) + (b[i] ?? 0);
  return out;
}

function concat(...arrays: Float32Array[]): Float32Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function rms(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / data.length);
}

describe("estimateNoiseProfile", () => {
  it("returns near-zero for a signal that's entirely silent", () => {
    const silence = new Float32Array(SAMPLE_RATE * 2);
    const profile = estimateNoiseProfile(silence);
    for (let i = 0; i < profile.length; i++) expect(profile[i]).toBeCloseTo(0, 5);
  });

  it("a signal with a quiet section and a loud section builds its profile from the quiet part, not the loud one", () => {
    const quiet = makeNoise(0.01, 1, 1);
    const loud = makeTone(440, 0.8, 1);
    const signal = concat(quiet, loud);
    const profile = estimateNoiseProfile(signal);

    // The profile should look like the quiet noise floor, not the loud tone:
    // its total energy should be much smaller than the loud tone's own peak magnitude.
    const maxProfileBin = Math.max(...profile);
    const loudProfile = estimateNoiseProfile(loud);
    const maxLoudBin = Math.max(...loudProfile);
    expect(maxProfileBin).toBeLessThan(maxLoudBin * 0.5);
  });
});

describe("reduceNoiseChannel", () => {
  it("strength=0 leaves the signal effectively unchanged", () => {
    const signal = add(makeTone(440, 0.3, 1), makeNoise(0.05, 1, 2));
    const output = reduceNoiseChannel(signal, { strength: 0 });
    const inputRms = rms(signal);
    const outputRms = rms(output);
    expect(Math.abs(outputRms - inputRms) / inputRms).toBeLessThan(0.05);
  });

  it("output is the same length as the input", () => {
    const signal = makeTone(300, 0.4, 1.3);
    const output = reduceNoiseChannel(signal, { strength: 0.5 });
    expect(output.length).toBe(signal.length);
  });

  it("increasing strength monotonically reduces noise-only RMS, and never amplifies past the input", () => {
    // Also guards against a real bug this file caught during development:
    // dividing by near-zero overlap-add window energy at the buffer's
    // absolute start/end (where fewer than the full set of overlapping
    // frames contribute yet) amplified any spectral modification there by
    // orders of magnitude - peaks reached ~3x the input's before the fix
    // (see reduceNoiseChannel's energyThreshold comment).
    const noiseOnly = makeNoise(0.08, 1, 3);
    const inputRms = rms(noiseOnly);
    const inputPeak = Math.max(...Array.from(noiseOnly).map(Math.abs));

    let previousRms = Infinity;
    for (const strength of [0, 0.25, 0.5, 0.75, 1]) {
      const output = reduceNoiseChannel(noiseOnly, { strength });
      const outputRms = rms(output);
      expect(outputRms).toBeLessThanOrEqual(previousRms + 1e-6);
      previousRms = outputRms;

      const outputPeak = Math.max(...Array.from(output).map(Math.abs));
      expect(outputPeak).toBeLessThan(inputPeak * 1.1);
    }
    // A real, substantial reduction, not just "technically monotonic":
    // strength=1 should knock stationary noise-only content down hard.
    expect(previousRms).toBeLessThan(inputRms * 0.3);
  });

  it("reduces a noise-only section far more than a section where the same noise sits under a loud tone", () => {
    // The real value of spectral subtraction: it should hit noise hard
    // where there's nothing else to preserve, while leaving a loud tone
    // sharing the same noise floor largely intact (the whole point of
    // "noise reduction" vs. "just turn it down").
    const noiseOnly = makeNoise(0.08, 1, 3);
    const tonePlusNoise = add(makeTone(500, 0.5, 1), makeNoise(0.08, 1, 3));
    const signal = concat(noiseOnly, tonePlusNoise);

    const output = reduceNoiseChannel(signal, { strength: 1 });
    const outputNoiseOnly = output.subarray(0, noiseOnly.length);
    const outputTonePlusNoise = output.subarray(noiseOnly.length);

    const noiseOnlyReductionRatio = rms(outputNoiseOnly) / rms(noiseOnly);
    const tonePlusNoiseReductionRatio = rms(outputTonePlusNoise) / rms(tonePlusNoise);

    expect(noiseOnlyReductionRatio).toBeLessThan(0.3);
    expect(tonePlusNoiseReductionRatio).toBeGreaterThan(0.9);
  });

  it("with an accurate (non-conservative) noise profile, substantially attenuates held-out noise of the same character", () => {
    // Isolates the core subtraction+resynthesis math from the auto-profile
    // heuristic's quietest-10% selection: build a profile from the TRUE
    // average magnitude spectrum across every frame of a long noise-only
    // reference, then apply it to a SEPARATE sample of the same
    // statistical noise character (different seed).
    const longNoiseReference = makeNoise(0.08, 4, 3);
    const window = hannWindow(2048);
    const trueProfile = new Float32Array(1025);
    let frameCount = 0;
    for (let start = 0; start + 2048 <= longNoiseReference.length; start += 2048) {
      const re = Float32Array.from(longNoiseReference.subarray(start, start + 2048)).map((v, i) => v * window[i]);
      const im = new Float32Array(2048);
      fftInPlace(re, im);
      for (let k = 0; k <= 1024; k++) trueProfile[k] += Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      frameCount++;
    }
    for (let k = 0; k < trueProfile.length; k++) trueProfile[k] /= frameCount;

    const heldOutNoise = makeNoise(0.08, 1, 42);
    const output = reduceNoiseChannel(heldOutNoise, { strength: 1 }, trueProfile);

    expect(rms(output)).toBeLessThan(rms(heldOutNoise) * 0.3);
  });

  it("does not produce NaN/Infinity for a realistic signal", () => {
    const signal = add(makeTone(220, 0.4, 2), makeNoise(0.03, 2, 4));
    const output = reduceNoiseChannel(signal, { strength: 0.7 });
    for (let i = 0; i < output.length; i++) {
      expect(Number.isFinite(output[i])).toBe(true);
    }
  });

  it("accepts a precomputed noise profile instead of estimating one", () => {
    const signal = makeTone(440, 0.5, 1);
    const profile = estimateNoiseProfile(makeNoise(0.05, 1, 5));
    const output = reduceNoiseChannel(signal, { strength: 0.5 }, profile);
    expect(output.length).toBe(signal.length);
    expect(Number.isFinite(rms(output))).toBe(true);
  });
});

describe("reduceNoiseBuffer", () => {
  it("processes each channel independently and preserves channel count", () => {
    const left = add(makeTone(300, 0.4, 0.5), makeNoise(0.05, 0.5, 6));
    const right = add(makeTone(500, 0.4, 0.5), makeNoise(0.05, 0.5, 7));
    const output = reduceNoiseBuffer([left, right], { strength: 0.6 });
    expect(output.length).toBe(2);
    expect(output[0].length).toBe(left.length);
    expect(output[1].length).toBe(right.length);
  });
});
