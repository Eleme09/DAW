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
  /** Gap before the tail starts - keeps the words in front of the room. */
  predelayMs?: number;
  /** Filters on the tail only (the dry voice is untouched): a vocal reverb
   * without low end doesn't muddy the beat, without top end it sits behind. */
  lowCutHz?: number;
  highCutHz?: number;
}

export interface DelayParams {
  timeMs: number;
  feedback: number; // 0..0.95
  mix: number; // 0..1
  filterFreq: number;
  /** Tempo division the time follows (TEMPO_DIVISIONS label, e.g. "1/4"),
   * or null/absent for free milliseconds. When set, `timeMs` is rewritten
   * from the project tempo (store: syncTempoDelays), so the engine only
   * ever reads `timeMs`. */
  sync?: string | null;
  /** Echoes alternate left/right. */
  pingPong?: boolean;
  /** High-pass on the echoes only - keeps the repeats out of the 808. */
  lowCutHz?: number;
}

/**
 * 3-band split via a 4th-order Linkwitz-Riley crossover with allpass
 * compensation on the low band (sums flat when not compressing; see
 * MultibandCompressorEffect). Attack/release are shared across bands;
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
 * Formant preservation: implemented via causal real-time TD-PSOLA (see that
 * worklet's header comment for the mechanism), replacing an earlier
 * variable-rate delay-line shifter that moved the whole spectrum with
 * pitch (the "chipmunk effect"). Measured directly, not assumed: an
 * isolated formant-like partial stays close to its original frequency
 * after a real correction, not the shifted one. This does NOT do explicit
 * spectral-envelope separation (cepstral/LPC) - that would let formants be
 * reshaped independently of pitch (e.g. a deliberate character change) and
 * may hold up better on breathy/noisy/complex real voices than the clean
 * synthetic signal this was measured against; it's a further refinement,
 * not a prerequisite for "formants stay put," which TD-PSOLA already gives
 * for free by never resampling the grain content. Applies to both modes
 * below (fixed-semitone transpose benefits the same way as scale mode).
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

/**
 * Pitch shifter for a voice: a fixed shift with the singer's own timbre
 * kept (or moved on its own with `formantSt`). TD-PSOLA on the voice's
 * tracked pitch marks (the AutoPitch engine with no tuning), so it is made
 * for one voice at a time - consonants pass unshifted, as in vocal pitch
 * shifters; a beat or a chord is what the region's "Transponer" is for.
 */
export interface PitchShiftParams {
  /** -12..+12 semitones. */
  semitones: number;
  /** -50..+50 cents on top (detune / doubles). */
  cents: number;
  /** Formant shift in semitones, independent of the pitch (0 = own timbre;
   * + smaller/brighter, - bigger/darker). */
  formantSt: number;
  /** 0 = dry, 1 = only the shifted voice. */
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
  | { id: EffectId; type: "vocoder"; bypassed: boolean; params: VocoderParams }
  | { id: EffectId; type: "pitchShift"; bypassed: boolean; params: PitchShiftParams };

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
  pitchShift: "Pitch shifter",
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
    case "pitchShift":
      // an octave down, blended: the trap ad-lib layer - something you hear
      // the moment you add it
      return { id, type, bypassed: false, params: { semitones: -12, cents: 0, formantSt: 0, mix: 1 } };
  }
}

/**
 * Named presets, one array per effect type - "zona 10" of the plugin
 * anatomy brief ("preajustes con nombre de músico, no técnico"). Before
 * this, only Pitch Correction had presets (`PITCH_CORRECTION_PRESETS`
 * above); the other 15 effect types were bare knobs with zero personality,
 * confirmed as a real reported gap ("los fx son un embudo de mierdas sin
 * personalidad"). Every value here is a deliberate, musically-reasoned
 * point in that effect's own real parameter space - grounded against each
 * type's defaults in `createEffectInstance` above, not arbitrary.
 */
export interface EffectPreset<P> {
  id: string;
  label: string;
  params: Partial<P>;
}

