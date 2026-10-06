import type {
  ChorusParams,
  ClipperParams,
  CompressorParams,
  DeEsserParams,
  DelayParams,
  EffectInstance,
  EqBand,
  ExciterParams,
  FlangerParams,
  LimiterParams,
  NoiseGateParams,
  ReverbParams,
  SaturationParams,
  StereoWidthParams,
  VocoderParams,
} from "@/types/effects";
import type { CoverPattern, FxChainPreset, FxCover } from "@/types/fxPresets";

/**
 * Factory Fx chains: pick one and the voice is done. Built for trap / rage
 * vocals recorded on a phone, sitting after AutoPitch (the "autoPitchHint"
 * says which). The artist references are about the production style
 * publicly associated with them (bright and pushed, distorted, wide and
 * washed, dark and warm) - nobody's actual settings, which are not public.
 *
 * Chain order follows the usual vocal chain: clean (gate / high-pass) ->
 * tone (EQ) -> level (compressor) -> sibilance (de-esser) -> colour
 * (saturation / exciter) -> space (chorus, delay, reverb) -> safety (limiter).
 */

let seq = 0;
const id = () => `f${++seq}`;

const band = (type: EqBand["type"], freq: number, gainDb = 0, q = 0.707): EqBand => ({ id: id(), type, freq, gainDb, q, enabled: true });

const eq = (...bands: EqBand[]): EffectInstance => ({ id: id(), type: "eq", bypassed: false, params: { bands } });
const comp = (p: CompressorParams): EffectInstance => ({ id: id(), type: "compressor", bypassed: false, params: p });
const deess = (p: DeEsserParams): EffectInstance => ({ id: id(), type: "deesser", bypassed: false, params: p });
const sat = (p: SaturationParams): EffectInstance => ({ id: id(), type: "saturation", bypassed: false, params: p });
const exciter = (p: ExciterParams): EffectInstance => ({ id: id(), type: "exciter", bypassed: false, params: p });
const reverb = (p: ReverbParams): EffectInstance => ({ id: id(), type: "reverb", bypassed: false, params: p });
const delay = (p: DelayParams): EffectInstance => ({ id: id(), type: "delay", bypassed: false, params: p });
const chorus = (p: ChorusParams): EffectInstance => ({ id: id(), type: "chorus", bypassed: false, params: p });
const flanger = (p: FlangerParams): EffectInstance => ({ id: id(), type: "flanger", bypassed: false, params: p });
const limiter = (p: LimiterParams): EffectInstance => ({ id: id(), type: "limiter", bypassed: false, params: p });
const clipper = (p: ClipperParams): EffectInstance => ({ id: id(), type: "clipper", bypassed: false, params: p });
const gate = (p: NoiseGateParams): EffectInstance => ({ id: id(), type: "noiseGate", bypassed: false, params: p });
const width = (p: StereoWidthParams): EffectInstance => ({ id: id(), type: "stereoWidth", bypassed: false, params: p });
const vocoder = (p: VocoderParams): EffectInstance => ({ id: id(), type: "vocoder", bypassed: false, params: p });

const art = (from: string, to: string, pattern: CoverPattern): FxCover => ({
  kind: "art",
  from,
  to,
  pattern,
});

/** Delay time in ms for a note value at 140 bpm - replaced by the project's
 * real tempo when the preset is applied (store: syncDelaysToTempo). */
const at140 = (beats: number) => beats * (60000 / 140);

/** The usual safety limiter at the end of a vocal chain. */
const safety = () => limiter({ thresholdDb: -3, releaseMs: 80, ceilingDb: -1 });

