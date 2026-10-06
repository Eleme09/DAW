import type { EffectType } from "@/types/effects";

/**
 * The effect library as the user sees it: one entry per effect we ship
 * (no five versions of the same thing), each with its own name, a line on
 * what it is for, a library category and a "skin" - the colour/material of
 * its face, so a compressor never looks like a reverb (the references: CLA-2A,
 * Pro-Q, Valhalla, API 560). "Afinación" (pitchCorrection) is not offered:
 * AutoPitch is the tuner.
 */

export type FxLibraryCategory = "eq" | "dinamica" | "limpieza" | "color" | "espacio" | "modulacion" | "creativos";

export const FX_LIBRARY_CATEGORIES: { id: FxLibraryCategory | "recomendados" | "favoritos"; label: string }[] = [
  { id: "recomendados", label: "Recomendados" },
  { id: "favoritos", label: "Favoritos" },
  { id: "eq", label: "EQ" },
  { id: "dinamica", label: "Dinámica" },
  { id: "limpieza", label: "Limpieza" },
  { id: "color", label: "Color" },
  { id: "espacio", label: "Espacio" },
  { id: "modulacion", label: "Modulación" },
  { id: "creativos", label: "Creativos" },
];

export interface FxSkin {
  /** Panel background (CSS). */
  panel: string;
  /** Box/section background inside the panel. */
  box: string;
  /** Main text and knob-line colour on the panel. */
  ink: string;
  /** Secondary text. */
  ink2: string;
  /** Accent: active states, arcs, the display trace. */
  accent: string;
  /** Knob body. */
  knob: "black" | "cream" | "chrome" | "white";
  /** True when the panel is light (dark text). */
  light?: boolean;
}

export interface FxCatalogEntry {
  type: EffectType;
  name: string;
  kind: string;
  description: string;
  category: FxLibraryCategory;
  skin: FxSkin;
}

const DARK_INK = "#f2ede4";

