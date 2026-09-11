import { describe, expect, it } from "vitest";
import { detectPitchYin, trackPitch } from "./pitchDetection";

const SAMPLE_RATE = 44100;

function makeTone(freqHz: number, length: number, sampleRate = SAMPLE_RATE): Float32Array {
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) data[i] = Math.sin((2 * Math.PI * freqHz * i) / sampleRate);
  return data;
}

describe("detectPitchYin", () => {
  it("detects the frequency of a pure tone within 1%", () => {
    const frame = makeTone(220, 2048);
    const { frequencyHz, confidence } = detectPitchYin(frame, SAMPLE_RATE);
    expect(frequencyHz).not.toBeNull();
    expect(frequencyHz!).toBeCloseTo(220, 0);
    expect(Math.abs(frequencyHz! - 220) / 220).toBeLessThan(0.01);
    expect(confidence).toBeGreaterThan(0.8);
  });

  it("tracks a higher vocal-range frequency accurately", () => {
    const frame = makeTone(440, 2048);
    const { frequencyHz } = detectPitchYin(frame, SAMPLE_RATE);
    expect(Math.abs(frequencyHz! - 440) / 440).toBeLessThan(0.01);
  });

  it("does not report a confident pitch for silence", () => {
    const frame = new Float32Array(2048);
    const { frequencyHz } = detectPitchYin(frame, SAMPLE_RATE);
    expect(frequencyHz).toBeNull();
  });

  it("does not report a confident pitch for white noise", () => {
    const frame = new Float32Array(2048);
    for (let i = 0; i < frame.length; i++) frame[i] = Math.random() * 2 - 1;
    const { confidence } = detectPitchYin(frame, SAMPLE_RATE);
    expect(confidence).toBeLessThan(0.8);
  });

  it("avoids octave errors on a tone with a strong first harmonic", () => {
    const frame = new Float32Array(2048);
    for (let i = 0; i < frame.length; i++) {
      frame[i] = Math.sin((2 * Math.PI * 150 * i) / SAMPLE_RATE) + 0.6 * Math.sin((2 * Math.PI * 300 * i) / SAMPLE_RATE);
    }
    const { frequencyHz } = detectPitchYin(frame, SAMPLE_RATE);
    expect(Math.abs(frequencyHz! - 150) / 150).toBeLessThan(0.02);
  });
});

describe("trackPitch", () => {
  it("produces one frame per hop across the buffer", () => {
    const channel = makeTone(200, 44100); // 1 second
    const frames = trackPitch(channel, SAMPLE_RATE, 2048, 512);
    const expectedCount = Math.floor((44100 - 2048) / 512) + 1;
    expect(frames.length).toBe(expectedCount);
  });

  it("reads a consistent frequency across a steady tone", () => {
    const channel = makeTone(300, 44100);
    const frames = trackPitch(channel, SAMPLE_RATE, 2048, 512);
    const voiced = frames.filter((f) => f.frequencyHz !== null);
    expect(voiced.length).toBeGreaterThan(frames.length * 0.8);
    for (const f of voiced) {
      expect(Math.abs(f.frequencyHz! - 300) / 300).toBeLessThan(0.02);
    }
  });
});
