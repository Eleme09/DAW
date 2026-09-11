import { describe, expect, it } from "vitest";
import { buildPhoneMicEnhanceChain } from "./autoChain";
import type { VocalAnalysisResult } from "@/types/analysis";

function baseAnalysis(overrides: Partial<VocalAnalysisResult> = {}): VocalAnalysisResult {
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

describe("buildPhoneMicEnhanceChain", () => {
  it("a clean recording only gets the safety limiter", () => {
    const chain = buildPhoneMicEnhanceChain(baseAnalysis());
    expect(chain.map((e) => e.type)).toEqual(["limiter"]);
  });

  it("adds a noise gate tuned above the measured noise floor when noise is flagged", () => {
    const chain = buildPhoneMicEnhanceChain(baseAnalysis({ noise: "high", metrics: { ...baseAnalysis().metrics, noiseFloorDb: -30 } }));
    const gate = chain.find((e) => e.type === "noiseGate");
    expect(gate).toBeDefined();
    if (gate?.type === "noiseGate") {
      expect(gate.params.thresholdDb).toBeGreaterThan(-30);
    }
  });

  it("adds an EQ with a mud-cutting band when mud is flagged, and it's deeper at high severity", () => {
    const mediumChain = buildPhoneMicEnhanceChain(baseAnalysis({ mud: "medium" }));
    const highChain = buildPhoneMicEnhanceChain(baseAnalysis({ mud: "high" }));
    const mediumEq = mediumChain.find((e) => e.type === "eq");
    const highEq = highChain.find((e) => e.type === "eq");
    expect(mediumEq?.type).toBe("eq");
    expect(highEq?.type).toBe("eq");
    if (mediumEq?.type === "eq" && highEq?.type === "eq") {
      const mediumBand = mediumEq.params.bands.find((b) => b.freq === 350)!;
      const highBand = highEq.params.bands.find((b) => b.freq === 350)!;
      expect(highBand.gainDb).toBeLessThan(mediumBand.gainDb); // deeper cut = more negative
    }
  });

  it("adds a de-esser only when sibilance is flagged", () => {
    expect(buildPhoneMicEnhanceChain(baseAnalysis()).some((e) => e.type === "deesser")).toBe(false);
    expect(buildPhoneMicEnhanceChain(baseAnalysis({ sibilance: "high" })).some((e) => e.type === "deesser")).toBe(true);
  });

  it("adds a compressor only when dynamics are uncontrolled", () => {
    expect(buildPhoneMicEnhanceChain(baseAnalysis()).some((e) => e.type === "compressor")).toBe(false);
    expect(buildPhoneMicEnhanceChain(baseAnalysis({ dynamics: "uncontrolled" })).some((e) => e.type === "compressor")).toBe(true);
  });

  it("keeps noise gate before EQ before de-esser before compressor before limiter", () => {
    const chain = buildPhoneMicEnhanceChain(
      baseAnalysis({ noise: "high", mud: "high", sibilance: "high", dynamics: "uncontrolled" })
    );
    const order = chain.map((e) => e.type);
    expect(order).toEqual(["noiseGate", "eq", "deesser", "compressor", "limiter"]);
  });
});
