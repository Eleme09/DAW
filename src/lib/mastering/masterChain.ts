import type { EffectInstance, EqBand } from "@/types/effects";
import type { MasterStyle, MasterTarget, MasteringSettings } from "@/types/project";

/**
 * Mastering styles - ours, built as a mastering engineer would chain it:
 * tone (EQ) -> density (3-band compressor) -> glue (slow bus compressor)
 * -> colour (saturation) -> air (exciter) -> width -> limiter. Every style
 * has the SAME chain with the same ids, only the numbers change, so
 * switching style or moving a control glides instead of re-plugging the
 * chain. The mix arrives at MIX_REF_LUFS (inputGainDb, measured), so the
 * thresholds below mean the same thing for any mix; the limiter push
 * (driveDb, measured) lands the loudest part on the target.
 */

/** Level the chain is built for (integrated, loudest 30 s). */
export const MIX_REF_LUFS = -16;

export const TARGET_LUFS: Record<MasterTarget, number> = {
  plataformas: -14,
  fuerte: -10,
  maximo: -9,
};

export const TARGET_INFO: Record<MasterTarget, { label: string; hint: string }> = {
  plataformas: { label: "Plataformas", hint: "−14 LUFS: lo que Spotify y YouTube dejan sin bajar. Más dinámica." },
  fuerte: { label: "Fuerte", hint: "−10 LUFS: denso y competitivo para rap y trap." },
  maximo: { label: "Máximo", hint: "−9 LUFS o lo más cerca que el limitador llegue sin distorsionar. Pierde algo de golpe." },
};

/** Sample-peak ceiling (≈ −1 dBTP after the limiter's own overs). */
export const CEILING_DB = -1;

interface StyleDef {
  label: string;
  hint: string;
  /** Tone: low shelf 90 Hz, low-mid bell 280 Hz, presence bell 3 kHz, high shelf 10 kHz (dB at normal). */
  eq: [number, number, number, number];
  /** 3-band density: thresholds below the reference and ratios. */
  mb: { low: [number, number]; mid: [number, number]; high: [number, number] };
  glue: { ratio: number; attackMs: number };
  sat: { driveDb: number; mix: number; tone: "warm" | "neutral" | "bright" };
  air: number;
  width: number;
  /** Lands this many dB under the target (open styles breathe). */
  offsetDb: number;
}

export const MASTER_STYLES: Record<MasterStyle, StyleDef> = {
  equilibrio: {
    label: "Equilibrio",
    hint: "Para todo: tono parejo, pegado y fuerte.",
    eq: [1, -1, 1, 1.5],
    mb: { low: [6, 2.5], mid: [5, 2], high: [6, 2] },
    glue: { ratio: 2, attackMs: 20 },
    sat: { driveDb: 4, mix: 0.15, tone: "neutral" },
    air: 0.05,
    width: 1.05,
    offsetDb: 0,
  },
  peso: {
    label: "Peso",
    hint: "808 y bombo al frente sin tapar la voz.",
    eq: [3, -2, 1.5, 1],
    mb: { low: [8, 3.5], mid: [4, 1.8], high: [6, 2] },
    glue: { ratio: 2, attackMs: 25 },
    sat: { driveDb: 6, mix: 0.2, tone: "warm" },
    air: 0.03,
    width: 1,
    offsetDb: 0,
  },
  brillo: {
    label: "Brillo",
    hint: "Aire y claridad arriba, la voz bien definida.",
    eq: [0, -1.5, 2, 3.5],
    mb: { low: [5, 2], mid: [5, 2], high: [4, 1.8] },
    glue: { ratio: 1.8, attackMs: 20 },
    sat: { driveDb: 3, mix: 0.1, tone: "bright" },
    air: 0.12,
    width: 1.1,
    offsetDb: 0,
  },
  calido: {
    label: "Cálido",
    hint: "Saturación de cinta, agudos suaves, cuerpo.",
    eq: [1.5, 0.5, -0.5, -1.5],
    mb: { low: [6, 2.2], mid: [6, 2.2], high: [8, 2.5] },
    glue: { ratio: 2.5, attackMs: 30 },
    sat: { driveDb: 9, mix: 0.35, tone: "warm" },
    air: 0,
    width: 1,
    offsetDb: 0,
  },
  abierto: {
    label: "Abierto",
    hint: "Toque ligero: conserva la dinámica y respira (queda 2 dB más suave).",
    eq: [0.5, -0.5, 0.5, 1],
    mb: { low: [3, 1.6], mid: [3, 1.5], high: [3, 1.5] },
    glue: { ratio: 1.5, attackMs: 30 },
    sat: { driveDb: 2, mix: 0.08, tone: "neutral" },
    air: 0.04,
    width: 1.05,
    offsetDb: -2,
  },
  amplio: {
    label: "Amplio",
    hint: "Estéreo más ancho y aire; los graves siguen al centro.",
    eq: [1, -1, 0.5, 2],
    mb: { low: [6, 2.5], mid: [5, 2], high: [5, 2] },
    glue: { ratio: 2, attackMs: 20 },
    sat: { driveDb: 3, mix: 0.12, tone: "neutral" },
    air: 0.08,
    width: 1.35,
    offsetDb: 0,
  },
  epico: {
    label: "Épico",
    hint: "Profundo y grande: graves hondos, aire y amplitud.",
    eq: [2.5, -1.5, 0.5, 2.5],
    mb: { low: [6, 2.5], mid: [4, 1.8], high: [5, 2] },
    glue: { ratio: 2, attackMs: 30 },
    sat: { driveDb: 4, mix: 0.15, tone: "warm" },
    air: 0.08,
    width: 1.2,
    offsetDb: -1,
  },
  golpe: {
    label: "Golpe",
    hint: "Pegada: deja pasar el ataque y aprieta lo de atrás.",
    eq: [1.5, -1.5, 2, 1],
    mb: { low: [7, 3], mid: [7, 3], high: [6, 2.5] },
    glue: { ratio: 3, attackMs: 45 },
    sat: { driveDb: 6, mix: 0.2, tone: "neutral" },
    air: 0.04,
    width: 1.05,
    offsetDb: 0,
  },
};