export const FX_CATALOG: Record<Exclude<EffectType, "pitchCorrection">, FxCatalogEntry> = {
  eq: {
    type: "eq",
    name: "Prisma EQ",
    kind: "Ecualizador",
    description: "Curva visual con espectro en vivo: quita barro, suma presencia y aire.",
    category: "eq",
    skin: { panel: "linear-gradient(180deg,#141a26 0%,#0c1018 100%)", box: "#0a0d14", ink: DARK_INK, ink2: "#8b93a6", accent: "#f2b84b", knob: "black" },
  },
  compressor: {
    type: "compressor",
    name: "Opto Comp",
    kind: "Compresor",
    description: "Compresor óptico: dos perillas y la voz queda pareja y al frente.",
    category: "dinamica",
    skin: {
      panel: "linear-gradient(180deg,#d9d6cf 0%,#b9b5ac 100%)",
      box: "#2a2a2c",
      ink: "#1b1b1d",
      ink2: "#55534e",
      accent: "#b3261e",
      knob: "chrome",
      light: true,
    },
  },
  multibandCompressor: {
    type: "multibandCompressor",
    name: "Tri-Band",
    kind: "Compresor multibanda",
    description: "Controla graves, medios y agudos por separado.",
    category: "dinamica",
    skin: { panel: "linear-gradient(180deg,#10201f 0%,#0a1414 100%)", box: "#071010", ink: DARK_INK, ink2: "#7fa39e", accent: "#4fd1c5", knob: "black" },
  },
  limiter: {
    type: "limiter",
    name: "Techo",
    kind: "Limitador",
    description: "Nada pasa del techo: más volumen sin clips.",
    category: "dinamica",
    skin: { panel: "linear-gradient(180deg,#1d1d20 0%,#121214 100%)", box: "#0b0b0c", ink: DARK_INK, ink2: "#8d8a85", accent: "#e5243b", knob: "black" },
  },
  clipper: {
    type: "clipper",
    name: "Clip",
    kind: "Clipper",
    description: "Recorta los picos en seco: ataque agresivo, más fuerte.",
    category: "dinamica",
    skin: { panel: "linear-gradient(180deg,#24170f 0%,#150d08 100%)", box: "#0e0805", ink: DARK_INK, ink2: "#a38b7a", accent: "#ff7a1a", knob: "black" },
  },
  noiseGate: {
    type: "noiseGate",
    name: "Puerta",
    kind: "Gate",
    description: "Silencia el ruido entre frases.",
    category: "limpieza",
    skin: { panel: "linear-gradient(180deg,#18201a 0%,#0e140f 100%)", box: "#090d0a", ink: DARK_INK, ink2: "#8ea394", accent: "#8fb89a", knob: "black" },
  },
  deesser: {
    type: "deesser",
    name: "Sibila",
    kind: "De-esser",
    description: "Baja las eses y las tes que pican.",
    category: "limpieza",
    skin: { panel: "linear-gradient(180deg,#121c22 0%,#0a1115 100%)", box: "#070b0e", ink: DARK_INK, ink2: "#86a0ad", accent: "#5ec8e5", knob: "black" },
  },
  saturation: {
    type: "saturation",
    name: "Tubo",
    kind: "Saturación",
    description: "Calor de válvula o grit de rage: cuerpo y armónicos.",
    category: "color",
    skin: { panel: "linear-gradient(180deg,#3a2414 0%,#1f130a 100%)", box: "#150c06", ink: "#f6e3c8", ink2: "#c49a72", accent: "#ff9a3c", knob: "cream" },
  },
  exciter: {
    type: "exciter",
    name: "Aire",
    kind: "Excitador",
    description: "Brillo y aire arriba sin subir el siseo.",
    category: "color",
    skin: { panel: "linear-gradient(180deg,#1b2a3a 0%,#0f1822 100%)", box: "#0a1118", ink: DARK_INK, ink2: "#94aec6", accent: "#9fd3ff", knob: "white" },
  },
  reverb: {
    type: "reverb",
    name: "Espacio",
    kind: "Reverb",
    description: "Cuarto, sala o placa, con pre-delay y cola filtrada.",
    category: "espacio",
    skin: { panel: "linear-gradient(180deg,#2c2f86 0%,#1d1f5c 100%)", box: "rgba(10,12,48,0.55)", ink: "#f4f3ff", ink2: "#aeb1e8", accent: "#c7c9ff", knob: "black" },
  },
  delay: {
    type: "delay",
    name: "Eco",
    kind: "Delay",
    description: "Ecos al tempo, ping-pong y repeticiones filtradas.",
    category: "espacio",
    skin: { panel: "linear-gradient(180deg,#0f4a52 0%,#0a2f35 100%)", box: "rgba(3,22,26,0.55)", ink: "#eefcfd", ink2: "#9fd0d6", accent: "#7ef0ff", knob: "black" },
  },
  chorus: {
    type: "chorus",
    name: "Doble",
    kind: "Chorus / doblaje",
    description: "Engrosa la voz como si la hubieras doblado.",
    category: "modulacion",
    skin: { panel: "linear-gradient(180deg,#123129 0%,#0b1f1a 100%)", box: "#071512", ink: DARK_INK, ink2: "#8fbfb1", accent: "#6ff2c2", knob: "black" },
  },
  flanger: {
    type: "flanger",
    name: "Jet",
    kind: "Flanger",
    description: "Barrido metálico de avión.",
    category: "modulacion",
    skin: { panel: "linear-gradient(180deg,#331230 0%,#1f0b1d 100%)", box: "#150713", ink: DARK_INK, ink2: "#c48fbd", accent: "#ff6ad5", knob: "black" },
  },
  autoPan: {
    type: "autoPan",
    name: "Péndulo",
    kind: "Auto-pan",
    description: "Mueve la voz de un lado a otro.",
    category: "modulacion",
    skin: { panel: "linear-gradient(180deg,#36210d 0%,#211407 100%)", box: "#160d04", ink: DARK_INK, ink2: "#c9a27a", accent: "#ffb547", knob: "black" },
  },
  stereoWidth: {
    type: "stereoWidth",
    name: "Ancho",
    kind: "Imagen estéreo",
    description: "Abre o cierra el estéreo (en coros y dobles).",
    category: "modulacion",
    skin: { panel: "linear-gradient(180deg,#1e1a3d 0%,#121026 100%)", box: "#0b0a19", ink: DARK_INK, ink2: "#a39ed6", accent: "#a99bff", knob: "black" },
  },
  vocoder: {
    type: "vocoder",
    name: "Robot",
    kind: "Vocoder",
    description: "La voz convertida en sintetizador.",
    category: "creativos",
    skin: { panel: "linear-gradient(180deg,#0c1f0e 0%,#061108 100%)", box: "#030a04", ink: "#d8ffd9", ink2: "#79b47d", accent: "#3dff6a", knob: "black" },
  },
};

export type OfferedEffectType = keyof typeof FX_CATALOG;

export const OFFERED_EFFECTS = Object.keys(FX_CATALOG) as OfferedEffectType[];

/** The "Recomendados" list: what a vocal chain is made of, in chain order. */
export const RECOMMENDED_EFFECTS: OfferedEffectType[] = ["eq", "compressor", "deesser", "saturation", "exciter", "reverb", "delay", "chorus", "limiter"];

export function catalogEntry(type: EffectType): FxCatalogEntry | null {
  return type === "pitchCorrection" ? null : FX_CATALOG[type];
}

/** What a track's Fx pill says: the preset's name, "Personalizado" for a
 * hand-built chain (BandLab: "Fx My Preset (22)" / "Fx Personalizado"). */
export function fxChipLabel(track: { inserts: { type: EffectType }[]; fx?: { name: string | null } }): string {
  if (track.inserts.length === 0) return "";
  return track.fx?.name ?? "Personalizado";
}
