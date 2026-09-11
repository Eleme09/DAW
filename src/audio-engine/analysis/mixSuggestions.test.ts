import { describe, expect, it } from "vitest";
import { buildGainStagingSuggestions, buildMaskingSuggestions } from "./mixSuggestions";
import type { GainStagingFinding, MaskingFinding } from "@/types/mixAnalysis";

describe("buildMaskingSuggestions", () => {
  it("produces one EQ cut suggestion per track in the pair, at the contested frequency", () => {
    const finding: MaskingFinding = {
      trackAId: "a",
      trackAName: "Vocal",
      trackBId: "b",
      trackBName: "Synth Lead",
      band: "mid",
      freqHz: 1000,
      overlapScore: 0.5,
    };
    const suggestions = buildMaskingSuggestions([finding]);
    expect(suggestions).toHaveLength(2);

    const [forA, forB] = suggestions;
    expect(forA.trackId).toBe("a");
    expect(forA.pairedWithTrackId).toBe("b");
    expect(forB.trackId).toBe("b");
    expect(forB.pairedWithTrackId).toBe("a");

    for (const s of suggestions) {
      expect(s.kind).toBe("eqCut");
      expect(s.freqHz).toBe(1000);
      expect(s.effect.type).toBe("eq");
      if (s.effect.type === "eq") {
        expect(s.effect.params.bands).toHaveLength(1);
        expect(s.effect.params.bands[0].freq).toBe(1000);
        expect(s.effect.params.bands[0].gainDb).toBeLessThan(0); // a cut, not a boost
        expect(s.effect.params.bands[0].type).toBe("peaking");
      }
      expect(s.reason).toContain("Vocal");
      expect(s.reason).toContain("Synth Lead");
    }
  });

  it("produces independent effect instance ids across suggestions", () => {
    const finding: MaskingFinding = {
      trackAId: "a",
      trackAName: "A",
      trackBId: "b",
      trackBName: "B",
      band: "bass",
      freqHz: 120,
      overlapScore: 0.4,
    };
    const [forA, forB] = buildMaskingSuggestions([finding]);
    expect(forA.effect.id).not.toBe(forB.effect.id);
    expect(forA.id).not.toBe(forB.id);
  });

  it("returns nothing for no findings", () => {
    expect(buildMaskingSuggestions([])).toHaveLength(0);
  });
});

describe("buildGainStagingSuggestions", () => {
  it("suggests trimming a too-quiet track up", () => {
    const finding: GainStagingFinding = {
      trackId: "c",
      trackName: "Quiet Adlib",
      rmsDb: -28,
      deltaFromMedianDb: -14,
      direction: "quieter",
    };
    const [suggestion] = buildGainStagingSuggestions([finding]);
    expect(suggestion.kind).toBe("gainTrim");
    expect(suggestion.trackId).toBe("c");
    expect(suggestion.deltaDb).toBeGreaterThan(0); // bring it up
    expect(suggestion.deltaDb).toBeCloseTo(14, 5);
    expect(suggestion.reason).toContain("Quiet Adlib");
    expect(suggestion.reason).toContain("quieter");
  });

  it("suggests trimming a too-loud track down", () => {
    const finding: GainStagingFinding = {
      trackId: "d",
      trackName: "Hot Track",
      rmsDb: -2,
      deltaFromMedianDb: 11,
      direction: "louder",
    };
    const [suggestion] = buildGainStagingSuggestions([finding]);
    expect(suggestion.deltaDb).toBeLessThan(0); // bring it down
    expect(suggestion.reason).toContain("louder");
  });

  it("returns nothing for no findings", () => {
    expect(buildGainStagingSuggestions([])).toHaveLength(0);
  });
});
