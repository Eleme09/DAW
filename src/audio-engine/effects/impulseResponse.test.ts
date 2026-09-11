import { describe, expect, it } from "vitest";
import { generateImpulseResponseSamples } from "./impulseResponse";

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

function tailToHeadRatio(samples: Float32Array): number {
  const quarter = Math.floor(samples.length / 4);
  const mean = (arr: Float32Array) => arr.reduce((s, v) => s + Math.abs(v), 0) / arr.length;
  const head = mean(samples.subarray(0, quarter));
  const tail = mean(samples.subarray(samples.length - quarter));
  return head > 0 ? tail / head : 0;
}
