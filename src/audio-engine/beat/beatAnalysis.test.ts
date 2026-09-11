import { describe, expect, it } from "vitest";
import { analyzeBeat } from "./beatAnalysis";

const SAMPLE_RATE = 44100;

function makeSimpleBeat(bpm: number, seconds: number, sampleRate = SAMPLE_RATE): Float32Array {
  const n = Math.floor(sampleRate * seconds);
  const data = new Float32Array(n);
  const beatInterval = Math.round((60 / bpm) * sampleRate);

  // Kick on every beat + a sustained bass tone underneath.
  for (let i = 0; i < n; i++) {
    data[i] += Math.sin((2 * Math.PI * 55 * i) / sampleRate) * 0.3; // A1 bass
  }
  for (let start = 0; start < n; start += beatInterval) {
    const kickLen = Math.round(0.15 * sampleRate);
    for (let i = 0; i < kickLen && start + i < n; i++) {
      const env = Math.exp(-i / (kickLen * 0.3));
      data[start + i] += Math.sin((2 * Math.PI * 60 * i) / sampleRate) * env * 0.6;
    }
  }
  return data;
}

describe("analyzeBeat", () => {
  it("returns a complete, internally consistent result", () => {
    const beat = makeSimpleBeat(120, 6);
    const result = analyzeBeat(beat, SAMPLE_RATE);

    expect(result.durationSec).toBeCloseTo(6, 0);
    expect(result.tempo.bpm).toBeGreaterThan(0);
    expect(result.key.confidence).toBeGreaterThanOrEqual(0);
    expect(result.bassLine.length).toBeGreaterThan(0);
    expect(result.drumHits.length).toBeGreaterThan(0);
    expect(result.sections.length).toBeGreaterThan(0);
    expect(result.sections[0].timeSec).toBe(0);
  });

  it("tracks the bass note near its actual frequency (A1, 55Hz)", () => {
    const beat = makeSimpleBeat(120, 4);
    const result = analyzeBeat(beat, SAMPLE_RATE);
    const voicedBass = result.bassLine.filter((n) => n.frequencyHz !== null);
    expect(voicedBass.length).toBeGreaterThan(0);
    const avg = voicedBass.reduce((s, n) => s + n.frequencyHz!, 0) / voicedBass.length;
    expect(Math.abs(avg - 55) / 55).toBeLessThan(0.1);
  });
});
