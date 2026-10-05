import { describe, expect, it } from "vitest";
import { migrateLegacyTuner } from "./legacyTuner";
import { createEffectInstance } from "@/types/effects";
import { createTrack } from "@/types/project";

function trackWith(params: Record<string, unknown>) {
  const fx = createEffectInstance("pitchCorrection");
  if (fx.type !== "pitchCorrection") throw new Error("unexpected");
  const track = createTrack("Voz", 0);
  return { ...track, inserts: [{ ...fx, params: { ...fx.params, ...params } }, createEffectInstance("compressor")] };
}

describe("migrateLegacyTuner", () => {
  it("turns the old Afinación effect into AutoPitch with the same key and scale", () => {
    const out = migrateLegacyTuner(trackWith({ key: 9, scale: "naturalMinor", retuneSpeedMs: 15, mix: 1 }));
    expect(out.autoPitch).toMatchObject({ key: 9, scale: "minor", presetId: "classic", level: 1, enabled: true });
    expect(out.inserts.map((e) => e.type)).toEqual(["compressor"]); // other effects stay
  });

  it("a gentle old tuner becomes Natural, and its mix becomes the Level", () => {
    const out = migrateLegacyTuner(trackWith({ retuneSpeedMs: 200, mix: 0.7 }));
    expect(out.autoPitch).toMatchObject({ presetId: "natural", level: 0.7 });
  });

  it("keeps the custom note set", () => {
    const out = migrateLegacyTuner(trackWith({ scale: "custom", customMask: 0b101010 }));
    expect(out.autoPitch).toMatchObject({ scale: "custom", customMask: 0b101010 });
  });

  it("leaves the constant-transpose mode alone (AutoPitch has no equivalent)", () => {
    const track = trackWith({ mode: "fixed", fixedSemitones: 3 });
    expect(migrateLegacyTuner(track)).toBe(track);
  });

  it("does not overwrite an AutoPitch the track already has", () => {
    const track = { ...trackWith({ key: 2 }), autoPitch: { ...migrateLegacyTuner(trackWith({ key: 7 })).autoPitch!, key: 7 } };
    expect(migrateLegacyTuner(track).autoPitch?.key).toBe(7);
  });

  it("a track without the old tuner is returned as is", () => {
    const track = createTrack("Voz", 0);
    expect(migrateLegacyTuner(track)).toBe(track);
  });
});
