import { describe, expect, it } from "vitest";
import {
  buildGainStagingSuggestions,
  buildMaskingSuggestions,
  buildMasterToneSuggestions,
  buildPanSuggestions,
} from "./mixSuggestions";
import { createTrack } from "@/types/project";
import type { GainStagingFinding, MaskingFinding } from "@/types/mixAnalysis";
import type { Track } from "@/types/project";

function track(id: string, name: string, pan = 0): Track {
  return { ...createTrack(name, 0), id, pan };
}

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
    expect(suggestion.reason).toContain("baja");
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
    expect(suggestion.reason).toContain("alta");
  });

  it("returns nothing for no findings", () => {
    expect(buildGainStagingSuggestions([])).toHaveLength(0);
  });
});

describe("buildPanSuggestions", () => {
  const finding: MaskingFinding = {
    trackAId: "a",
    trackAName: "Vocal",
    trackBId: "b",
    trackBName: "Synth Lead",
    band: "mid",
    freqHz: 1000,
    overlapScore: 0.5,
  };

  it("proposes moving both tracks apart when both sit near center", () => {
    const tracks = [track("a", "Vocal", 0), track("b", "Synth Lead", 0)];
    const suggestions = buildPanSuggestions([finding], tracks);
    expect(suggestions).toHaveLength(2);

    const [forA, forB] = suggestions;
    expect(forA.kind).toBe("panSeparation");
    expect(forA.trackId).toBe("a");
    expect(forA.pairedWithTrackId).toBe("b");
    expect(forA.targetPan).toBeLessThan(0);
    expect(forB.trackId).toBe("b");
    expect(forB.pairedWithTrackId).toBe("a");
    expect(forB.targetPan).toBeGreaterThan(0);
    expect(forA.reason).toContain("Vocal");
    expect(forA.reason).toContain("Synth Lead");
  });

  it("clamps the target pan to the -1..1 range", () => {
    // Not already "separated" (b sits near center), so a suggestion still fires -
    // this exercises a's target overshooting -1 and needing to clamp.
    const tracks = [track("a", "Vocal", -0.9), track("b", "Synth Lead", 0.1)];
    const [forA, forB] = buildPanSuggestions([finding], tracks);
    expect(forA.targetPan).toBe(-1);
    expect(forB.targetPan).toBeLessThanOrEqual(1);
  });

  it("skips a pair already well separated on opposite sides", () => {
    const tracks = [track("a", "Vocal", -0.6), track("b", "Synth Lead", 0.6)];
    expect(buildPanSuggestions([finding], tracks)).toHaveLength(0);
  });

  it("collapses multiple overlapping bands for the same pair into one suggestion", () => {
    const secondBand: MaskingFinding = { ...finding, band: "highMid", freqHz: 3000 };
    const tracks = [track("a", "Vocal", 0), track("b", "Synth Lead", 0)];
    const suggestions = buildPanSuggestions([finding, secondBand], tracks);
    expect(suggestions).toHaveLength(2);
  });

  it("returns nothing when a track in the finding no longer exists", () => {
    expect(buildPanSuggestions([finding], [track("a", "Vocal", 0)])).toHaveLength(0);
  });
});

describe("buildMasterToneSuggestions", () => {
  it("returns nothing when every severity is low or medium", () => {
    const suggestions = buildMasterToneSuggestions({ lowEnd: "low", mud: "medium", harshness: "low", sibilance: "medium" });
    expect(suggestions).toHaveLength(0);
  });

  it("proposes a grounded EQ cut for each high severity", () => {
    const suggestions = buildMasterToneSuggestions({ lowEnd: "low", mud: "high", harshness: "low", sibilance: "high" });
    expect(suggestions).toHaveLength(2);
    for (const s of suggestions) {
      expect(s.kind).toBe("masterTone");
      expect(s.trackId).toBe("master");
      expect(s.severity).toBe("high");
      expect(s.freqHz).toBeGreaterThan(0);
      expect(s.effect.type).toBe("eq");
      if (s.effect.type === "eq") {
        expect(s.effect.params.bands[0].gainDb).toBeLessThan(0);
      }
    }
    const mudSuggestion = suggestions.find((s) => s.band === "lowMid");
    expect(mudSuggestion?.freqHz).toBeCloseTo(Math.sqrt(250 * 500), 1);
    const sibilanceSuggestion = suggestions.find((s) => s.band === "sibilance");
    expect(sibilanceSuggestion?.freqHz).toBeCloseTo(Math.sqrt(5000 * 9000), 1);
  });

  it("fires on all four kinds independently", () => {
    const suggestions = buildMasterToneSuggestions({ lowEnd: "high", mud: "high", harshness: "high", sibilance: "high" });
    expect(suggestions).toHaveLength(4);
    expect(new Set(suggestions.map((s) => s.band))).toEqual(new Set(["bass", "lowMid", "highMid", "sibilance"]));
  });
});
