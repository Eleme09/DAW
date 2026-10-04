import { describe, expect, it } from "vitest";
import { buildTransposeCurve, transposeChannel } from "./transpose";
import { midiToFrequency } from "./noteUtils";
import { detectPitchYin } from "./pitchDetection";
import type { PitchFrame } from "@/types/pitch";

const SAMPLE_RATE = 44100;

function steadyC4Frames(count: number, hopSec = 0.01): PitchFrame[] {
  return Array.from({ length: count }, (_, i) => ({
    timeSec: i * hopSec,
    frequencyHz: midiToFrequency(60),
    confidence: 1,
  }));
}

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

describe("buildTransposeCurve", () => {
  it("shifts every voiced frame by exactly 2^(semitones/12), regardless of how loud/confident", () => {
    const curve = buildTransposeCurve(steadyC4Frames(10), 7);
    const expected = midiToFrequency(60) * Math.pow(2, 7 / 12);
    for (const f of curve) expect(f.targetFrequencyHz).toBeCloseTo(expected, 5);
  });

  it("negative semitones shift down", () => {
    const curve = buildTransposeCurve(steadyC4Frames(5), -12);
    const expected = midiToFrequency(60) / 2;
    for (const f of curve) expect(f.targetFrequencyHz).toBeCloseTo(expected, 5);
  });

  it("0 semitones is a no-op target (still detected, just unchanged)", () => {
    const curve = buildTransposeCurve(steadyC4Frames(5), 0);
    for (const f of curve) expect(f.targetFrequencyHz).toBeCloseTo(midiToFrequency(60), 5);
  });

  it("leaves unvoiced/low-confidence frames uncorrected", () => {
    const frames: PitchFrame[] = [
      { timeSec: 0, frequencyHz: midiToFrequency(60), confidence: 1 },
      { timeSec: 0.01, frequencyHz: null, confidence: 0 },
      { timeSec: 0.02, frequencyHz: midiToFrequency(60), confidence: 0.1 }, // below VOICED_CONFIDENCE_MIN
    ];
    const curve = buildTransposeCurve(frames, 12);
    expect(curve[0].targetFrequencyHz).not.toBeNull();
    expect(curve[1].targetFrequencyHz).toBeNull();
    expect(curve[2].targetFrequencyHz).toBeNull();
  });
});

describe("transposeChannel", () => {
  it("actually moves a real tone's detected pitch up by the requested ratio", () => {
    const input = makeTone(220, 1);
    const output = transposeChannel(input, SAMPLE_RATE, 9);
    const before = averageDetectedFrequency(input);
    const after = averageDetectedFrequency(output);
    expect(before).toBeCloseTo(220, 0);
    const expected = 220 * Math.pow(2, 9 / 12);
    expect(Math.abs(after - expected) / expected).toBeLessThan(0.05);
  });

  it("0 semitones returns the input unchanged (fast path, no PSOLA pass)", () => {
    const input = makeTone(220, 0.2);
    const output = transposeChannel(input, SAMPLE_RATE, 0);
    expect(output).not.toBe(input); // a copy, not the same reference
    for (let i = 0; i < input.length; i++) expect(output[i]).toBe(input[i]);
  });

  /**
   * Measured, not assumed: large ratios break down in this engine well
   * before a full octave. ±6..±10 semitones tracked the real shifted pitch
   * cleanly on a synthetic tone (checked by hand across that whole range
   * before picking ±10 as the UI's honest ceiling); ±11/±12 did not
   * (detected frequency locked onto an unrelated octave/alias instead of
   * the requested target). This is a real limitation of `psolaShift`'s
   * mark-spacing at extreme ratios, not of this transpose wrapper - the
   * realtime worklet's own fixed-semitone mode hit the same wall earlier
   * and is clamped to ±6 for exactly this reason (MIN/MAX_PITCH_RATIO in
   * realtime-pitch-processor.js). The UI caps at ±10, matching what's
   * actually been verified to work, not copying a bigger number from
   * another app's spec sheet.
   */
  it("stays accurate at the UI's ±10 semitone ceiling", () => {
    for (const semitones of [10, -10]) {
      const input = makeTone(220, 1);
      const output = transposeChannel(input, SAMPLE_RATE, semitones);
      const after = averageDetectedFrequency(output);
      const expected = 220 * Math.pow(2, semitones / 12);
      expect(Math.abs(after - expected) / expected).toBeLessThan(0.05);
    }
  });
});
