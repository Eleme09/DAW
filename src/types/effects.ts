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

/**
 * 3-band split via standard 2nd-order (12dB/oct) filters, not a
 * phase-corrected Linkwitz-Riley crossover — a known simplification
 * (some band overlap/coloration right at the crossover points), named
 * here rather than hidden. Attack/release are shared across bands;
 * threshold/ratio/makeup are per-band.
 */
export interface MultibandBandParams {
  thresholdDb: number;
  ratio: number;
  makeupDb: number;
}

export interface MultibandCompressorParams {
  lowMidFreq: number;
  midHighFreq: number;
  attackMs: number;
  releaseMs: number;
  low: MultibandBandParams;
  mid: MultibandBandParams;
  high: MultibandBandParams;
}

export interface ChorusParams {
  rateHz: number;
  depthMs: number;
  mix: number; // 0..1
}

export interface FlangerParams {
  rateHz: number;
  depthMs: number;
  feedback: number; // 0..0.9
  mix: number; // 0..1
}

/**
 * Adds high-frequency harmonic "air" by saturating a highpassed copy of
 * the signal and blending it back in on top of the untouched dry signal
 * (not a dry/wet crossfade — the exciter adds, it doesn't replace).
 */
export interface ExciterParams {
  freq: number;
  driveDb: number;
  mix: number; // 0..1, how much excited top-end gets blended in
}

export interface AutoPanParams {
  rateHz: number;
  depth: number; // 0..1, max L/R deviation from center
}

/**
 * Mid-side width control. Only audibly does anything on genuinely
 * stereo material (e.g. panned tracks summed on the master, or a
 * stereo import) — a single dead-center mono source has no side signal
 * to widen. Named here rather than presented as a universal fix.
 */
export interface StereoWidthParams {
  width: number; // 0 = mono, 1 = unity/original, >1 = wider
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
  | { id: EffectId; type: "delay"; bypassed: boolean; params: DelayParams }
  | { id: EffectId; type: "multibandCompressor"; bypassed: boolean; params: MultibandCompressorParams }
  | { id: EffectId; type: "chorus"; bypassed: boolean; params: ChorusParams }
  | { id: EffectId; type: "flanger"; bypassed: boolean; params: FlangerParams }
  | { id: EffectId; type: "exciter"; bypassed: boolean; params: ExciterParams }
  | { id: EffectId; type: "autoPan"; bypassed: boolean; params: AutoPanParams }
  | { id: EffectId; type: "stereoWidth"; bypassed: boolean; params: StereoWidthParams };

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
  multibandCompressor: "Multiband Comp",
  chorus: "Chorus",
  flanger: "Flanger",
  exciter: "Exciter",
  autoPan: "Auto-Pan",
  stereoWidth: "Stereo Width",
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
    case "multibandCompressor":
      return {
        id,
        type,
        bypassed: false,
        params: {
          lowMidFreq: 200,
          midHighFreq: 2000,
          attackMs: 15,
          releaseMs: 150,
          low: { thresholdDb: -24, ratio: 3, makeupDb: 0 },
          mid: { thresholdDb: -24, ratio: 3, makeupDb: 0 },
          high: { thresholdDb: -24, ratio: 3, makeupDb: 0 },
        },
      };
    case "chorus":
      return { id, type, bypassed: false, params: { rateHz: 0.8, depthMs: 4, mix: 0.35 } };
    case "flanger":
      return { id, type, bypassed: false, params: { rateHz: 0.25, depthMs: 2, feedback: 0.4, mix: 0.35 } };
    case "exciter":
      return { id, type, bypassed: false, params: { freq: 4500, driveDb: 12, mix: 0.25 } };
    case "autoPan":
      return { id, type, bypassed: false, params: { rateHz: 0.5, depth: 0.7 } };
    case "stereoWidth":
      return { id, type, bypassed: false, params: { width: 1.3 } };
  }
}
