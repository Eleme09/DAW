import { describe, expect, it } from "vitest";
import { PLATFORM_LUFS_TARGETS, suggestMasteringGain } from "./masteringTargets";

describe("suggestMasteringGain", () => {
  it("suggests turning up a quiet mix to reach the target", () => {
    const result = suggestMasteringGain(-20, "spotify");
    expect(result.targetLufs).toBe(PLATFORM_LUFS_TARGETS.spotify);
    expect(result.deltaDb).toBeCloseTo(6, 5); // -20 -> -14 is +6dB
  });

  it("suggests turning down a loud mix to reach the target", () => {
    const result = suggestMasteringGain(-8, "appleMusic");
    expect(result.deltaDb).toBeCloseTo(-8, 5); // -8 -> -16 is -8dB
  });

  it("suggests no change when already at the target", () => {
    const result = suggestMasteringGain(PLATFORM_LUFS_TARGETS.youtube, "youtube");
    expect(result.deltaDb).toBeCloseTo(0, 5);
  });

  it("suggests no change (rather than an infinite jump) for silence", () => {
    const result = suggestMasteringGain(-Infinity, "spotify");
    expect(result.deltaDb).toBe(0);
  });

  it("has a target for every listed platform", () => {
    for (const platform of Object.keys(PLATFORM_LUFS_TARGETS) as Array<keyof typeof PLATFORM_LUFS_TARGETS>) {
      const result = suggestMasteringGain(-14, platform);
      expect(Number.isFinite(result.targetLufs)).toBe(true);
    }
  });
});
