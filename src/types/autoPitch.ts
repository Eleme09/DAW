/**
 * BandLab AutoPitch: a per-track vocal effect that lives OUTSIDE the Fx chain
 * (BandLab FAQ: "AutoPitch Vocal Effects differ from those created in the
 * effects chain") - pitch correction to a key/scale plus, depending on the
 * preset, harmony voices, a vocoder, and character effects. It processes
 * live while monitoring and on playback; the recorded take stays dry.
 *
 * The 24 presets, their names, categories and what each one does come from
 * BandLab's official AutoPitch FAQ (help.bandlab.com, article
 * 29099155628953). BandLab does NOT publish the DSP behind them, so the
 * numbers in AUTOPITCH_RECIPES (retune speed, voice gains/pans, filter
 * corners...) are our own engineering of each official description - the
 * intervals named in the FAQ ("third-down", "fourth-up", "fifth-down",
 * "octave and perfect fourth-down", "perfect fifth-up and fourth-down",
 * "octave lower") are followed exactly.
 */

export type AutoPitchCategory = "essentials" | "hipHop" | "hyperpop" | "sciFi";

export const AUTOPITCH_CATEGORIES: { id: AutoPitchCategory; label: string }[] = [
  { id: "essentials", label: "Essentials" },
  { id: "hipHop", label: "Hip Hop" },
  { id: "hyperpop", label: "Hyperpop" },
  { id: "sciFi", label: "Sci-Fi" },
];

/** BandLab's scale row, in its order: Personalizado, Cromática, Mayor,
 * Menor, Pentatónica mayor, Pentatónica menor. */
export type AutoPitchScale = "custom" | "chromatic" | "major" | "minor" | "majorPentatonic" | "minorPentatonic";

export const AUTOPITCH_SCALES: { id: AutoPitchScale; label: string }[] = [
  { id: "custom", label: "Personalizado" },
  { id: "chromatic", label: "Cromática" },
  { id: "major", label: "Mayor" },
  { id: "minor", label: "Menor" },
  { id: "majorPentatonic", label: "Pentatónica mayor" },
  { id: "minorPentatonic", label: "Pentatónica menor" },
];

/** BandLab's three pitch-shifting algorithms (AutoPitch advanced settings). */
export type AutoPitchAlgorithm = "original" | "lowLatency" | "formant";

export const AUTOPITCH_ALGORITHMS: { id: AutoPitchAlgorithm; label: string; help: string }[] = [
  {
    id: "original",
    label: "Original",
    help: "Corrección rápida, menos transparente: las armonías cambian de timbre con el tono. Va bien con sonidos estilizados.",
  },
  {
    id: "lowLatency",
    label: "Low-Latency",
    help: "La mitad de retardo para escucharte mientras grabas. Las voces muy graves pierden algo de calidad.",
  },
  {
    id: "formant",
    label: "Formant-Preserving",
    help: "Cambia el tono sin cambiar los formantes: las armonías conservan el timbre natural de tu voz.",
  },
];

export const NOTE_NAMES_ES = ["Do", "Do#/Re♭", "Re", "Re#/Mi♭", "Mi", "Fa", "Fa#/Sol♭", "Sol", "Sol#/La♭", "La", "La#/Si♭", "Si"];
/** Short form for the header pill ("La mayor", "Mi menor"). */
export const NOTE_SHORT_ES = ["Do", "Do#", "Re", "Mi♭", "Mi", "Fa", "Fa#", "Sol", "La♭", "La", "Si♭", "Si"];

export const MAJOR_MASK = 0b101010110101; // C D E F G A B

export type AutoPitchPresetId =
  | "classic"
  | "duet"
  | "bigHarmony"
  | "natural"
  | "third"
  | "chip"
  | "modernRap"
  | "stone"
  | "yummy"
  | "playCard"
  | "ocean"
  | "telephone"
  | "simulacrum"
  | "ultrashift"
  | "hyper"
  | "bitz"
  | "amped"
  | "appleX"
  | "robot"
  | "futurescape"
  | "krafty"
  | "gorgon"
  | "halo"
  | "drone";

export interface AutoPitchSettings {
  enabled: boolean;
  presetId: AutoPitchPresetId;
  /** BandLab's Level knob, 0..1 ("Lo más intenso" at 1). */
  level: number;
  /** Pitch class 0=Do .. 11=Si. */
  key: number;
  scale: AutoPitchScale;
  /** Allowed pitch classes for scale "custom" (bit N = pitch class N). */
  customMask: number;
  /** Advanced setting: level of the harmony voices, 0..1. */
  harmonyMix: number;
  algorithm: AutoPitchAlgorithm;
}

