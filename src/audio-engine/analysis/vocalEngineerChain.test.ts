import { describe, expect, it } from "vitest";
import { buildVocalEngineerChain } from "./vocalEngineerChain";
import { VOCAL_CHARACTER_PRESETS } from "./vocalStylePresets";
import type { VocalAnalysisResult } from "@/types/analysis";
import type { VocalStyleParams } from "@/types/vocalStyle";

const DRY_STYLE: VocalStyleParams = {
  label: "Dry (test only)",
  description: "No stylistic effects at all - isolates the skip-when-zero logic.",
  eqTiltDb: 0,
  presenceBoostDb: 0,
  saturationDriveDb: 0,
  saturationTone: "neutral",
  saturationMix: 0,
  compressionRatio: 2,
  reverbMix: 0,
  reverbSize: "room",
  delayMix: 0,
};

function cleanAnalysis(overrides: Partial<VocalAnalysisResult> = {}): VocalAnalysisResult {
  return {
    noise: "low",
    lowEnd: "low",
    mud: "low",
    harshness: "low",
    sibilance: "low",
    dynamics: "controlled",
    limitations: [],
    metrics: {
      peakDb: -6,
      rmsDb: -18,
      noiseFloorDb: -50,
      dynamicRangeDb: 10,
      clippedSampleRatio: 0,
      lowEndRelativeDb: 0,
      mudRelativeDb: 0,
      harshnessRelativeDb: 0,
      sibilanceRelativeDb: 0,
    },
    ...overrides,
  };
}

describe("buildVocalEngineerChain", () => {
  it("a clean recording + the Clean style produces a minimal chain (no gate/deesser, just a touch of room reverb)", () => {
    const chain = buildVocalEngineerChain(cleanAnalysis(), VOCAL_CHARACTER_PRESETS.clean);
    expect(chain.map((e) => e.type)).toEqual(["eq", "compressor", "reverb", "limiter"]);
  });

  it("EQ always has at least the highpass band, even with nothing else flagged", () => {
    const chain = buildVocalEngineerChain(cleanAnalysis(), VOCAL_CHARACTER_PRESETS.clean);
    const eq = chain.find((e) => e.type === "eq");
    expect(eq?.type).toBe("eq");
    if (eq?.type === "eq") {
      expect(eq.params.bands.some((b) => b.type === "highpass")).toBe(true);
    }
  });

  it("a flagged-everything recording + Rage style produces the full chain in signal-flow order", () => {
    const analysis = cleanAnalysis({
      noise: "high",
      mud: "high",
      sibilance: "high",
      dynamics: "uncontrolled",
    });
    const chain = buildVocalEngineerChain(analysis, VOCAL_CHARACTER_PRESETS.rage);
    expect(chain.map((e) => e.type)).toEqual([
      "noiseGate",
      "eq",
      "deesser",
      "compressor",
      "saturation",
      "reverb",
      "delay",
      "limiter",
    ]);
  });

  it("compressor ratio takes whichever is stronger: the style's or the corrective need", () => {
    const uncontrolled = cleanAnalysis({ dynamics: "uncontrolled" });
    // Clean style wants ratio 2, but uncontrolled dynamics need at least 3.5.
    const chain = buildVocalEngineerChain(uncontrolled, VOCAL_CHARACTER_PRESETS.clean);
    const compressor = chain.find((e) => e.type === "compressor");
    expect(compressor?.type).toBe("compressor");
    if (compressor?.type === "compressor") {
      expect(compressor.params.ratio).toBe(3.5);
    }
  });

  it("a high-ratio style wins over controlled dynamics", () => {
    const controlled = cleanAnalysis({ dynamics: "controlled" });
    const chain = buildVocalEngineerChain(controlled, VOCAL_CHARACTER_PRESETS.rage);
    const compressor = chain.find((e) => e.type === "compressor");
    if (compressor?.type === "compressor") {
      expect(compressor.params.ratio).toBe(VOCAL_CHARACTER_PRESETS.rage.compressionRatio);
    }
  });

  it("EQ tilt splits into a low shelf cut and a high shelf boost of half the tilt amount", () => {
    const chain = buildVocalEngineerChain(cleanAnalysis(), VOCAL_CHARACTER_PRESETS.bright); // tilt +3
    const eq = chain.find((e) => e.type === "eq");
    if (eq?.type === "eq") {
      const lowShelf = eq.params.bands.find((b) => b.type === "lowshelf" && b.freq === 200);
      const highShelf = eq.params.bands.find((b) => b.type === "highshelf" && b.freq === 8000);
      expect(lowShelf?.gainDb).toBeCloseTo(-1.5);
      expect(highShelf?.gainDb).toBeCloseTo(1.5);
    }
  });

  it("skips saturation/reverb/delay entirely when their mix is 0", () => {
    const chain = buildVocalEngineerChain(cleanAnalysis(), DRY_STYLE);
    expect(chain.map((e) => e.type)).toEqual(["eq", "compressor", "limiter"]);
  });

  it("every style preset produces a valid, endable chain (always ends in limiter)", () => {
    for (const style of Object.values(VOCAL_CHARACTER_PRESETS)) {
      const chain = buildVocalEngineerChain(cleanAnalysis(), style);
      expect(chain[chain.length - 1].type).toBe("limiter");
    }
  });
});