export const FACTORY_FX_PRESETS: FxChainPreset[] = [
  // ------------------------------------------------------------ voz principal
  {
    id: "factory.rage-brillante",
    name: "Rage Brillante",
    description: "Al frente, brillante y apretada. Rage melódico.",
    category: "voces",
    reference: "Yeat",
    autoPitchHint: "Classic al 100 %",
    cover: art("#ff3d7f", "#ffb800", "rings"),
    blend: 1,
    factory: true,
    effects: [
      eq(band("highpass", 110), band("peaking", 350, -3, 1), band("peaking", 3200, 4, 0.9), band("highshelf", 10000, 4)),
      comp({ thresholdDb: -26, ratio: 6, attackMs: 3, releaseMs: 80, kneeDb: 4, makeupDb: 6 }),
      deess({ freq: 7000, thresholdDb: -32, ratio: 5 }),
      sat({ driveDb: 10, mix: 0.35, tone: "bright" }),
      exciter({ freq: 5000, driveDb: 8, mix: 0.25 }),
      delay({ timeMs: at140(0.5), sync: "1/8", feedback: 0.2, mix: 0.1, filterFreq: 4500, lowCutHz: 300 }),
      reverb({ mix: 0.12, decaySec: 1.0, sizeType: "plate", predelayMs: 20, lowCutHz: 250, highCutHz: 9000 }),
      safety(),
    ],
  },
  {
    id: "factory.rage-distorsion",
    name: "Rage Distorsión",
    description: "Saturada y cruda, medios al frente. Rage oscuro.",
    category: "voces",
    reference: "Ken Carson",
    autoPitchHint: "Classic al 100 %",
    cover: art("#1a1a1a", "#e5243b", "diagonal"),
    blend: 1,
    factory: true,
    effects: [
      eq(band("highpass", 160), band("peaking", 300, -4, 1), band("peaking", 1600, 5, 0.8), band("highshelf", 8000, 2)),
      comp({ thresholdDb: -28, ratio: 8, attackMs: 1, releaseMs: 60, kneeDb: 3, makeupDb: 4 }),
      sat({ driveDb: 18, mix: 0.55, tone: "bright" }),
      deess({ freq: 6500, thresholdDb: -30, ratio: 4 }),
      clipper({ ceilingDb: -2 }),
      reverb({ mix: 0.08, decaySec: 0.6, sizeType: "room", predelayMs: 10, lowCutHz: 300, highCutHz: 7000 }),
      safety(),
    ],
  },
  {
    id: "factory.atmosfera",
    name: "Atmósfera",
    description: "Ancha y lavada: doble, ping-pong y sala grande.",
    category: "voces",
    reference: "Travis Scott",
    autoPitchHint: "Classic al 100 %",
    cover: art("#3a1c71", "#d76d77", "waves"),
    blend: 1,
    factory: true,
    effects: [
      eq(band("highpass", 90), band("peaking", 280, -3, 1), band("peaking", 2800, 3, 1), band("highshelf", 11000, 3)),
      comp({ thresholdDb: -24, ratio: 4, attackMs: 8, releaseMs: 120, kneeDb: 6, makeupDb: 7 }),
      deess({ freq: 6500, thresholdDb: -30, ratio: 4 }),
      chorus({ rateHz: 0.6, depthMs: 3, mix: 0.22 }),
      delay({ timeMs: at140(1), sync: "1/4", pingPong: true, feedback: 0.35, mix: 0.18, filterFreq: 3500, lowCutHz: 350 }),
      reverb({ mix: 0.22, decaySec: 2.8, sizeType: "hall", predelayMs: 40, lowCutHz: 300, highCutHz: 7500 }),
      safety(),
    ],
  },
  {
    id: "factory.melodia-oscura",
    name: "Melodía Oscura",
    description: "Cálida y oscura, ecos con puntillo. Melódico.",
    category: "voces",
    reference: "Future",
    autoPitchHint: "Classic al 100 %",
    cover: art("#0f2027", "#2c5364", "bars"),
    blend: 1,
    factory: true,
    effects: [
      eq(band("highpass", 95), band("peaking", 200, 2, 0.9), band("peaking", 500, -2, 1.2), band("peaking", 2500, 2.5, 1), band("highshelf", 12000, -1)),
      comp({ thresholdDb: -25, ratio: 5, attackMs: 5, releaseMs: 100, kneeDb: 5, makeupDb: 5 }),
      sat({ driveDb: 6, mix: 0.3, tone: "warm" }),
      deess({ freq: 6000, thresholdDb: -30, ratio: 4 }),
      delay({ timeMs: at140(0.75), sync: "1/8.", feedback: 0.3, mix: 0.15, filterFreq: 3000, lowCutHz: 300 }),
      reverb({ mix: 0.15, decaySec: 1.6, sizeType: "plate", predelayMs: 30, lowCutHz: 250, highCutHz: 8000 }),
      safety(),
    ],
  },
  {
    id: "factory.trap-limpia",
    name: "Trap Limpia",
    description: "Clara, pareja y con poco espacio. La de siempre.",
    category: "voces",
    autoPitchHint: "Classic o Natural",
    cover: art("#f2ede4", "#7fa8c9", "grid"),
    blend: 1,
    factory: true,
    effects: [
      eq(band("highpass", 100), band("peaking", 300, -2.5, 1), band("peaking", 3000, 2.5, 1), band("highshelf", 10000, 2.5)),
      comp({ thresholdDb: -24, ratio: 4, attackMs: 6, releaseMs: 100, kneeDb: 6, makeupDb: 4 }),
      deess({ freq: 6500, thresholdDb: -30, ratio: 4 }),
      reverb({ mix: 0.1, decaySec: 1.2, sizeType: "plate", predelayMs: 25, lowCutHz: 250, highCutHz: 9000 }),
      safety(),
    ],
  },
  {
    id: "factory.al-frente",
    name: "Al Frente",
    description: "Rap seco y en tu cara, sin reverb.",
    category: "voces",
    cover: art("#e8c15c", "#c97064", "diagonal"),
    blend: 1,
    factory: true,
    effects: [
      eq(band("highpass", 120), band("peaking", 250, -3, 1), band("peaking", 4000, 3, 0.9), band("highshelf", 9000, 2)),
      comp({ thresholdDb: -27, ratio: 7, attackMs: 2, releaseMs: 70, kneeDb: 3, makeupDb: 7 }),
      deess({ freq: 7000, thresholdDb: -32, ratio: 5 }),
      sat({ driveDb: 5, mix: 0.2, tone: "neutral" }),
      safety(),
    ],
  },

  // ------------------------------------------------------------ melódicas
  {
    id: "factory.melodico-brillante",
    name: "Melódico Brillante",
    description: "Aire arriba y cola de placa: para cantar.",
    category: "melodicas",
    autoPitchHint: "Classic o Natural",
    cover: art("#a1c4fd", "#c2e9fb", "rings"),
    blend: 1,
    factory: true,
    effects: [
      eq(band("highpass", 95), band("peaking", 320, -2, 1), band("peaking", 2600, 2, 1), band("highshelf", 12000, 4)),
      comp({ thresholdDb: -24, ratio: 4, attackMs: 8, releaseMs: 120, kneeDb: 6, makeupDb: 4 }),
      deess({ freq: 7000, thresholdDb: -30, ratio: 4 }),
      exciter({ freq: 6000, driveDb: 6, mix: 0.2 }),
      delay({ timeMs: at140(1), sync: "1/4", feedback: 0.25, mix: 0.12, filterFreq: 4000, lowCutHz: 300 }),
      reverb({ mix: 0.2, decaySec: 2.0, sizeType: "plate", predelayMs: 35, lowCutHz: 250, highCutHz: 10000 }),
      safety(),
    ],
  },
  {
    id: "factory.susurro",
    name: "Susurro",
    description: "Íntima y cerca, suave en los agudos.",
    category: "melodicas",
    cover: art("#232526", "#414345", "dots"),
    blend: 1,
    factory: true,
    effects: [
      eq(band("highpass", 80), band("peaking", 180, 2, 0.8), band("peaking", 3500, -1.5, 1), band("highshelf", 9000, 1.5)),
      comp({ thresholdDb: -30, ratio: 3, attackMs: 12, releaseMs: 160, kneeDb: 10, makeupDb: 6 }),
      deess({ freq: 6000, thresholdDb: -34, ratio: 5 }),
      sat({ driveDb: 4, mix: 0.25, tone: "warm" }),
      reverb({ mix: 0.12, decaySec: 0.9, sizeType: "room", predelayMs: 15, lowCutHz: 200, highCutHz: 7000 }),
      safety(),
    ],
  },

  // ------------------------------------------------------------ ad-libs y coros
  {
    id: "factory.adlib-telefono",
    name: "Ad-lib Teléfono",
    description: "Banda de teléfono, sucia, con eco a los lados.",
    category: "adlibs",
    cover: art("#ff7a1a", "#3d1a00", "bars"),
    blend: 1,
    factory: true,
    effects: [
      eq(band("highpass", 450, 0, 0.9), band("peaking", 1500, 6, 0.9), band("lowpass", 3500, 0, 0.9)),
      sat({ driveDb: 14, mix: 0.6, tone: "neutral" }),
      comp({ thresholdDb: -24, ratio: 6, attackMs: 3, releaseMs: 80, kneeDb: 3, makeupDb: 5 }),
      delay({ timeMs: at140(0.5), sync: "1/8", pingPong: true, feedback: 0.3, mix: 0.25, filterFreq: 3000, lowCutHz: 500 }),
      safety(),
    ],
  },
  {
    id: "factory.coros-anchos",
    name: "Coros Anchos",
    description: "Dobles y coros abiertos, detrás de la voz.",
    category: "adlibs",
    cover: art("#11998e", "#38ef7d", "waves"),
    blend: 1,
    factory: true,
    effects: [
      eq(band("highpass", 200), band("peaking", 400, -3, 1), band("highshelf", 10000, 3)),
      comp({ thresholdDb: -26, ratio: 5, attackMs: 5, releaseMs: 100, kneeDb: 6, makeupDb: 7 }),
      deess({ freq: 6500, thresholdDb: -32, ratio: 5 }),
      chorus({ rateHz: 0.8, depthMs: 4, mix: 0.4 }),
      width({ width: 1.6 }),
      reverb({ mix: 0.25, decaySec: 2.2, sizeType: "hall", predelayMs: 30, lowCutHz: 350, highCutHz: 8000 }),
      safety(),
    ],
  },
  {
    id: "factory.adlib-lejano",
    name: "Ad-lib Lejano",
    description: "Ecos y cola larga: suena atrás y arriba.",
    category: "adlibs",
    cover: art("#141e30", "#243b55", "rings"),
    blend: 1,
    factory: true,
    effects: [
      eq(band("highpass", 300), band("lowpass", 6000, 0, 0.7)),
      comp({ thresholdDb: -24, ratio: 4, attackMs: 6, releaseMs: 120, kneeDb: 6, makeupDb: 8 }),
      delay({ timeMs: at140(1), sync: "1/4", pingPong: true, feedback: 0.45, mix: 0.3, filterFreq: 2500, lowCutHz: 400 }),
      reverb({ mix: 0.35, decaySec: 3.5, sizeType: "hall", predelayMs: 50, lowCutHz: 400, highCutHz: 6000 }),
      safety(),
    ],
  },

  // ------------------------------------------------------------ pulido
  {
    id: "factory.solo-limpieza",
    name: "Solo Limpieza",
    description: "Quita ruido, retumbe y eses. Nada de color.",
    category: "pulido",
    cover: art("#8fb89a", "#1f2d24", "grid"),
    blend: 1,
    factory: true,
    effects: [
      gate({ thresholdDb: -50, attackMs: 1, releaseMs: 180, holdMs: 60 }),
      eq(band("highpass", 90), band("peaking", 250, -2, 1.2)),
      deess({ freq: 6500, thresholdDb: -30, ratio: 3 }),
      comp({ thresholdDb: -20, ratio: 2.5, attackMs: 15, releaseMs: 150, kneeDb: 8, makeupDb: 2 }),
      safety(),
    ],
  },
  {
    id: "factory.brillo-aire",
    name: "Brillo y Aire",
    description: "Más claridad y aire sin tocar el resto.",
    category: "pulido",
    cover: art("#fceabb", "#f8b500", "dots"),
    blend: 1,
    factory: true,
    effects: [
      eq(band("highpass", 80), band("peaking", 3500, 2, 1), band("highshelf", 11000, 4)),
      exciter({ freq: 6000, driveDb: 8, mix: 0.25 }),
      deess({ freq: 7500, thresholdDb: -30, ratio: 3 }),
      safety(),
    ],
  },
  {
    id: "factory.control",
    name: "Control",
    description: "Nivel parejo de principio a fin, sin picos.",
    category: "pulido",
    cover: art("#434343", "#000000", "bars"),
    blend: 1,
    factory: true,
    effects: [
      comp({ thresholdDb: -22, ratio: 3, attackMs: 10, releaseMs: 120, kneeDb: 6, makeupDb: 3 }),
      comp({ thresholdDb: -12, ratio: 6, attackMs: 2, releaseMs: 60, kneeDb: 2, makeupDb: 1 }),
      limiter({ thresholdDb: -2, releaseMs: 80, ceilingDb: -1 }),
    ],
  },

  // ------------------------------------------------------------ espacio
  {
    id: "factory.placa-vocal",
    name: "Placa Vocal",
    description: "La reverb de voz clásica: brillante y corta.",
    category: "espacio",
    cover: art("#c7c9ff", "#2c2f86", "rings"),
    blend: 1,
    factory: true,
    effects: [reverb({ mix: 0.18, decaySec: 1.4, sizeType: "plate", predelayMs: 25, lowCutHz: 250, highCutHz: 9000 })],
  },
  {
    id: "factory.sala-grande",
    name: "Sala Grande",
    description: "Cola larga y oscura detrás de la voz.",
    category: "espacio",
    cover: art("#1d1f5c", "#6a3093", "waves"),
    blend: 1,
    factory: true,
    effects: [reverb({ mix: 0.25, decaySec: 3.2, sizeType: "hall", predelayMs: 45, lowCutHz: 300, highCutHz: 7000 })],
  },
  {
    id: "factory.eco-negra",
    name: "Eco a Negra",
    description: "Eco en negras que rebota de lado a lado.",
    category: "espacio",
    cover: art("#0f4a52", "#7ef0ff", "bars"),
    blend: 1,
    factory: true,
    effects: [delay({ timeMs: at140(1), sync: "1/4", pingPong: true, feedback: 0.35, mix: 0.2, filterFreq: 4000, lowCutHz: 300 })],
  },
  {
    id: "factory.slap",
    name: "Slap",
    description: "Un rebote corto que engorda sin alejar.",
    category: "espacio",
    cover: art("#7ef0ff", "#0a2f35", "diagonal"),
    blend: 1,
    factory: true,
    effects: [delay({ timeMs: 110, sync: null, feedback: 0.08, mix: 0.18, filterFreq: 5000, lowCutHz: 250 })],
  },

  // ------------------------------------------------------------ efectos
  {
    id: "factory.radio-vieja",
    name: "Radio Vieja",
    description: "Parlante chico, saturado y lejano.",
    category: "efectos",
    cover: art("#5a3f37", "#2c7744", "noise"),
    blend: 1,
    factory: true,
    effects: [
      eq(band("highpass", 600, 0, 1), band("peaking", 1800, 5, 1), band("lowpass", 3000, 0, 1)),
      sat({ driveDb: 16, mix: 0.7, tone: "warm" }),
      reverb({ mix: 0.1, decaySec: 0.5, sizeType: "room", predelayMs: 0, lowCutHz: 500, highCutHz: 4000 }),
      safety(),
    ],
  },
  {
    id: "factory.lo-fi",
    name: "Lo-Fi",
    description: "Opaca, cálida y con cuarto: suena a cinta.",
    category: "efectos",
    cover: art("#d1913c", "#ffd194", "noise"),
    blend: 1,
    factory: true,
    effects: [
      eq(band("highpass", 150), band("lowpass", 5500, 0, 0.7), band("peaking", 900, 2, 0.8)),
      sat({ driveDb: 9, mix: 0.45, tone: "warm" }),
      comp({ thresholdDb: -24, ratio: 4, attackMs: 10, releaseMs: 140, kneeDb: 8, makeupDb: 3 }),
      chorus({ rateHz: 0.3, depthMs: 2, mix: 0.15 }),
      reverb({ mix: 0.18, decaySec: 0.9, sizeType: "room", predelayMs: 10, lowCutHz: 200, highCutHz: 5000 }),
    ],
  },
  {
    id: "factory.jet",
    name: "Jet",
    description: "Barrido de flanger en toda la voz.",
    category: "efectos",
    cover: art("#ff6ad5", "#2b0a3d", "waves"),
    blend: 1,
    factory: true,
    effects: [
      comp({ thresholdDb: -24, ratio: 3, attackMs: 8, releaseMs: 120, kneeDb: 6, makeupDb: 5 }),
      flanger({ rateHz: 0.35, depthMs: 3, feedback: 0.55, mix: 0.45 }),
      reverb({ mix: 0.12, decaySec: 1.2, sizeType: "plate", predelayMs: 20, lowCutHz: 300, highCutHz: 9000 }),
      safety(),
    ],
  },
  {
    id: "factory.robot",
    name: "Robot",
    description: "Vocoder sobre la voz, con un poco de voz real.",
    category: "efectos",
    cover: art("#3dff6a", "#030a04", "grid"),
    blend: 1,
    factory: true,
    effects: [
      vocoder({ carrierType: "sawtooth", carrierFreqHz: 110, mix: 0.8 }),
      // the vocoder comes out ~15 dB under the voice: bring it back up
      comp({ thresholdDb: -36, ratio: 3, attackMs: 5, releaseMs: 100, kneeDb: 6, makeupDb: 16 }),
      reverb({ mix: 0.1, decaySec: 1, sizeType: "plate", predelayMs: 10, lowCutHz: 300, highCutHz: 8000 }),
      safety(),
    ],
  },
];
