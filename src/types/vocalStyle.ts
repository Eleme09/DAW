import type { ReverbParams, SaturationParams } from "./effects";

/**
 * Parameters for one vocal-style preset — everything it takes to shape the
 * existing Phase 3 effect toolset (EQ tilt/presence, saturation, comp,
 * reverb, delay) into a recognizable character. These are starting points
 * the user can still hand-edit afterward in the Effects Rack, not locked
 * presets — see PROJECT_SPEC.md section 6/7: characteristics, not clones
 * of any commercial plugin or artist's actual chain.
 */
export interface VocalStyleParams {
  label: string;
  description: string;
  /** Shelf tilt in dB: negative = darker/bass-forward, positive = brighter. */
  eqTiltDb: number;
  /** Extra boost around 3-5kHz for forwardness/lead presence. */
  presenceBoostDb: number;
  saturationDriveDb: number;
  saturationTone: SaturationParams["tone"];
  saturationMix: number;
  /** Baseline compression ratio this style wants, independent of corrective needs. */
  compressionRatio: number;
  reverbMix: number;
  reverbSize: ReverbParams["sizeType"];
  delayMix: number;
}

export type VocalCharacter =
  | "clean"
  | "natural"
  | "bright"
  | "dark"
  | "aggressive"
  | "melodic"
  | "trap"
  | "rage"
  | "cinematic"
  | "radio"
  | "lead"
  | "adlib"
  | "double";

export type GenreStyle =
  | "rageStyle"
  | "atmosphericTrap"
  | "experimentalUrban"
  | "darkCinematicUrban"
  | "aggressiveUrban"
  | "hardUrban"
  | "modernLatinUrban"
  | "darkMelodicUrban";