export function createAutoPitchSettings(key = 9, scale: AutoPitchScale = "major"): AutoPitchSettings {
  return {
    enabled: true,
    presetId: "classic",
    level: 1,
    key,
    scale,
    customMask: MAJOR_MASK,
    harmonyMix: 1,
    algorithm: "original",
  };
}

/** One harmony voice. `interval` is in scale steps when `diatonic` (2 =
 * third, 3 = fourth, 4 = fifth; negative = below) - it follows the key like
 * a real harmonizer (a third above can be major or minor depending on the
 * note) - or in semitones when not (12 = octave, 7 = perfect fifth, -5 =
 * perfect fourth down: fixed intervals the FAQ calls "perfect"). */
export interface HarmonyVoice {
  interval: number;
  diatonic: boolean;
  gain: number;
  /** -1 (L) .. 1 (R). */
  pan: number;
  /** Fixed formant factor (>1 = smaller/"helium" voice, <1 = bigger/darker).
   * Omitted: the voice follows the algorithm setting. */
  formant?: number;
  /** Small fixed detune, so two copies of a voice sound like two singers. */
  detuneCents?: number;
  /** Small delay (Haas) for width. */
  delayMs?: number;
  /** Not a harmony but the effect's main voice (Gorgon's octave-down
   * voice): Harmony Mix doesn't turn it down. */
  main?: boolean;
}

export interface AutoPitchRecipe {
  id: AutoPitchPresetId;
  label: string;
  category: AutoPitchCategory;
  /** BandLab's own description (official FAQ), in Spanish. */
  description: string;
  /** Correction behaviour at full Level - the controls Antares Auto-Tune and
   * Waves Tune Real-Time agree on: `speedMs` pulls the pitch onto the note
   * within a note (Auto-Tune "Retune Speed": 0 = the hard "Auto-Tune
   * effect", 10-50 = natural), `transitionMs` moves between notes (Waves
   * "Note Transition"), `humanize` slows the correction only on the held part
   * of long notes (Auto-Tune "Humanize"), `flex` lets bends and slides
   * through and only corrects near the note (Auto-Tune "Flex-Tune"). */
  tune: { speedMs: number; transitionMs: number; humanize: number; flex: number };
  /** Level of the corrected lead voice (Robot and Gorgon replace it). */
  lead: { gain: number };
  voices: HarmonyVoice[];
  /** Vibrato on the harmony voices ("modulated" layer). */
  vibrato?: { rateHz: number; cents: number };
  vocoder?: { mix: number; carrier: "follow" | "chord" | "drone" };
  crush?: { bits: number; downsample: number; mix: number };
  wah?: { rateHz: number; mix: number };
  drive?: { amount: number; mix: number };
  highpassHz?: number;
  lowpassHz?: number;
  /** 0..1, from gentle leveling to heavy squash. */
  compress?: number;
  chorus?: { mix: number; depthMs: number; rateHz: number };
  reverb?: { mix: number; decaySec: number; sizeType: "room" | "hall" | "plate" };
  /** Output trim so presets land at a similar loudness, dB. */
  trimDb?: number;
}

const stereoPair = (interval: number, diatonic: boolean, gain: number, spread: number, extra: Partial<HarmonyVoice> = {}): HarmonyVoice[] => [
  { interval, diatonic, gain, pan: -spread, ...extra },
  { interval, diatonic, gain: gain * 0.92, pan: spread, detuneCents: 7, delayMs: 12, ...extra },
];