export const EQ_PRESETS: EffectPreset<EqParams>[] = [
  {
    id: "vozAlFrente",
    label: "Voz al frente",
    params: {
      bands: [
        { id: crypto.randomUUID(), type: "highpass", freq: 90, gainDb: 0, q: 0.707, enabled: true },
        { id: crypto.randomUUID(), type: "peaking", freq: 320, gainDb: -3, q: 1.1, enabled: true },
        { id: crypto.randomUUID(), type: "peaking", freq: 3000, gainDb: 3, q: 1, enabled: true },
        { id: crypto.randomUUID(), type: "highshelf", freq: 9000, gainDb: 2, q: 0.707, enabled: true },
      ],
    },
  },
  {
    id: "calido",
    label: "Cálido",
    params: {
      bands: [
        { id: crypto.randomUUID(), type: "highpass", freq: 80, gainDb: 0, q: 0.707, enabled: true },
        { id: crypto.randomUUID(), type: "peaking", freq: 280, gainDb: 2, q: 1, enabled: true },
        { id: crypto.randomUUID(), type: "peaking", freq: 2500, gainDb: 0, q: 1, enabled: true },
        { id: crypto.randomUUID(), type: "highshelf", freq: 8000, gainDb: -2, q: 0.707, enabled: true },
      ],
    },
  },
  {
    id: "brillante",
    label: "Brillante",
    params: {
      bands: [
        { id: crypto.randomUUID(), type: "highpass", freq: 100, gainDb: 0, q: 0.707, enabled: true },
        { id: crypto.randomUUID(), type: "peaking", freq: 300, gainDb: 0, q: 1, enabled: true },
        { id: crypto.randomUUID(), type: "peaking", freq: 2800, gainDb: 1, q: 1, enabled: true },
        { id: crypto.randomUUID(), type: "highshelf", freq: 9000, gainDb: 4, q: 0.707, enabled: true },
      ],
    },
  },
  {
    id: "transparente",
    label: "Transparente",
    params: {
      bands: [
        { id: crypto.randomUUID(), type: "highpass", freq: 40, gainDb: 0, q: 0.707, enabled: true },
        { id: crypto.randomUUID(), type: "peaking", freq: 300, gainDb: 0, q: 1, enabled: true },
        { id: crypto.randomUUID(), type: "peaking", freq: 2500, gainDb: 0, q: 1, enabled: true },
        { id: crypto.randomUUID(), type: "highshelf", freq: 8000, gainDb: 0, q: 0.707, enabled: true },
      ],
    },
  },
];

export const COMPRESSOR_PRESETS: EffectPreset<CompressorParams>[] = [
  { id: "suave", label: "Suave", params: { thresholdDb: -20, ratio: 2, attackMs: 15, releaseMs: 150, kneeDb: 8, makeupDb: 2 } },
  { id: "pegado", label: "Pegado", params: { thresholdDb: -26, ratio: 5, attackMs: 5, releaseMs: 90, kneeDb: 3, makeupDb: 3 } },
  { id: "transparente", label: "Transparente", params: { thresholdDb: -18, ratio: 1.8, attackMs: 25, releaseMs: 200, kneeDb: 10, makeupDb: 1 } },
  { id: "bombeo", label: "Bombeo", params: { thresholdDb: -22, ratio: 8, attackMs: 1, releaseMs: 45, kneeDb: 1, makeupDb: 4 } },
];

export const DEESSER_PRESETS: EffectPreset<DeEsserParams>[] = [
  { id: "suave", label: "Suave", params: { freq: 6000, thresholdDb: -25, ratio: 2.5 } },
  { id: "fuerte", label: "Fuerte", params: { freq: 7500, thresholdDb: -35, ratio: 6 } },
  { id: "transparente", label: "Transparente", params: { freq: 6500, thresholdDb: -20, ratio: 1.8 } },
];

export const SATURATION_PRESETS: EffectPreset<SaturationParams>[] = [
  { id: "calido", label: "Cálido", params: { driveDb: 4, mix: 0.3, tone: "warm" } },
  { id: "grit", label: "Grit", params: { driveDb: 14, mix: 0.55, tone: "bright" } },
  { id: "sutil", label: "Sutil", params: { driveDb: 2, mix: 0.15, tone: "neutral" } },
];

