import { describe, expect, it } from "vitest";
import { computeOnsetEnvelope, detectOnsets } from "./onsetDetection";

const SAMPLE_RATE = 44100;

function makeClickTrack(bpm: number, seconds: number, sampleRate = SAMPLE_RATE): Float32Array {
  const n = Math.floor(sampleRate * seconds);
  const data = new Float32Array(n);
  const intervalSamples = Math.round((60 / bpm) * sampleRate);
  const clickLen = Math.round(0.01 * sampleRate); // 10ms decaying burst
  for (let start = 0; start < n; start += intervalSamples) {
    for (let i = 0; i < clickLen && start + i < n; i++) {
      const env = 1 - i / clickLen;
      data[start + i] = (Math.random() * 2 - 1) * env;
    }
  }
  return data;
}

describe("computeOnsetEnvelope + detectOnsets", () => {
  it("finds roughly one onset per click in a click track", () => {
    const track = makeClickTrack(120, 4); // clicks every 0.5s -> 8 clicks
    const envelope = computeOnsetEnvelope(track, SAMPLE_RATE);
    const onsets = detectOnsets(envelope);
    expect(onsets.length).toBeGreaterThanOrEqual(5);
    expect(onsets.length).toBeLessThanOrEqual(10);
  });

  it("onset times land close to the actual click positions", () => {
    const track = makeClickTrack(100, 3); // clicks every 0.6s
    const envelope = computeOnsetEnvelope(track, SAMPLE_RATE);
    const onsets = detectOnsets(envelope);
    for (const onset of onsets) {
      const nearestClickIndex = Math.round(onset.timeSec / 0.6);
      const nearestClickTime = nearestClickIndex * 0.6;
      expect(Math.abs(onset.timeSec - nearestClickTime)).toBeLessThan(0.05);
    }
  });

  it("finds no onsets in silence", () => {
    const silence = new Float32Array(SAMPLE_RATE);
    const envelope = computeOnsetEnvelope(silence, SAMPLE_RATE);
    const onsets = detectOnsets(envelope);
    expect(onsets.length).toBe(0);
  });
});
