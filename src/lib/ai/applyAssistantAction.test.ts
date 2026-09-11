import { describe, expect, it } from "vitest";
import { applyEffectAction } from "./applyAssistantAction";
import type { EffectInstance } from "@/types/effects";
import type { AssistantAction } from "@/types/assistant";

describe("applyEffectAction", () => {
  it("creates a new EQ effect with one band when the track has none", () => {
    const next = applyEffectAction([], {
      kind: "addEqBand",
      trackId: "t1",
      eqType: "peaking",
      freq: 300,
      gainDb: -3,
      q: 1.2,
    });
    expect(next).toHaveLength(1);
    expect(next[0].type).toBe("eq");
    if (next[0].type === "eq") {
      expect(next[0].params.bands).toHaveLength(1);
      expect(next[0].params.bands[0].freq).toBe(300);
    }
  });

  it("appends a second band to an existing EQ rather than replacing it", () => {
    const existingEq: EffectInstance = {
      id: "eq1",
      type: "eq",
      bypassed: false,
      params: { bands: [{ id: "b1", type: "highpass", freq: 80, gainDb: 0, q: 0.707, enabled: true }] },
    };
    const next = applyEffectAction([existingEq], {
      kind: "addEqBand",
      trackId: "t1",
      eqType: "peaking",
      freq: 3000,
      gainDb: -2,
      q: 1.4,
    });
    expect(next).toHaveLength(1); // still one EQ effect
    if (next[0].type === "eq") {
      expect(next[0].params.bands).toHaveLength(2);
      expect(next[0].params.bands[0].freq).toBe(80); // original band preserved
      expect(next[0].params.bands[1].freq).toBe(3000);
    }
  });

  it("creates a compressor when none exists", () => {
    const action: AssistantAction = {
      kind: "setCompressor",
      trackId: "t1",
      thresholdDb: -20,
      ratio: 3,
      attackMs: 10,
      releaseMs: 120,
      makeupDb: 2,
    };
    const next = applyEffectAction([], action);
    expect(next).toHaveLength(1);
    expect(next[0].type).toBe("compressor");
    if (next[0].type === "compressor") {
      expect(next[0].params.thresholdDb).toBe(-20);
      expect(next[0].params.kneeDb).toBe(6); // default, since there was no existing compressor to preserve it from
    }
  });

  it("updates an existing compressor in place instead of adding a second one", () => {
    const existing: EffectInstance = {
      id: "c1",
      type: "compressor",
      bypassed: false,
      params: { thresholdDb: -30, ratio: 4, attackMs: 5, releaseMs: 100, kneeDb: 9, makeupDb: 0 },
    };
    const action: AssistantAction = {
      kind: "setCompressor",
      trackId: "t1",
      thresholdDb: -18,
      ratio: 2.5,
      attackMs: 15,
      releaseMs: 150,
      makeupDb: 3,
    };
    const next = applyEffectAction([existing], action);
    expect(next).toHaveLength(1); // no duplicate
    expect(next[0].id).toBe("c1"); // same effect instance, updated
    if (next[0].type === "compressor") {
      expect(next[0].params.thresholdDb).toBe(-18);
      expect(next[0].params.kneeDb).toBe(9); // preserved from the existing effect, not overwritten to a default
    }
  });

  it("leaves other effects in the chain untouched", () => {
    const reverb: EffectInstance = {
      id: "r1",
      type: "reverb",
      bypassed: false,
      params: { mix: 0.2, decaySec: 1, sizeType: "room" },
    };
    const action: AssistantAction = {
      kind: "setSaturation",
      trackId: "t1",
      driveDb: 6,
      mix: 0.4,
      tone: "warm",
    };
    const next = applyEffectAction([reverb], action);
    expect(next).toHaveLength(2);
    expect(next.find((e) => e.id === "r1")).toEqual(reverb);
  });

  it("leaves inserts unchanged for a track-field action (handled elsewhere via updateTrack)", () => {
    const inserts: EffectInstance[] = [];
    const next = applyEffectAction(inserts, { kind: "setTrackVolume", trackId: "t1", volumeDb: -6 });
    expect(next).toBe(inserts);
  });
});