export const LIMITER_PRESETS: EffectPreset<LimiterParams>[] = [
  { id: "seguro", label: "Seguro", params: { thresholdDb: -3, releaseMs: 100, ceilingDb: -0.3 } },
  { id: "maximo", label: "Máximo", params: { thresholdDb: -9, releaseMs: 35, ceilingDb: -0.1 } },
  { id: "transparente", label: "Transparente", params: { thresholdDb: -1, releaseMs: 150, ceilingDb: -0.5 } },
];

export const CLIPPER_PRESETS: EffectPreset<ClipperParams>[] = [
  { id: "suave", label: "Suave", params: { ceilingDb: -1 } },
  { id: "duro", label: "Duro", params: { ceilingDb: -0.1 } },
];

export const NOISE_GATE_PRESETS: EffectPreset<NoiseGateParams>[] = [
  { id: "ambienteLimpio", label: "Ambiente limpio", params: { thresholdDb: -50, attackMs: 1, releaseMs: 200, holdMs: 80 } },
  { id: "agresivo", label: "Agresivo", params: { thresholdDb: -35, attackMs: 0.5, releaseMs: 70, holdMs: 15 } },
];

export const REVERB_PRESETS: EffectPreset<ReverbParams>[] = [
  { id: "salaIntima", label: "Sala íntima", params: { mix: 0.15, decaySec: 0.9, sizeType: "room" } },
  { id: "auditorio", label: "Auditorio", params: { mix: 0.32, decaySec: 2.4, sizeType: "hall" } },
  { id: "platoVintage", label: "Plato vintage", params: { mix: 0.25, decaySec: 1.5, sizeType: "plate" } },
  { id: "ambienteSutil", label: "Ambiente sutil", params: { mix: 0.1, decaySec: 1.1, sizeType: "room" } },
];

export const DELAY_PRESETS: EffectPreset<DelayParams>[] = [
  { id: "slapCorto", label: "Slap corto", params: { timeMs: 90, feedback: 0.1, mix: 0.18, filterFreq: 5500 } },
  { id: "ecoMusical", label: "Eco musical", params: { timeMs: 350, feedback: 0.35, mix: 0.25, filterFreq: 4000 } },
  { id: "dubProfundo", label: "Dub profundo", params: { timeMs: 480, feedback: 0.55, mix: 0.35, filterFreq: 2200 } },
];

export const MULTIBAND_PRESETS: EffectPreset<MultibandCompressorParams>[] = [
  {
    id: "balanceGeneral",
    label: "Balance general",
    params: {
      lowMidFreq: 200,
      midHighFreq: 2000,
      attackMs: 15,
      releaseMs: 150,
      low: { thresholdDb: -22, ratio: 2.5, makeupDb: 0 },
      mid: { thresholdDb: -24, ratio: 3, makeupDb: 0 },
      high: { thresholdDb: -22, ratio: 2.5, makeupDb: 0 },
    },
  },
  {
    id: "controlDeGraves",
    label: "Control de graves",
    params: {
      low: { thresholdDb: -28, ratio: 5, makeupDb: 1 },
      mid: { thresholdDb: -20, ratio: 2, makeupDb: 0 },
      high: { thresholdDb: -18, ratio: 1.5, makeupDb: 0 },
    },
  },
  {
    id: "domarAgudos",
    label: "Domar agudos",
    params: {
      low: { thresholdDb: -18, ratio: 1.5, makeupDb: 0 },
      mid: { thresholdDb: -20, ratio: 2, makeupDb: 0 },
      high: { thresholdDb: -26, ratio: 4, makeupDb: 1 },
    },
  },
];

export const CHORUS_PRESETS: EffectPreset<ChorusParams>[] = [
  { id: "sutil", label: "Sutil", params: { rateHz: 0.5, depthMs: 2, mix: 0.2 } },
  { id: "ancho80s", label: "Ancho (80s)", params: { rateHz: 1.2, depthMs: 5, mix: 0.45 } },
];

export const FLANGER_PRESETS: EffectPreset<FlangerParams>[] = [
  { id: "suave", label: "Suave", params: { rateHz: 0.25, depthMs: 2, feedback: 0.2, mix: 0.25 } },
  { id: "jetIntenso", label: "Jet intenso", params: { rateHz: 0.8, depthMs: 5, feedback: 0.65, mix: 0.5 } },
];

