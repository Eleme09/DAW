import { describe, expect, it } from "vitest";
import { generateImpulseResponseSamples, reverbDecayEnvelopeDb } from "./impulseResponse";

describe("generateImpulseResponseSamples", () => {
  it("produces the requested length for the sample rate/decay", () => {
    const samples = generateImpulseResponseSamples(48000, 1, "hall");
    expect(samples.length).toBe(48000);
  });

  it("decays toward the tail (energy in the first half exceeds the second half)", () => {
    const samples = generateImpulseResponseSamples(44100, 1, "room");
    const half = Math.floor(samples.length / 2);
    const energy = (arr: Float32Array) => arr.reduce((sum, v) => sum + v * v, 0);
    const firstHalfEnergy = energy(samples.subarray(0, half));
    const secondHalfEnergy = energy(samples.subarray(half));
    expect(firstHalfEnergy).toBeGreaterThan(secondHalfEnergy);
  });

  it("stays within [-1, 1]", () => {
    const samples = generateImpulseResponseSamples(44100, 0.5, "plate");
    for (const v of samples) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("room decays faster than hall for the same length (higher decay exponent)", () => {
    // Compare average |amplitude| in the back quarter, relative to the front quarter,
    // across many trials since the source is random noise.
    const trials = 20;
    let roomRatio = 0;
    let hallRatio = 0;
    for (let t = 0; t < trials; t++) {
      const room = generateImpulseResponseSamples(44100, 1, "room");
      const hall = generateImpulseResponseSamples(44100, 1, "hall");
      roomRatio += tailToHeadRatio(room);
      hallRatio += tailToHeadRatio(hall);
    }
    expect(roomRatio / trials).toBeLessThan(hallRatio / trials);
  });
});

describe("reverbDecayEnvelopeDb", () => {
  it("starts at 0 dB (full level) at t=0", () => {
    expect(reverbDecayEnvelopeDb(0, "hall")).toBeCloseTo(0, 5);
  });

  it("goes to -Infinity at t=1 (fully decayed)", () => {
    expect(reverbDecayEnvelopeDb(1, "room")).toBe(-Infinity);
  });

  it("is monotonically decreasing over time", () => {
    let prev = reverbDecayEnvelopeDb(0, "plate");
    for (let i = 1; i <= 10; i++) {
      const db = reverbDecayEnvelopeDb(i / 10, "plate");
      expect(db).toBeLessThanOrEqual(prev);
      prev = db;
    }
  });

  it("room (higher exponent) decays faster than hall (lower exponent) at the same t", () => {
    const t = 0.5;
    expect(reverbDecayEnvelopeDb(t, "room")).toBeLessThan(reverbDecayEnvelopeDb(t, "hall"));
  });

  it("clamps out-of-range t", () => {
    expect(reverbDecayEnvelopeDb(-1, "hall")).toBeCloseTo(0, 5);
    expect(reverbDecayEnvelopeDb(2, "hall")).toBe(-Infinity);
  });
});

function tailToHeadRatio(samples: Float32Array): number {
  const quarter = Math.floor(samples.length / 4);
  const mean = (arr: Float32Array) => arr.reduce((s, v) => s + Math.abs(v), 0) / arr.length;
  const head = mean(samples.subarray(0, quarter));
  const tail = mean(samples.subarray(samples.length - quarter));
  return head > 0 ? tail / head : 0;
}
