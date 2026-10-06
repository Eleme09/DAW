import type { AutoPitchCategory, AutoPitchScale, AutoPitchSettings } from "@/types/autoPitch";

/** Núcleo's energy colours, one per group of presets. */
export const NUCLEO_COLORS: Record<AutoPitchCategory, string> = {
  tune: "#3ee8c4",
  choir: "#a98bff",
  texture: "#ff8a3d",
  space: "#4da3ff",
};

const SCALE_STEPS: Record<Exclude<AutoPitchScale, "custom" | "chromatic">, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
};

/** The notes the voice is pulled to, as absolute pitch classes (0 = Do).
 * The custom mask is relative to the key, as the worklet reads it. */
export function scalePitchClasses(settings: Pick<AutoPitchSettings, "key" | "scale" | "customMask">): Set<number> {
  const key = ((settings.key % 12) + 12) % 12;
  if (settings.scale === "chromatic") return new Set(Array.from({ length: 12 }, (_, i) => i));
  const rel =
    settings.scale === "custom"
      ? Array.from({ length: 12 }, (_, i) => i).filter((i) => settings.customMask & (1 << i))
      : SCALE_STEPS[settings.scale];
  const steps = rel.length ? rel : Array.from({ length: 12 }, (_, i) => i);
  return new Set(steps.map((s) => (s + key) % 12));
}

/** Bit of the (key-relative) custom mask that holds absolute pitch class `pc`. */
export function customMaskBit(pc: number, key: number): number {
  return 1 << ((((pc - key) % 12) + 12) % 12);
}
