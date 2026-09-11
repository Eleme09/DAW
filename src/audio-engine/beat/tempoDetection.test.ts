import { describe, expect, it } from "vitest";
import { computeOnsetEnvelope } from "./onsetDetection";
import { estimateTempo } from "./tempoDetection";

const SAMPLE_RATE = 44100;

function makeClickTrack(bpm: number, seconds: number, sampleRate = SAMPLE_RATE): Float32Array {
  const n = Math.floor(sampleRate * seconds);
  const data = new Float32Array(n);
  const intervalSamples = Math.round((60 / bpm) * sampleRate);
  const clickLen = Math.round(0.01 * sampleRate);
  for (let start = 0; start < n; start += intervalSamples) {
    for (let i = 0; i < clickLen && start + i < n; i++) {
      const env = 1 - i / clickLen;
      data[start + i] = (Math.random() * 2 - 1) * env;
    }
  }
  return data;
}

function bpmIsCloseOrHarmonic(estimated: number, actual: number, tolerance = 0.05): boolean {
  for (const ratio of [1, 2, 0.5]) {
    if (Math.abs(estimated - actual * ratio) / (actual * ratio) < tolerance) return true;
  }
  return false;
}

describe("estimateTempo", () => {
  it("recovers a known BPM (120) from a click track, within tolerance or a tempo octave", () => {
    const track = makeClickTrack(120, 8);
    const envelope = computeOnsetEnvelope(track, SAMPLE_RATE);
    const result = estimateTempo(envelope);
    expect(bpmIsCloseOrHarmonic(result.bpm, 120)).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.1);
  });

  it("recovers a different known BPM (140, common in trap)", () => {
    const track = makeClickTrack(140, 8);
    const envelope = computeOnsetEnvelope(track, SAMPLE_RATE);
    const result = estimateTempo(envelope);
    expect(bpmIsCloseOrHarmonic(result.bpm, 140)).toBe(true);
  });

  it("reports low confidence for an envelope with no periodicity (silence)", () => {
    const silence = new Float32Array(SAMPLE_RATE * 4);
    const envelope = computeOnsetEnvelope(silence, SAMPLE_RATE);
    const result = estimateTempo(envelope);
    expect(result.confidence).toBeLessThan(0.3);
  });

  it("resolves a kick/snare backbeat (alternating hit strength) to the quarter-note tempo, not half-time", () => {
    // Regression test: a real 120 BPM beat with a kick-snare backbeat (kick
    // louder than snare) was misread as 60 BPM before the tempo prior was
    // added — the amplitude alternation makes the envelope's strongest raw
    // periodicity the 2-beat (kick+snare) cycle, not the 1-beat pulse.
    const bpm = 120;
    const seconds = 8;
    const n = Math.floor(SAMPLE_RATE * seconds);
    const data = new Float32Array(n);
    const beatSamples = Math.round((60 / bpm) * SAMPLE_RATE);
    const hitLen = Math.round(0.015 * SAMPLE_RATE);
    for (let beat = 0, start = 0; start < n; beat++, start += beatSamples) {
      const amp = beat % 2 === 0 ? 0.7 : 0.4; // kick vs. snare strength
      for (let i = 0; i < hitLen && start + i < n; i++) {
        data[start + i] = (Math.random() * 2 - 1) * (1 - i / hitLen) * amp;
      }
    }
    const envelope = computeOnsetEnvelope(data, SAMPLE_RATE);
    const result = estimateTempo(envelope);
    expect(Math.abs(result.bpm - bpm) / bpm).toBeLessThan(0.05);
  });
});