export const AUTOPITCH_RECIPES: AutoPitchRecipe[] = [
  // --- Essentials ---
  {
    id: "classic",
    label: "Classic",
    category: "essentials",
    description: "Inspirado en el efecto de corrección de tono popular que aparece en innumerables canciones.",
    tune: { speedMs: 0, transitionMs: 0, humanize: 0, flex: 0 },
    lead: { gain: 1 },
    voices: [],
  },
  {
    id: "duet",
    label: "Duet",
    category: "essentials",
    description: "Una armonía de dos tonos cuidadosamente diseñada para armonizar la voz sin fallos.",
    tune: { speedMs: 15, transitionMs: 40, humanize: 0.1, flex: 0 },
    lead: { gain: 1 },
    voices: stereoPair(2, true, 0.5, 0.6),
    trimDb: -1.5,
  },
  {
    id: "bigHarmony",
    label: "Big Harmony",
    category: "essentials",
    description: "Armoniza tu voz en cualquier tonalidad y te da el gran efecto de coro usado en la música moderna.",
    tune: { speedMs: 10, transitionMs: 40, humanize: 0.1, flex: 0 },
    lead: { gain: 1 },
    voices: [
      { interval: 2, diatonic: true, gain: 0.45, pan: -0.75 },
      { interval: 4, diatonic: true, gain: 0.4, pan: 0.75, detuneCents: 6, delayMs: 10 },
      { interval: -12, diatonic: false, gain: 0.32, pan: 0 },
      { interval: -3, diatonic: true, gain: 0.3, pan: 0.35, detuneCents: -6, delayMs: 16 },
    ],
    chorus: { mix: 0.25, depthMs: 3, rateHz: 0.7 },
    reverb: { mix: 0.12, decaySec: 1.6, sizeType: "hall" },
    trimDb: -2,
  },
  {
    id: "natural",
    label: "Natural",
    category: "essentials",
    description: "Un preset limpio inspirado en el pop moderno: una mejora sutil que saca lo mejor de tu voz.",
    tune: { speedMs: 40, transitionMs: 120, humanize: 0.5, flex: 0.5 },
    lead: { gain: 1 },
    voices: [],
    compress: 0.3,
    reverb: { mix: 0.07, decaySec: 1.1, sizeType: "room" },
    trimDb: -2.5,
  },
  {
    id: "third",
    label: "Third",
    category: "essentials",
    description: "Añade una armonía suave una tercera por debajo, para una voz más rica y con más cuerpo.",
    tune: { speedMs: 20, transitionMs: 50, humanize: 0.15, flex: 0 },
    lead: { gain: 1 },
    voices: stereoPair(-2, true, 0.5, 0.35),
    trimDb: -1.5,
  },
  {
    id: "chip",
    label: "Chip",
    category: "essentials",
    description: "Una capa vocal aguda, nítida y modulada: el clásico sonido de ardilla o de helio.",
    tune: { speedMs: 10, transitionMs: 30, humanize: 0, flex: 0 },
    lead: { gain: 1 },
    voices: [{ interval: 12, diatonic: false, gain: 0.7, pan: 0, formant: 1.9 }],
    vibrato: { rateHz: 6, cents: 30 },
    highpassHz: 160,
    chorus: { mix: 0.3, depthMs: 2.5, rateHz: 1.1 },
    trimDb: -2,
  },
  // --- Hip Hop ---
  {
    id: "modernRap",
    label: "Modern Rap",
    category: "hipHop",
    description: "Mezcla tu voz original con una versión una octava más grave, para darle profundidad.",
    tune: { speedMs: 10, transitionMs: 30, humanize: 0, flex: 0 },
    lead: { gain: 1 },
    voices: [{ interval: -12, diatonic: false, gain: 0.6, pan: 0 }],
    compress: 0.35,
    trimDb: -4.5,
  },
  {
    id: "stone",
    label: "Stone",
    category: "hipHop",
    description: "Realza tu voz con una armonía una cuarta arriba, un impulso melódico al estilo de los grandes éxitos.",
    tune: { speedMs: 15, transitionMs: 40, humanize: 0.1, flex: 0 },
    lead: { gain: 1 },
    voices: stereoPair(3, true, 0.45, 0.5),
    trimDb: -1.5,
  },
  {
    id: "yummy",
    label: "Yummy",
    category: "hipHop",
    description: "Inspirado en el mumble rap moderno, con una armonía una quinta por debajo.",
    tune: { speedMs: 0, transitionMs: 10, humanize: 0, flex: 0 },
    lead: { gain: 1 },
    voices: stereoPair(-4, true, 0.5, 0.3),
    compress: 0.3,
    trimDb: -4.5,
  },
  {
    id: "playCard",
    label: "Play Card",
    category: "hipHop",
    description: "Mezcla armonías una octava y una cuarta justa por debajo, con compresión fuerte para un sonido pulido.",
    tune: { speedMs: 5, transitionMs: 20, humanize: 0, flex: 0 },
    lead: { gain: 1 },
    voices: [
      { interval: -12, diatonic: false, gain: 0.5, pan: 0 },
      ...stereoPair(-5, false, 0.38, 0.4),
    ],
    compress: 0.85,
    trimDb: -1.2,
  },
  {
    id: "ocean",
    label: "Ocean",
    category: "hipHop",
    description: "Una armonía fluida y suave una tercera por debajo: un tono cálido, soñador e ingrávido.",
    tune: { speedMs: 45, transitionMs: 110, humanize: 0.3, flex: 0.2 },
    lead: { gain: 1 },
    voices: stereoPair(-2, true, 0.45, 0.65),
    lowpassHz: 7000,
    chorus: { mix: 0.35, depthMs: 4, rateHz: 0.35 },
    reverb: { mix: 0.28, decaySec: 2.6, sizeType: "hall" },
    trimDb: -2,
  },
  {
    id: "telephone",
    label: "Telephone",
    category: "hipHop",
    description: "Una textura lo-fi nítida, perfecta para darle a tu voz un aire de radio retro.",
    tune: { speedMs: 10, transitionMs: 30, humanize: 0, flex: 0 },
    lead: { gain: 1 },
    voices: [],
    highpassHz: 450,
    lowpassHz: 3200,
    drive: { amount: 0.35, mix: 0.6 },
    compress: 0.5,
    trimDb: -2.5,
  },
  // --- Hyperpop ---
  {
    id: "simulacrum",
    label: "Simulacrum",
    category: "hyperpop",
    description: "Una ligera variación de voces armonizadas inspirada en Big Harmony.",
    tune: { speedMs: 0, transitionMs: 0, humanize: 0, flex: 0 },
    lead: { gain: 1 },
    voices: [
      { interval: 2, diatonic: true, gain: 0.42, pan: -0.8 },
      { interval: 4, diatonic: true, gain: 0.42, pan: 0.8, detuneCents: 8, delayMs: 9 },
      { interval: 12, diatonic: false, gain: 0.22, pan: 0.2 },
      { interval: -12, diatonic: false, gain: 0.3, pan: -0.2 },
    ],
    chorus: { mix: 0.2, depthMs: 3, rateHz: 0.9 },
    trimDb: -2,
  },
  {
    id: "ultrashift",
    label: "Ultrashift",
    category: "hyperpop",
    description: "Le da un toque hyperpop a tu voz con armonías dinámicas una quinta justa arriba y una cuarta abajo.",
    tune: { speedMs: 0, transitionMs: 0, humanize: 0, flex: 0 },
    lead: { gain: 1 },
    voices: [
      { interval: 7, diatonic: false, gain: 0.45, pan: -0.6 },
      { interval: -5, diatonic: false, gain: 0.45, pan: 0.6, delayMs: 8 },
    ],
    drive: { amount: 0.15, mix: 0.4 },
    trimDb: -1.4,
  },
  {
    id: "hyper",
    label: "Hyper",
    category: "hyperpop",
    description: "Un sonido distorsionado inspirado en el hyperpop, integrado con Duet para darle un giro original.",
    tune: { speedMs: 0, transitionMs: 0, humanize: 0, flex: 0 },
    lead: { gain: 1 },
    voices: stereoPair(2, true, 0.5, 0.6),
    drive: { amount: 0.65, mix: 0.7 },
    highpassHz: 120,
    trimDb: -0.5,
  },
  {
    id: "bitz",
    label: "Bitz",
    category: "hyperpop",
    description: "Un efecto vocal bit-crushed que le da a tu voz un filo digital característico.",
    tune: { speedMs: 0, transitionMs: 0, humanize: 0, flex: 0 },
    lead: { gain: 1 },
    voices: [],
    crush: { bits: 6, downsample: 6, mix: 0.75 },
  },
  {
    id: "amped",
    label: "Amped",
    category: "hyperpop",
    description: "Un tono vocal potente con un filo robótico, distorsión suave y un chorus estéreo ligero para más amplitud.",
    tune: { speedMs: 0, transitionMs: 5, humanize: 0, flex: 0 },
    lead: { gain: 1 },
    voices: [],
    drive: { amount: 0.3, mix: 0.5 },
    chorus: { mix: 0.4, depthMs: 4, rateHz: 0.6 },
  },
  {
    id: "appleX",
    label: "AppleX",
    category: "hyperpop",
    description: "Un tono cálido y rico con una armonía sutil una tercera abajo, para un sonido profundo y muy amplio.",
    tune: { speedMs: 20, transitionMs: 60, humanize: 0.1, flex: 0 },
    lead: { gain: 1 },
    voices: stereoPair(-2, true, 0.32, 0.95, { delayMs: 18 }),
    drive: { amount: 0.12, mix: 0.5 },
    lowpassHz: 9000,
    chorus: { mix: 0.3, depthMs: 3.5, rateHz: 0.5 },
    reverb: { mix: 0.12, decaySec: 1.8, sizeType: "plate" },
    trimDb: -0.7,
  },
  // --- Sci-Fi ---
  {
    id: "robot",
    label: "Robot",
    category: "sciFi",
    description: "Contiene un efecto vocoder que toma tu voz y la sintetiza en una voz robótica.",
    tune: { speedMs: 0, transitionMs: 0, humanize: 0, flex: 0 },
    lead: { gain: 0.25 },
    voices: [],
    vocoder: { mix: 1, carrier: "follow" },
  },
  {
    id: "futurescape",
    label: "Futurescape",
    category: "sciFi",
    description: "Combina un chorus exuberante con voces armonizadas para una textura vocal futurista.",
    tune: { speedMs: 5, transitionMs: 20, humanize: 0, flex: 0 },
    lead: { gain: 1 },
    voices: [
      { interval: 2, diatonic: true, gain: 0.42, pan: -0.7 },
      { interval: 4, diatonic: true, gain: 0.42, pan: 0.7, detuneCents: 6, delayMs: 11 },
    ],
    chorus: { mix: 0.55, depthMs: 6, rateHz: 0.9 },
    reverb: { mix: 0.2, decaySec: 2.2, sizeType: "hall" },
    trimDb: -2,
  },
  {
    id: "krafty",
    label: "Krafty",
    category: "sciFi",
    description: "Inspirado en los sonidos electrónicos icónicos, con las texturas dinámicas de un Autofilter y modulación Wah.",
    tune: { speedMs: 0, transitionMs: 0, humanize: 0, flex: 0 },
    lead: { gain: 0.5 },
    voices: [],
    vocoder: { mix: 0.7, carrier: "follow" },
    wah: { rateHz: 1.2, mix: 0.75 },
    trimDb: -5,
  },
  {
    id: "gorgon",
    label: "Gorgon",
    category: "sciFi",
    description: "Transforma tu voz bajándola una octava y añadiendo realces para una presencia más grave, envolvente e imponente.",
    tune: { speedMs: 10, transitionMs: 30, humanize: 0, flex: 0 },
    lead: { gain: 0 },
    voices: [{ interval: -12, diatonic: false, gain: 1, pan: 0, formant: 0.78, main: true }],
    drive: { amount: 0.2, mix: 0.4 },
    compress: 0.4,
    lowpassHz: 8000,
    reverb: { mix: 0.1, decaySec: 1.4, sizeType: "room" },
    trimDb: -4,
  },
  {
    id: "halo",
    label: "Halo",
    category: "sciFi",
    description: "Superpone acordes exuberantes tipo sintetizador sobre tu voz, para un toque nítido, electrónico y moderno.",
    tune: { speedMs: 5, transitionMs: 25, humanize: 0, flex: 0 },
    lead: { gain: 1 },
    voices: [],
    vocoder: { mix: 0.6, carrier: "chord" },
    reverb: { mix: 0.25, decaySec: 2, sizeType: "plate" },
    trimDb: -1,
  },
  {
    id: "drone",
    label: "Drone",
    category: "sciFi",
    description: "Añade una capa de drone vocal brillante y profunda, creando una atmósfera espaciosa y etérea.",
    tune: { speedMs: 20, transitionMs: 60, humanize: 0.1, flex: 0 },
    lead: { gain: 1 },
    voices: [],
    vocoder: { mix: 0.55, carrier: "drone" },
    reverb: { mix: 0.35, decaySec: 3.5, sizeType: "hall" },
  },
];
export const AUTOPITCH_RECIPE_BY_ID: Record<AutoPitchPresetId, AutoPitchRecipe> = Object.fromEntries(
  AUTOPITCH_RECIPES.map((r) => [r.id, r])
) as Record<AutoPitchPresetId, AutoPitchRecipe>;
export function autoPitchKeyLabel(settings: Pick<AutoPitchSettings, "key" | "scale">): string {
  const note = NOTE_SHORT_ES[settings.key] ?? "Do";
  switch (settings.scale) {
    case "chromatic":
      return "Cromática";
    case "custom":
      return "Personalizado";
    case "major":
      return `${note} mayor`;
    case "minor":
      return `${note} menor`;
    case "majorPentatonic":
      return `${note} pent. mayor`;
    case "minorPentatonic":
      return `${note} pent. menor`;
  }
}
/** BandLab shows "Lo más intenso" at the top of the Level knob and "Off"
 * with AutoPitch off (both seen in the user's videos); "Heavy" sits around
 * two thirds in the official GIF. The lower two labels are ours. */
export function autoPitchLevelLabel(level: number, enabled: boolean): string {
  if (!enabled) return "Off";
  if (level >= 0.99) return "Lo más intenso";
  if (level >= 0.6) return "Intenso";
  if (level >= 0.3) return "Medio";
  return "Suave";
}
