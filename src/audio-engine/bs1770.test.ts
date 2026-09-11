import { describe, expect, it } from "vitest";
import { applyKWeighting, computeIntegratedLufs } from "./bs1770";

const SAMPLE_RATE = 44100;

function makeTone(freqHz: number, amp: number, seconds: number, sampleRate = SAMPLE_RATE): Float32Array {
  const n = Math.floor(sampleRate * seconds);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) data[i] = Math.sin((2 * Math.PI * freqHz * i) / sampleRate) * amp;
  return data;
}

function makeSilence(seconds: number, sampleRate = SAMPLE_RATE): Float32Array {
  return new Float32Array(Math.floor(sampleRate * seconds));
}

describe("applyKWeighting", () => {
  it("preserves signal length at the design sample rate (48kHz, no resampling needed)", () => {
    const tone = makeTone(1000, 0.5, 1, 48000);
    const weighted = applyKWeighting(tone, 48000);
    expect(weighted.length).toBe(tone.length);
  });

  it("attenuates strongly below the ~38Hz high-pass corner", () => {
    const sub = makeTone(20, 0.5, 1);
    const mid = makeTone(1000, 0.5, 1);
    const weightedSub = applyKWeighting(sub, SAMPLE_RATE);
    const weightedMid = applyKWeighting(mid, SAMPLE_RATE);
    const rms = (d: Float32Array) => Math.sqrt(d.reduce((s, v) => s + v * v, 0) / d.length);
    // Skip the filter's settling transient.
    const settledSub = weightedSub.subarray(4000);
    const settledMid = weightedMid.subarray(4000);
    expect(rms(settledSub) / 0.5).toBeLessThan(rms(settledMid) / 0.5);
  });
});

describe("computeIntegratedLufs", () => {
  it("silence reads -Infinity", () => {
    expect(computeIntegratedLufs(makeSilence(2), SAMPLE_RATE)).toBe(-Infinity);
  });

  it("a louder tone reads a higher integrated LUFS than a quieter one", () => {
    const quiet = computeIntegratedLufs(makeTone(1000, 0.05, 2), SAMPLE_RATE);
    const loud = computeIntegratedLufs(makeTone(1000, 0.5, 2), SAMPLE_RATE);
    expect(loud).toBeGreaterThan(quiet);
  });

  it("a full-scale 1kHz tone lands in a plausible range (sanity bound, not a certified reference value)", () => {
    // Full-scale sine mean-square is 0.5 -> unweighted LUFS would be
    // -0.691 + 10*log10(0.5) ~= -3.7; K-weighting's shelf gives a mild
    // boost around 1kHz, so a few dB either side of that is the sane
    // ballpark. This is a loose sanity check, not a conformance assertion
    // — see this file's header comment on why an exact reference value
    // isn't asserted here.
    const lufs = computeIntegratedLufs(makeTone(1000, 1.0, 3), SAMPLE_RATE);
    expect(lufs).toBeGreaterThan(-8);
    expect(lufs).toBeLessThan(2);
  });

  it("gating keeps a loud section's level from being dragged down by a long quiet tail", () => {
    const loudSec = 2;
    const quietSec = 8;
    const combined = new Float32Array(Math.floor((loudSec + quietSec) * SAMPLE_RATE));
    const loud = makeTone(1000, 0.5, loudSec);
    const quiet = makeTone(1000, 0.001, quietSec); // near-silent, well under the absolute gate
    combined.set(loud, 0);
    combined.set(quiet, loud.length);

    const loudOnly = computeIntegratedLufs(loud, SAMPLE_RATE);
    const combinedResult = computeIntegratedLufs(combined, SAMPLE_RATE);

    // Gating should keep the combined reading close to the loud section's
    // own level, not pulled way down by 4x as much near-silent audio.
    expect(Math.abs(combinedResult - loudOnly)).toBeLessThan(1);
  });

  it("resampling to the 48kHz design rate doesn't crash and produces a finite result for common sample rates", () => {
    for (const sr of [44100, 48000, 22050]) {
      const lufs = computeIntegratedLufs(makeTone(1000, 0.3, 2, sr), sr);
      expect(Number.isFinite(lufs)).toBe(true);
    }
  });
});