export const EXCITER_PRESETS: EffectPreset<ExciterParams>[] = [
  { id: "aireSutil", label: "Aire sutil", params: { freq: 6000, driveDb: 5, mix: 0.15 } },
  { id: "brilloFuerte", label: "Brillo fuerte", params: { freq: 4000, driveDb: 12, mix: 0.35 } },
];

export const AUTOPAN_PRESETS: EffectPreset<AutoPanParams>[] = [
  { id: "lentoAmbiental", label: "Lento ambiental", params: { rateHz: 0.2, depth: 0.4 } },
  { id: "rapidoRitmico", label: "Rápido rítmico", params: { rateHz: 2, depth: 0.85 } },
];

export const STEREO_WIDTH_PRESETS: EffectPreset<StereoWidthParams>[] = [
  { id: "angostoSeguro", label: "Angosto seguro", params: { width: 0.6 } },
  { id: "natural", label: "Natural", params: { width: 1 } },
  { id: "ancho", label: "Ancho", params: { width: 1.5 } },
];

export const VOCODER_PRESETS: EffectPreset<VocoderParams>[] = [
  { id: "roboGrave", label: "Robot grave", params: { carrierType: "sawtooth", carrierFreqHz: 110, mix: 0.85 } },
  { id: "roboAgudo", label: "Robot agudo", params: { carrierType: "square", carrierFreqHz: 220, mix: 0.75 } },
];

export const PITCH_SHIFT_PRESETS: EffectPreset<PitchShiftParams>[] = [
  { id: "octava-abajo", label: "Octava abajo", params: { semitones: -12, cents: 0, formantSt: 0, mix: 1 } },
  { id: "octava-arriba", label: "Octava arriba", params: { semitones: 12, cents: 0, formantSt: 0, mix: 1 } },
  { id: "doble-grave", label: "Doble grave", params: { semitones: -12, cents: 0, formantSt: 0, mix: 0.4 } },
  { id: "ardilla", label: "Ardilla", params: { semitones: 7, cents: 0, formantSt: 7, mix: 1 } },
  { id: "monstruo", label: "Monstruo", params: { semitones: -7, cents: 0, formantSt: -5, mix: 1 } },
];

/** Erased-to-metadata view of every preset list above, plus Pitch
 * Correction's own (already-existing) presets - the one place `EffectCard`
 * (which only knows a generic `EffectInstance`, not each type's concrete
 * param shape) can list "how many presets, what are they called" for the
 * header's preset navigator (zona 1) without needing per-type generics. */
export const EFFECT_PRESET_META: Record<EffectType, { id: string; label: string }[]> = {
  eq: EQ_PRESETS,
  compressor: COMPRESSOR_PRESETS,
  deesser: DEESSER_PRESETS,
  saturation: SATURATION_PRESETS,
  limiter: LIMITER_PRESETS,
  clipper: CLIPPER_PRESETS,
  noiseGate: NOISE_GATE_PRESETS,
  reverb: REVERB_PRESETS,
  delay: DELAY_PRESETS,
  multibandCompressor: MULTIBAND_PRESETS,
  chorus: CHORUS_PRESETS,
  flanger: FLANGER_PRESETS,
  exciter: EXCITER_PRESETS,
  autoPan: AUTOPAN_PRESETS,
  stereoWidth: STEREO_WIDTH_PRESETS,
  pitchCorrection: PITCH_CORRECTION_PRESET_NAMES.map((name) => ({ id: name, label: PITCH_CORRECTION_PRESET_LABELS[name] })),
  vocoder: VOCODER_PRESETS,
  pitchShift: PITCH_SHIFT_PRESETS,
};

/** Applies preset `presetId` (from `EFFECT_PRESET_META[effect.type]`) to
 * `effect`, returning its new params - the one place that actually knows
 * how to merge each type's own preset array, so `EffectCard`'s prev/next
 * navigator can stay generic. No-op (returns the unchanged params) if the
 * id doesn't match anything for this effect's type. */
