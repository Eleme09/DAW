import { describe, expect, it } from "vitest";
import { describeAssistantAction, parseToolUse } from "./assistantTools";

describe("parseToolUse", () => {
  it("parses a valid set_track_volume call", () => {
    const action = parseToolUse("set_track_volume", { trackId: "t1", volumeDb: -6 });
    expect(action).toEqual({ kind: "setTrackVolume", trackId: "t1", volumeDb: -6 });
  });

  it("parses a valid add_eq_band call", () => {
    const action = parseToolUse("add_eq_band", { trackId: "t1", eqType: "peaking", freq: 300, gainDb: -3, q: 1.2 });
    expect(action).toEqual({ kind: "addEqBand", trackId: "t1", eqType: "peaking", freq: 300, gainDb: -3, q: 1.2 });
  });

  it("parses a valid set_reverb call", () => {
    const action = parseToolUse("set_reverb", { trackId: "t1", mix: 0.3, decaySec: 1.5, sizeType: "hall" });
    expect(action).toEqual({ kind: "setReverb", trackId: "t1", mix: 0.3, decaySec: 1.5, sizeType: "hall" });
  });

  it("rejects a missing trackId", () => {
    expect(parseToolUse("set_track_volume", { volumeDb: -6 })).toBeNull();
  });

  it("rejects a wrong-typed field", () => {
    expect(parseToolUse("set_track_volume", { trackId: "t1", volumeDb: "loud" })).toBeNull();
  });

  it("rejects a missing required field", () => {
    expect(parseToolUse("set_compressor", { trackId: "t1", thresholdDb: -20, ratio: 3 })).toBeNull();
  });

  it("rejects an out-of-enum value", () => {
    expect(parseToolUse("add_eq_band", { trackId: "t1", eqType: "bandpass", freq: 300, gainDb: 0, q: 1 })).toBeNull();
    expect(parseToolUse("set_reverb", { trackId: "t1", mix: 0.3, decaySec: 1, sizeType: "cathedral" })).toBeNull();
  });

  it("rejects an unknown tool name", () => {
    expect(parseToolUse("delete_everything", { trackId: "t1" })).toBeNull();
  });
});

describe("describeAssistantAction", () => {
  it("produces a readable description referencing the track name", () => {
    const desc = describeAssistantAction({ kind: "setTrackVolume", trackId: "t1", volumeDb: -3 }, "Vocal");
    expect(desc).toContain("Vocal");
    expect(desc).toContain("-3.0");
  });

  it("covers every action kind without throwing", () => {
    const trackId = "t1";
    const actions = [
      { kind: "setTrackVolume", trackId, volumeDb: -3 },
      { kind: "setTrackPan", trackId, pan: 0.5 },
      { kind: "setTrackMute", trackId, muted: true },
      { kind: "setTrackSolo", trackId, solo: true },
      { kind: "addEqBand", trackId, eqType: "peaking", freq: 300, gainDb: -2, q: 1 },
      { kind: "setCompressor", trackId, thresholdDb: -20, ratio: 3, attackMs: 10, releaseMs: 120, makeupDb: 2 },
      { kind: "setReverb", trackId, mix: 0.3, decaySec: 1.5, sizeType: "hall" },
      { kind: "setDelay", trackId, timeMs: 350, feedback: 0.3, mix: 0.25 },
      { kind: "setSaturation", trackId, driveDb: 6, mix: 0.4, tone: "warm" },
    ] as const;
    for (const action of actions) {
      expect(typeof describeAssistantAction(action, "Vocal")).toBe("string");
    }
  });
});
