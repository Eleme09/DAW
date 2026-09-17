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

export type PitchCorrectionScale = "major" | "naturalMinor" | "harmonicMinor" | "chromatic" | "custom";

/**
 * Real-time pitch correction as a normal insert effect - replaces the old
 * global "Live Tune" transport button (adenda punto 2): this can sit
 * anywhere in a track's chain, reorder/bypass/save/automate like any other
 * effect, and apply to a recorded clip's playback, not just a live mic.
 * Backed by public/worklets/realtime-pitch-processor.js.
 *
 * Deliberately NOT implemented: formant/timbre preservation ("avoid the
 * chipmunk effect" on large corrections) - that needs spectral-envelope
 * separation (cepstral or LPC) reapplied after the shift, a materially
 * bigger DSP undertaking than the delay-line shifter this uses. Named here
 * rather than a silent no-op toggle - see PitchCorrectionEffect.ts. Applies
 * equally to both modes below (neither preserves formants).
 */
export type PitchCorrectionMode = "scale" | "fixed";

export interface PitchCorrectionParams {
  /** "scale" = correct toward the nearest note of key/scale (modes 1-3 of
   * the brief's afinación family, via the retune/humanize/mix knobs below).
   * "fixed" = always shift by a constant `fixedSemitones`, no pitch
   * detection/scale involved - mode 5, "cambio de tono fijo". */
  mode: PitchCorrectionMode;
  /** Semitones to shift when mode === "fixed"; ignored in "scale" mode. */
  fixedSemitones: number;
  /** Pitch class 0=C .. 11=B. Ignored when scale is "chromatic" or "custom", or when mode is "fixed". */
  key: number;
  scale: PitchCorrectionScale;
  /** Bitmask of allowed pitch classes (bit N = pitch class N allowed),
   * used only when scale === "custom" - lets the user tap individual notes
   * on the keyboard in/out instead of picking a fixed named scale. */
  customMask: number;
  /** ms to glide to the target pitch; 0 = instant hard-tune snap. Ignored when mode is "fixed" (the shift is constant, nothing to glide toward). */
  retuneSpeedMs: number;
  /** 0..1 dry/wet - how much of the corrected signal replaces the dry input. */
  mix: number;
  /** 0..1 - adds subtle pitch wobble so a hard snap doesn't sound perfectly robotic. Ignored when mode is "fixed". */
  humanize: number;
  /** A4 reference frequency in Hz - 440 is standard; adjustable to match an
   * already-recorded backing track tuned slightly off standard pitch. */
  referenceHz: number;
  /** YIN pitch-detection search range - narrowing it away from the
   * transposed voice's natural range reduces octave-detection errors.
   * Ignored when mode is "fixed" (no detection needed for a constant shift). */
  detectMinHz: number;
  detectMaxHz: number;
}

/** Major-scale bitmask (pitch classes 0,2,4,5,7,9,11 - bit N set = pitch
 * class N allowed) - the starting point when switching into "custom" scale
 * mode, and the worklet's own default for the `customMask` AudioParam.
 * 2^0+2^2+2^4+2^5+2^7+2^9+2^11 = 1+4+16+32+128+512+2048 = 2741. */
export const MAJOR_SCALE_MASK = 2741;

export const PITCH_CORRECTION_PRESET_NAMES = ["natural", "popSuave", "trapDuro", "transparente", "robot"] as const;
export type PitchCorrectionPresetName = (typeof PITCH_CORRECTION_PRESET_NAMES)[number];

export const PITCH_CORRECTION_PRESET_LABELS: Record<PitchCorrectionPresetName, string> = {
  natural: "Natural",
  popSuave: "Pop suave",
  trapDuro: "Trap duro",
  transparente: "Corrección transparente",
  robot: "Robot",
};

export const PITCH_CORRECTION_PRESETS: Record<PitchCorrectionPresetName, Pick<PitchCorrectionParams, "retuneSpeedMs" | "mix" | "humanize">> = {
  natural: { retuneSpeedMs: 200, mix: 0.7, humanize: 0.6 },
  popSuave: { retuneSpeedMs: 90, mix: 0.85, humanize: 0.25 },
  trapDuro: { retuneSpeedMs: 15, mix: 1, humanize: 0 },
  transparente: { retuneSpeedMs: 280, mix: 0.35, humanize: 0.7 },
  robot: { retuneSpeedMs: 0, mix: 1, humanize: 0 },
};

/**
 * Brief mode 9, "Vocoder / robot" - see VocoderEffect.ts for the actual
 * analysis/synthesis DSP (a real channel vocoder built from native Web
 * Audio nodes, not a preset on top of pitch correction).
 */
export interface VocoderParams {
  /** Web Audio's built-in oscillator waveforms suffice for a buzzy
   * vocoder carrier - only the classic vocoder timbres (sawtooth/square)
   * are offered, no sine/triangle (too pure to excite the whole band
   * bank usefully). */
  carrierType: "sawtooth" | "square";
  /** The carrier's fixed pitch in Hz - this vocoder does not track the
   * singer's own pitch (see VocoderEffect.ts's doc comment). */
  carrierFreqHz: number;
  mix: number;
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
  | { id: EffectId; type: "stereoWidth"; bypassed: boolean; params: StereoWidthParams }
  | { id: EffectId; type: "pitchCorrection"; bypassed: boolean; params: PitchCorrectionParams }
  | { id: EffectId; type: "vocoder"; bypassed: boolean; params: VocoderParams };

export type EffectType = EffectInstance["type"];

export const EFFECT_LABELS: Record<EffectType, string> = {
  eq: "Ecualizador",
  compressor: "Compresor",
  deesser: "De-esser",
  saturation: "Saturación",
  limiter: "Limitador",
  clipper: "Clipper",
  noiseGate: "Puerta de ruido",
  reverb: "Reverberación",
  delay: "Delay",
  multibandCompressor: "Compresor multibanda",
  chorus: "Chorus",
  flanger: "Flanger",
  exciter: "Excitador",
  autoPan: "Paneo automático",
  stereoWidth: "Imagen estéreo",
  pitchCorrection: "Afinación",
  vocoder: "Vocoder",
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
    case "pitchCorrection":
      return {
        id,
        type,
        bypassed: false,
        params: {
          mode: "scale",
          fixedSemitones: 0,
          key: 0,
          scale: "major",
          customMask: MAJOR_SCALE_MASK,
          referenceHz: 440,
          detectMinHz: 70,
          detectMaxHz: 1000,
          ...PITCH_CORRECTION_PRESETS.natural,
        },
      };
    case "vocoder":
      return { id, type, bypassed: false, params: { carrierType: "sawtooth", carrierFreqHz: 110, mix: 1 } };
  }
}
