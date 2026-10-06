import type { EffectInstance } from "./effects";

/**
 * Fx chain presets (BandLab's "preajustes" of the +Fx sheet): a whole insert
 * chain under one name and cover, picked from a grid and applied to a track
 * in one tap. Factory presets ship with the app (lib/fx/factoryPresets.ts);
 * the user's own live in IndexedDB (lib/storage/fxPresetStore.ts) and are
 * global, not per project, like BandLab's "Mis preajustes".
 */

export type FxPresetCategory = "voces" | "melodicas" | "adlibs" | "pulido" | "espacio" | "efectos";

export const FX_PRESET_CATEGORIES: { id: FxPresetCategory; label: string }[] = [
  { id: "voces", label: "Voz principal" },
  { id: "melodicas", label: "Melódicas" },
  { id: "adlibs", label: "Ad-libs y coros" },
  { id: "pulido", label: "Pulido" },
  { id: "espacio", label: "Espacio" },
  { id: "efectos", label: "Efectos" },
];

export type CoverPattern = "waves" | "rings" | "grid" | "diagonal" | "dots" | "bars" | "noise" | "nebula" | "orbit" | "aurora" | "horizon" | "prism" | "dunes";

export type FxCover =
  /** Two colours and a pattern, drawn as SVG (factory covers and the
   * user's colour choice in "Detalles del preajuste"). */
  | { kind: "art"; from: string; to: string; pattern: CoverPattern }
  /** A photo the user picked, downscaled to a small JPEG data URL. */
  | { kind: "image"; dataUrl: string };

export interface FxChainPreset {
  id: string;
  name: string;
  /** Short line under the name (BandLab caps it at 50 characters). */
  description: string;
  category: FxPresetCategory | "mios";
  cover: FxCover;
  /** The chain as a template - ids are regenerated every time it is applied. */
  effects: EffectInstance[];
  blend: number;
  factory: boolean;
  /** Factory presets: whose sound it is modelled on (shown in the details). */
  reference?: string;
  /** Factory presets: the AutoPitch it is designed to sit after. */
  autoPitchHint?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** What a track remembers about its chain. */
export interface TrackFxState {
  /** Preset it came from (null = built by hand, "Personalizado"). */
  presetId: string | null;
  name: string | null;
  /** 0 = dry voice, 1 = full chain. */
  blend: number;
  /** The chain as last applied/saved (serializeChain), to tell when it has
   * unsaved edits. */
  baseline: string | null;
}

/** A chain without its ids, so two chains with the same effects and
 * settings compare equal. */
export function serializeChain(effects: EffectInstance[]): string {
  return JSON.stringify(
    effects.map((e) => ({
      type: e.type,
      bypassed: e.bypassed,
      params: e.type === "eq" ? { bands: e.params.bands.map((b) => [b.type, b.freq, b.gainDb, b.q, b.enabled]) } : e.params,
    }))
  );
}

/** Fresh copies of a template chain, with new effect (and EQ band) ids. */
export function instantiateChain(effects: EffectInstance[]): EffectInstance[] {
  return effects.map((e) => {
    const copy = structuredClone(e);
    copy.id = crypto.randomUUID();
    if (copy.type === "eq") copy.params.bands = copy.params.bands.map((b) => ({ ...b, id: crypto.randomUUID() }));
    return copy;
  });
}
