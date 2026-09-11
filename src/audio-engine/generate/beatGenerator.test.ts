import { describe, expect, it } from "vitest";
import { generateBeat } from "./beatGenerator";
import type { GenerateBeatOptions } from "@/types/beatGen";

const BASE_OPTIONS: GenerateBeatOptions = {
  bpm: 140,
  key: 0,
  scale: "naturalMinor",
  genre: "trap",
  mood: "dark",
};

describe("generateBeat", () => {
  it("is deterministic for identical inputs", () => {
    const a = generateBeat(BASE_OPTIONS);
    const b = generateBeat(BASE_OPTIONS);
    expect(a).toEqual(b);
  });

  it("produces a different result for a different seed", () => {
    const a = generateBeat({ ...BASE_OPTIONS, seed: 1 });
    const b = generateBeat({ ...BASE_OPTIONS, seed: 2 });
    expect(a.progressionDegrees).not.toEqual(b.progressionDegrees);
  });

  it("defaults to 2 bars per chord in the picked progression", () => {
    const result = generateBeat(BASE_OPTIONS);
    expect(result.bars).toBe(result.progressionDegrees.length * 2);
  });

  it("respects an explicit bars count when it's a valid multiple of the progression length", () => {
    const probe = generateBeat(BASE_OPTIONS);
    const bars = probe.progressionDegrees.length * 3;
    const result = generateBeat({ ...BASE_OPTIONS, bars });
    expect(result.bars).toBe(bars);
    expect(result.chords).toHaveLength(probe.progressionDegrees.length);
  });

  it("throws when the requested bars isn't a multiple of the progression length", () => {
    // pick a progression length first, then request an incompatible bar count.
    const probe = generateBeat(BASE_OPTIONS);
    const badBars = probe.progressionDegrees.length * 2 + 1;
    expect(() => generateBeat({ ...BASE_OPTIONS, bars: badBars })).toThrow();
  });

  it("produces non-empty drums, bass, and melody for every genre/mood combination", () => {
    const genres = ["trap", "boomBap", "dance", "halfTime"] as const;
    const moods = ["dark", "bright", "chill", "aggressive"] as const;
    for (const genre of genres) {
      for (const mood of moods) {
        const result = generateBeat({ ...BASE_OPTIONS, genre, mood });
        expect(result.drums.length).toBeGreaterThan(0);
        expect(result.bass.length).toBeGreaterThan(0);
        expect(result.melody.length).toBeGreaterThan(0);
        expect(result.chords.length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps every event within the generated timeline (0 to bars*4 beats)", () => {
    const result = generateBeat({ ...BASE_OPTIONS, genre: "trap", mood: "aggressive" });
    const totalBeats = result.bars * 4;
    for (const d of result.drums) expect(d.startBeat).toBeLessThan(totalBeats);
    for (const b of result.bass) expect(b.startBeat + b.lengthBeats).toBeLessThanOrEqual(totalBeats + 1e-6);
    for (const m of result.melody) expect(m.startBeat + m.lengthBeats).toBeLessThanOrEqual(totalBeats + 1e-6);
  });
});