export const MASTER_STYLE_ORDER: MasterStyle[] = ["equilibrio", "peso", "brillo", "calido", "abierto", "amplio", "epico", "golpe"];

/** Loudness the master should land on, LUFS. */
export function targetLufsOf(s: Pick<MasteringSettings, "target" | "style">): number {
  return TARGET_LUFS[s.target] + MASTER_STYLES[s.style].offsetDb;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

function band(id: string, type: EqBand["type"], freq: number, gainDb: number, q = 0.707): EqBand {
  return { id, type, freq, gainDb: r1(gainDb), q, enabled: true };
}

/** The chain for these settings (stable ids: re-applying only moves params). */
export function masteringChain(s: MasteringSettings): EffectInstance[] {
  const st = MASTER_STYLES[s.style];
  const t = Math.min(1, Math.max(0, s.intensity));
  // 0 -> half the style, 0.5 -> the style, 1 -> 1.5x
  const k = 0.5 + t;
  const [lo, lm, pr, hi] = st.eq;
  const thr = (below: number) => r1(MIX_REF_LUFS + 4 - below * k);
  const ratio = (r: number) => r1(1 + (r - 1) * k);
  return [
    {
      id: "m-eq",
      type: "eq",
      bypassed: false,
      params: {
        bands: [
          band("m-hp", "highpass", 25, 0),
          band("m-lo", "lowshelf", 90, lo * k + s.lowDb),
          band("m-lm", "peaking", 280, lm * k, 0.9),
          band("m-mid", "peaking", 1000, s.midDb, 0.7),
          band("m-pr", "peaking", 3000, pr * k, 0.9),
          band("m-hi", "highshelf", 10000, hi * k + s.highDb),
        ],
      },
    },
    {
      id: "m-mb",
      type: "multibandCompressor",
      bypassed: false,
      params: {
        lowMidFreq: 150,
        midHighFreq: 4000,
        attackMs: 15,
        releaseMs: 120,
        low: { thresholdDb: thr(st.mb.low[0]), ratio: ratio(st.mb.low[1]), makeupDb: 0 },
        mid: { thresholdDb: thr(st.mb.mid[0]), ratio: ratio(st.mb.mid[1]), makeupDb: 0 },
        high: { thresholdDb: thr(st.mb.high[0]), ratio: ratio(st.mb.high[1]), makeupDb: 0 },
      },
    },
    {
      id: "m-glue",
      type: "compressor",
      bypassed: false,
      params: { thresholdDb: thr(4), ratio: ratio(st.glue.ratio), attackMs: st.glue.attackMs, releaseMs: 150, kneeDb: 6, makeupDb: 0 },
    },
    { id: "m-sat", type: "saturation", bypassed: false, params: { driveDb: r1(st.sat.driveDb * k), mix: r2(Math.min(1, st.sat.mix * k)), tone: st.sat.tone } },
    { id: "m-air", type: "exciter", bypassed: false, params: { freq: 7500, driveDb: 6, mix: r2(Math.min(1, st.air * k)) } },
    { id: "m-width", type: "stereoWidth", bypassed: false, params: { width: r2(1 + (st.width - 1) * k) } },
    { id: "m-lim", type: "limiter", bypassed: false, params: { thresholdDb: -r1(Math.max(0, s.driveDb)), releaseMs: 60, ceilingDb: CEILING_DB } },
  ];
}
