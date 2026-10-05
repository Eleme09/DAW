import { createAutoPitchSettings, type AutoPitchScale, type AutoPitchSettings } from "@/types/autoPitch";
import type { PitchCorrectionParams } from "@/types/effects";
import type { Track } from "@/types/project";

/**
 * The app used to have two tuners: the "Afinación" effect in the Fx list and
 * AutoPitch. They did the same job, so AutoPitch is now the only one. A
 * project saved with the old effect gets it converted when it opens: same key
 * and scale, "Classic" if it tuned fast and "Natural" if it tuned gently, and
 * the old dry/wet mix becomes the Level. The one thing AutoPitch has no
 * equivalent for is the old constant-transpose mode, so a track using that
 * keeps its effect untouched.
 */

const SCALES: Record<PitchCorrectionParams["scale"], AutoPitchScale> = {
  major: "major",
  naturalMinor: "minor",
  harmonicMinor: "minor",
  chromatic: "chromatic",
  custom: "custom",
};

export function autoPitchFromLegacy(params: PitchCorrectionParams): AutoPitchSettings {
  const base = createAutoPitchSettings(params.key, SCALES[params.scale] ?? "major");
  return {
    ...base,
    presetId: params.retuneSpeedMs <= 40 ? "classic" : "natural",
    level: Math.min(1, Math.max(0.3, params.mix)),
    customMask: params.customMask ?? base.customMask,
  };
}

/** Returns the track unchanged unless it carries a convertible old tuner. */
export function migrateLegacyTuner(track: Track): Track {
  const legacy = track.inserts.find((e) => e.type === "pitchCorrection");
  if (!legacy || legacy.type !== "pitchCorrection" || legacy.params.mode === "fixed") return track;
  return {
    ...track,
    autoPitch: track.autoPitch ?? autoPitchFromLegacy(legacy.params),
    inserts: track.inserts.filter((e) => e.id !== legacy.id),
  };
}
