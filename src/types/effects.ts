/**
 * Declarative effect-chain model. This is the serializable half of Phase 3
 * — the state layer describes *what* is inserted, in what order, with what
 * parameters; src/audio-engine/effects/ turns that into real audio nodes.
 * Same split as Track/Project vs. AudioEngine (see ARCHITECTURE.md).
 */

export type EffectId = string;

export interface EqBand {
  id: string;
  type: "highpass" | "lowshelf" | "peaking" | "highshelf" | "lowpass";
  freq: number;
  gainDb: number;
  q: number;
  enabled: boolean;
}

export interface EqParams {
  bands: EqBand[];
}

export interface CompressorParams {
  thresholdDb: number;
  ratio: number;
  attackMs: number;
  releaseMs: number;
  kneeDb: number;
  makeupDb: number;
}

/** Split-band de-esser: compresses only the sibilant band above `freq`. */
export interface DeEsserParams {
  freq: number;
  thresholdDb: number;
  ratio: number;
}

export interface SaturationParams {
  driveDb: number;
  mix: number; // 0..1
  tone: "warm" | "neutral" | "bright";
}

export interface LimiterParams {
  thresholdDb: number;
  releaseMs: number;
  ceilingDb: number;
}

export interface ClipperParams {
  ceilingDb: number;
}

/** Envelope-follower gate, not spectral noise reduction — see AUDIO_ENGINE.md. */
export interface NoiseGateParams {
  thresholdDb: number;
  attackMs: number;
  releaseMs: number;
  holdMs: number;
}

export interface ReverbParams {
  mix: number; // 0..1
  decaySec: number;
  sizeType: "room" | "hall" | "plate";
}

export interface DelayParams {
  timeMs: number;
  feedback: number; // 0..0.95
  mix: number; // 0..1
  filterFreq: number;
}

export type EffectInstance =
  | { id: EffectId; type: "eq"; bypassed: boolean; params: EqParams }
  | { id: EffectId; type: "compressor"; bypassed: boolean; params: CompressorParams }
  | { id: EffectId; type: "deesser"; bypassed: boolean; params: DeEsserParams }
  | { id: EffectId; type: "saturation"; bypassed: boolean; params: SaturationParams }
  | { id: EffectId; type: "limiter"; bypassed: boolean; params: LimiterParams }
  | { id: EffectId; type: "clipper"; bypassed: boolean; params: ClipperParams }
  | { id: EffectId; type: "noiseGate"; bypassed: boolean; params: NoiseGateParams }
  | { id: EffectId; type: "reverb"; bypassed: boolean; params: ReverbParams }
  | { id: EffectId; type: "delay"; bypassed: boolean; params: DelayParams };

export type EffectType = EffectInstance["type"];

export const EFFECT_LABELS: Record<EffectType, string> = {
  eq: "EQ",
  compressor: "Compressor",
  deesser: "De-Esser",
  saturation: "Saturation",
  limiter: "Limiter",
  clipper: "Clipper",
  noiseGate: "Noise Gate",
  reverb: "Reverb",
  delay: "Delay",
};

function defaultEqParams(): EqParams {
  return {
    bands: [
      { id: crypto.randomUUID(), type: "highpass", freq: 80, gainDb: 0, q: 0.707, enabled: true },
      { id: crypto.randomUUID(), type: "peaking", freq: 300, gainDb: 0, q: 1, enabled: true },
      { id: crypto.randomUUID(), type: "peaking", freq: 2500, gainDb: 0, q: 1, enabled: true },
      { id: crypto.randomUUID(), type: "highshelf", freq: 8000, gainDb: 0, q: 0.707, enabled: true },
    ],
  };
}

export function createEffectInstance(type: EffectType): EffectInstance {
  const id = crypto.randomUUID();
  switch (type) {
    case "eq":
      return { id, type, bypassed: false, params: defaultEqParams() };
    case "compressor":
      return {
        id,
        type,
        bypassed: false,
        params: { thresholdDb: -24, ratio: 3, attackMs: 10, releaseMs: 120, kneeDb: 6, makeupDb: 0 },
      };
    case "deesser":
      return { id, type, bypassed: false, params: { freq: 6500, thresholdDb: -30, ratio: 4 } };
    case "saturation":
      return { id, type, bypassed: false, params: { driveDb: 6, mix: 0.4, tone: "warm" } };
    case "limiter":
      return { id, type, bypassed: false, params: { thresholdDb: -6, releaseMs: 80, ceilingDb: -0.3 } };
    case "clipper":
      return { id, type, bypassed: false, params: { ceilingDb: -0.5 } };
    case "noiseGate":
      return {
        id,
        type,
        bypassed: false,
        params: { thresholdDb: -45, attackMs: 2, releaseMs: 150, holdMs: 50 },
      };
    case "reverb":
      return { id, type, bypassed: false, params: { mix: 0.25, decaySec: 1.8, sizeType: "hall" } };
    case "delay":
      return { id, type, bypassed: false, params: { timeMs: 350, feedback: 0.35, mix: 0.25, filterFreq: 4000 } };
  }
}