export function applyEffectPreset(effect: EffectInstance, presetId: string): EffectInstance["params"] {
  switch (effect.type) {
    case "eq": {
      const p = EQ_PRESETS.find((x) => x.id === presetId);
      return p ? { ...effect.params, ...p.params } : effect.params;
    }
    case "compressor": {
      const p = COMPRESSOR_PRESETS.find((x) => x.id === presetId);
      return p ? { ...effect.params, ...p.params } : effect.params;
    }
    case "deesser": {
      const p = DEESSER_PRESETS.find((x) => x.id === presetId);
      return p ? { ...effect.params, ...p.params } : effect.params;
    }
    case "saturation": {
      const p = SATURATION_PRESETS.find((x) => x.id === presetId);
      return p ? { ...effect.params, ...p.params } : effect.params;
    }
    case "limiter": {
      const p = LIMITER_PRESETS.find((x) => x.id === presetId);
      return p ? { ...effect.params, ...p.params } : effect.params;
    }
    case "clipper": {
      const p = CLIPPER_PRESETS.find((x) => x.id === presetId);
      return p ? { ...effect.params, ...p.params } : effect.params;
    }
    case "noiseGate": {
      const p = NOISE_GATE_PRESETS.find((x) => x.id === presetId);
      return p ? { ...effect.params, ...p.params } : effect.params;
    }
    case "reverb": {
      const p = REVERB_PRESETS.find((x) => x.id === presetId);
      return p ? { ...effect.params, ...p.params } : effect.params;
    }
    case "delay": {
      const p = DELAY_PRESETS.find((x) => x.id === presetId);
      return p ? { ...effect.params, ...p.params } : effect.params;
    }
    case "multibandCompressor": {
      const p = MULTIBAND_PRESETS.find((x) => x.id === presetId);
      return p ? { ...effect.params, ...p.params } : effect.params;
    }
    case "chorus": {
      const p = CHORUS_PRESETS.find((x) => x.id === presetId);
      return p ? { ...effect.params, ...p.params } : effect.params;
    }
    case "flanger": {
      const p = FLANGER_PRESETS.find((x) => x.id === presetId);
      return p ? { ...effect.params, ...p.params } : effect.params;
    }
    case "exciter": {
      const p = EXCITER_PRESETS.find((x) => x.id === presetId);
      return p ? { ...effect.params, ...p.params } : effect.params;
    }
    case "autoPan": {
      const p = AUTOPAN_PRESETS.find((x) => x.id === presetId);
      return p ? { ...effect.params, ...p.params } : effect.params;
    }
    case "stereoWidth": {
      const p = STEREO_WIDTH_PRESETS.find((x) => x.id === presetId);
      return p ? { ...effect.params, ...p.params } : effect.params;
    }
    case "pitchCorrection": {
      const name = PITCH_CORRECTION_PRESET_NAMES.find((n) => n === presetId);
      return name ? { ...effect.params, ...PITCH_CORRECTION_PRESETS[name] } : effect.params;
    }
    case "vocoder": {
      const p = VOCODER_PRESETS.find((x) => x.id === presetId);
      return p ? { ...effect.params, ...p.params } : effect.params;
    }
    case "pitchShift": {
      const p = PITCH_SHIFT_PRESETS.find((x) => x.id === presetId);
      return p ? { ...effect.params, ...p.params } : effect.params;
    }
  }
}

/** One desaturated accent color per effect TYPE (zona 9: "un acento por
 * plugin, no cinco colores"), reusing the same signal palette already
 * defined for tracks (`--cabina-s1..s6` in globals.css / `bg-s1..s6`
 * Tailwind utilities) instead of inventing a second palette - effects are
 * grouped by function (EQ/tone, dynamics, time-based, character, spatial,
 * pitch/robot) and each group gets one of the 6 existing signal hues. */
export const EFFECT_ACCENT: Record<EffectType, string> = {
  eq: "s3",
  compressor: "s2",
  limiter: "s2",
  clipper: "s2",
  multibandCompressor: "s2",
  noiseGate: "s2",
  deesser: "s1",
  saturation: "s1",
  exciter: "s1",
  reverb: "s4",
  delay: "s4",
  chorus: "s4",
  flanger: "s4",
  autoPan: "s5",
  stereoWidth: "s5",
  pitchCorrection: "s6",
  vocoder: "s6",
  pitchShift: "s6",
};
