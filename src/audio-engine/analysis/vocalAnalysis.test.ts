import { describe, expect, it } from "vitest";
import { analyzeVocalChannel } from "./vocalAnalysis";

const SAMPLE_RATE = 44100;

function makeSignal(seconds: number, build: (i: number) => number): Float32Array {
  const n = Math.floor(SAMPLE_RATE * seconds);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) data[i] = build(i);
  return data;
}

describe("analyzeVocalChannel", () => {
  it("flags clipping as a limitation, not something the chain silently fixes", () => {
    const data = makeSignal(0.5, () => 1); // fully clipped
    const result = analyzeVocalChannel(data, SAMPLE_RATE);
    expect(result.limitations.some((l) => l.toLowerCase().includes("clip"))).toBe(true);
  });

  it("a signal with real quiet gaps (like breaths between phrases) reads low noise severity", () => {
    // Speech-like: tone bursts separated by near-silence, so the percentile-based
    // noise-floor estimate actually sees the quiet parts (a real vocal breathes;
    // this is what the "noise floor" heuristic assumes — see vocalAnalysis.ts).
    const data = makeSignal(1, (i) => {
      const t = i / SAMPLE_RATE;
      const inPhrase = Math.floor(t * 4) % 2 === 0;
      const amp = inPhrase ? 0.3 : 0.0005;
      return Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE) * amp;
    });
    const result = analyzeVocalChannel(data, SAMPLE_RATE);
    expect(result.noise).toBe("low");
    expect(result.limitations.some((l) => l.toLowerCase().includes("noise floor"))).toBe(false);
  });

  it("a signal with a loud broadband noise floor reads high noise severity", () => {
    const data = makeSignal(1, () => (Math.random() * 2 - 1) * 0.3); // ~-10dBFS RMS noise throughout
    const result = analyzeVocalChannel(data, SAMPLE_RATE);
    expect(result.noise).toBe("high");
    expect(result.limitations.some((l) => l.toLowerCase().includes("noise floor"))).toBe(true);
  });

  it("energy concentrated in the sibilance band reads high sibilance, low mud", () => {
    const data = makeSignal(1, (i) => Math.sin((2 * Math.PI * 7000 * i) / SAMPLE_RATE) * 0.4);
    const result = analyzeVocalChannel(data, SAMPLE_RATE);
    expect(result.sibilance).toBe("high");
    expect(result.mud).toBe("low");
  });

  it("energy concentrated in the low-mid band reads high mud, low sibilance", () => {
    const data = makeSignal(1, (i) => Math.sin((2 * Math.PI * 350 * i) / SAMPLE_RATE) * 0.4);
    const result = analyzeVocalChannel(data, SAMPLE_RATE);
    expect(result.mud).toBe("high");
    expect(result.sibilance).toBe("low");
  });

  it("a level that swings between silence and full scale reads uncontrolled dynamics", () => {
    const data = makeSignal(1, (i) => {
      const t = i / SAMPLE_RATE;
      const burst = Math.floor(t * 4) % 2 === 0 ? 1 : 0.005;
      return Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE) * burst;
    });
    const result = analyzeVocalChannel(data, SAMPLE_RATE);
    expect(result.dynamics).toBe("uncontrolled");
  });
});
