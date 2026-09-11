import { describe, expect, it } from "vitest";
import { trackBassLine } from "./bassTracking";

const SAMPLE_RATE = 44100;

function makeBassPlusMelody(bassHz: number, melodyHz: number, seconds: number, sampleRate = SAMPLE_RATE): Float32Array {
  const n = Math.floor(sampleRate * seconds);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    data[i] = Math.sin((2 * Math.PI * bassHz * i) / sampleRate) * 0.8 + Math.sin((2 * Math.PI * melodyHz * i) / sampleRate) * 0.4;
  }
  return data;
}

describe("trackBassLine", () => {
  it("tracks the bass note despite a higher melody tone playing at the same time", () => {
    const mix = makeBassPlusMelody(55, 880, 1); // A1 bass + A5 melody
    const notes = trackBassLine(mix, SAMPLE_RATE);
    const voiced = notes.filter((n) => n.frequencyHz !== null);
    expect(voiced.length).toBeGreaterThan(0);
    for (const note of voiced) {
      expect(Math.abs(note.frequencyHz! - 55) / 55).toBeLessThan(0.05);
    }
  });

  it("returns null frequency for silence", () => {
    const silence = new Float32Array(SAMPLE_RATE);
    const notes = trackBassLine(silence, SAMPLE_RATE);
    expect(notes.every((n) => n.frequencyHz === null)).toBe(true);
  });
});
