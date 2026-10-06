/**
 * Núcleo (internally still "autoPitch"): a per-track vocal effect that lives
 * OUTSIDE the Fx chain - pitch correction to a key/scale plus, depending on
 * the preset, harmony voices, a vocoder and character effects. It processes
 * live while monitoring and on playback; the recorded take stays dry.
 *
 * The 24 original recipes were engineered from the descriptions in BandLab's
 * AutoPitch FAQ (help.bandlab.com, article 29099155628953), which publishes
 * what each preset does but not the DSP: the numbers (retune speed, voice
 * gains/pans, filter corners...) and the hard-tune preset are ours. Names,
 * groups and descriptions are now our own too (user request: it must not
 * look like BandLab); preset ids stay as they were so saved projects load.
 */

export type AutoPitchCategory = "tune" | "choir" | "texture" | "space";

/** Our own grouping, by what a preset does to the voice. */
export const AUTOPITCH_CATEGORIES: { id: AutoPitchCategory; label: string; hint: string }[] = [
  { id: "tune", label: "Afinar", hint: "Solo afinación" },
  { id: "choir", label: "Coros", hint: "Voces extra en la escala" },
  { id: "texture", label: "Texturas", hint: "Timbre y carácter" },
  { id: "space", label: "Espacio", hint: "Síntesis y atmósfera" },
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
    label: "Baja latencia",
    help: "La mitad de retardo para escucharte mientras grabas. Las voces muy graves pierden algo de calidad.",
  },
  {
    id: "formant",
    label: "Conserva el timbre",
    help: "Cambia el tono sin cambiar los formantes: las armonías conservan el timbre natural de tu voz.",
  },
];

export const NOTE_NAMES_ES = ["Do", "Do#/Re♭", "Re", "Re#/Mi♭", "Mi", "Fa", "Fa#/Sol♭", "Sol", "Sol#/La♭", "La", "La#/Si♭", "Si"];
/** Short form for the header pill ("La mayor", "Mi menor"). */
export const NOTE_SHORT_ES = ["Do", "Do#", "Re", "Mi♭", "Mi", "Fa", "Fa#", "Sol", "La♭", "La", "Si♭", "Si"];

export const MAJOR_MASK = 0b101010110101; // C D E F G A B

export type AutoPitchPresetId =
  | "classic"
  | "hardTune"
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
  /** What it does, in plain Spanish (ours). */
  description: string;
  /** Correction behaviour at full Level - the controls Antares Auto-Tune and
   * Waves Tune Real-Time agree on: `speedMs` pulls the pitch onto the note
   * within a note (Auto-Tune "Retune Speed": 0 = the hard "Auto-Tune
   * effect", 10-50 = natural), `transitionMs` moves between notes (Waves
   * "Note Transition"), `humanize` slows the correction only on the held part
   * of long notes (Auto-Tune "Humanize"), `flex` lets bends and slides
   * through and only corrects near the note (Auto-Tune "Flex-Tune"). */
  tune: { speedMs: number; transitionMs: number; humanize: number; flex: number; hard?: boolean };
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
  {
    id: "classic",
    label: "Imán",
    category: "tune",
    description: "Lleva cada nota a la escala al instante y deja pasar tu vibrato: afinado y todavía suena a ti.",
    tune: { speedMs: 0, transitionMs: 0, humanize: 0, flex: 0 },
    lead: { gain: 1 },
    voices: [],
  },
  {
    // Ours, not one of BandLab's 24: Classic with the pitch LOCKED to the
    // note (no vibrato, drift or cycle-to-cycle wobble left) and a narrow
    // note tolerance, so slides become steps and singing between two notes
    // flips between them - the heavy, obvious autotune sound.
    id: "hardTune",
    label: "Cuántico",
    category: "tune",
    description: "La voz salta de nota en nota sin pasar por el medio, plana y sin vibrato. El autotune que se nota.",
    tune: { speedMs: 0, transitionMs: 0, humanize: 0, flex: 0, hard: true },
    lead: { gain: 1 },
    voices: [],
  },
  {
    id: "duet",
    label: "Binaria",
    category: "choir",
    description: "Tu voz y una segunda voz una tercera arriba, abierta a los dos lados.",
    tune: { speedMs: 15, transitionMs: 40, humanize: 0.1, flex: 0 },
    lead: { gain: 1 },
    voices: stereoPair(2, true, 0.5, 0.6),
    trimDb: -1.5,
  },
  {
    id: "bigHarmony",
    label: "Galaxia",
    category: "choir",
    description: "Coro grande: tercera y quinta arriba, cuarta y octava abajo, con chorus y sala.",
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
    label: "Humano",
    category: "tune",
    description: "Corrige despacio y solo cerca de la nota: deja pasar deslizamientos y adornos. Con un poco de compresión y sala.",
    tune: { speedMs: 40, transitionMs: 120, humanize: 0.5, flex: 0.5 },
    lead: { gain: 1 },
    voices: [],
    compress: 0.3,
    reverb: { mix: 0.07, decaySec: 1.1, sizeType: "room" },
    trimDb: 0,
  },
  {
    id: "third",
    label: "Luna",
    category: "choir",
    description: "Una voz una tercera abajo, pegada a la tuya: más cuerpo sin que se note el truco.",
    tune: { speedMs: 20, transitionMs: 50, humanize: 0.15, flex: 0 },
    lead: { gain: 1 },
    voices: stereoPair(-2, true, 0.5, 0.35),
    trimDb: -1.5,
  },
  {
    id: "chip",
    label: "Helio",
    category: "texture",
    description: "Una capa una octava arriba con timbre de helio y vibrato: la voz de ardilla.",
    tune: { speedMs: 10, transitionMs: 30, humanize: 0, flex: 0 },
    lead: { gain: 1 },
    voices: [{ interval: 12, diatonic: false, gain: 0.7, pan: 0, formant: 1.9 }],
    vibrato: { rateHz: 6, cents: 30 },
    highpassHz: 160,
    chorus: { mix: 0.3, depthMs: 2.5, rateHz: 1.1 },
    trimDb: -2,
  },
  {
    id: "modernRap",
    label: "Tierra",
    category: "texture",
    description: "Tu voz con una copia una octava abajo y compresión: más peso para rap.",
    tune: { speedMs: 10, transitionMs: 30, humanize: 0, flex: 0 },
    lead: { gain: 1 },
    voices: [{ interval: -12, diatonic: false, gain: 0.6, pan: 0 }],
    compress: 0.35,
    trimDb: -1,
  },
  {
    id: "stone",
    label: "Cumbre",
    category: "choir",
    description: "Una armonía una cuarta arriba a los dos lados: levanta los estribillos.",
    tune: { speedMs: 15, transitionMs: 40, humanize: 0.1, flex: 0 },
    lead: { gain: 1 },
    voices: stereoPair(3, true, 0.45, 0.5),
    trimDb: -1.5,
  },
  {
    id: "yummy",
    label: "Bruma",
    category: "choir",
    description: "Una quinta abajo con afinación instantánea: voz oscura y pegada, para trap melódico.",
    tune: { speedMs: 0, transitionMs: 10, humanize: 0, flex: 0 },
    lead: { gain: 1 },
    voices: stereoPair(-4, true, 0.5, 0.3),
    compress: 0.3,
    trimDb: -1.4,
  },
  {
    id: "playCard",
    label: "Titán",
    category: "choir",
    description: "Una octava y dos cuartas abajo con compresión fuerte: pesado y al frente.",
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
    label: "Deriva",
    category: "choir",
    description: "Una tercera abajo muy abierta, corrección lenta, chorus y sala larga: suena a sueño.",
    tune: { speedMs: 45, transitionMs: 110, humanize: 0.3, flex: 0.2 },
    lead: { gain: 1 },
    voices: stereoPair(-2, true, 0.45, 0.65),
    lowpassHz: 7000,
    chorus: { mix: 0.35, depthMs: 4, rateHz: 0.35 },
    reverb: { mix: 0.28, decaySec: 2.6, sizeType: "hall" },
    trimDb: -1.6,
  },
  {
    id: "telephone",
    label: "Señal",
    category: "texture",
    description: "Banda estrecha y saturada, como una radio o un teléfono viejo.",
    tune: { speedMs: 10, transitionMs: 30, humanize: 0, flex: 0 },
    lead: { gain: 1 },
    voices: [],
    highpassHz: 450,
    lowpassHz: 3200,
    drive: { amount: 0.35, mix: 0.6 },
    compress: 0.5,
    trimDb: 0,
  },
  {
    id: "simulacrum",
    label: "Espejo",
    category: "choir",
    description: "Cuatro voces (tercera y quinta arriba, octava arriba y abajo) con chorus y afinación instantánea.",
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
    label: "Plasma",
    category: "choir",
    description: "Una quinta arriba y una cuarta abajo, abiertas y algo saturadas: hyperpop.",
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
    label: "Voltaje",
    category: "texture",
    description: "Distorsión fuerte más una tercera arriba a los dos lados: hyperpop agresivo.",
    tune: { speedMs: 0, transitionMs: 0, humanize: 0, flex: 0 },
    lead: { gain: 1 },
    voices: stereoPair(2, true, 0.5, 0.6),
    drive: { amount: 0.65, mix: 0.7 },
    highpassHz: 120,
    trimDb: -1.6,
  },
  {
    id: "bitz",
    label: "Píxel",
    category: "texture",
    description: "Voz digitalizada con pocos bits y muestreo bajo: filo de videojuego.",
    tune: { speedMs: 0, transitionMs: 0, humanize: 0, flex: 0 },
    lead: { gain: 1 },
    voices: [],
    crush: { bits: 6, downsample: 6, mix: 0.75 },
  },
  {
    id: "amped",
    label: "Ion",
    category: "texture",
    description: "Saturación suave y chorus ancho con afinación casi instantánea: brillo con filo.",
    tune: { speedMs: 0, transitionMs: 5, humanize: 0, flex: 0 },
    lead: { gain: 1 },
    voices: [],
    drive: { amount: 0.3, mix: 0.5 },
    chorus: { mix: 0.4, depthMs: 4, rateHz: 0.6 },
  },
  {
    id: "appleX",
    label: "Ámbar",
    category: "choir",
    description: "Terceras abajo en los extremos, tono cálido con chorus y placa: ancho y suave.",
    tune: { speedMs: 20, transitionMs: 60, humanize: 0.1, flex: 0 },
    lead: { gain: 1 },
    voices: stereoPair(-2, true, 0.32, 0.95, { delayMs: 18 }),
    drive: { amount: 0.12, mix: 0.5 },
    lowpassHz: 9000,
    chorus: { mix: 0.3, depthMs: 3.5, rateHz: 0.5 },
    reverb: { mix: 0.12, decaySec: 1.8, sizeType: "plate" },
    trimDb: -0.7,
  },
  {
    id: "robot",
    label: "Autómata",
    category: "space",
    description: "Un vocoder sigue tu nota y la voz se vuelve máquina.",
    tune: { speedMs: 0, transitionMs: 0, humanize: 0, flex: 0 },
    lead: { gain: 0.25 },
    voices: [],
    vocoder: { mix: 1, carrier: "follow" },
  },
  {
    id: "futurescape",
    label: "Hiperespacio",
    category: "space",
    description: "Tercera y quinta arriba con un chorus profundo y sala: textura futurista.",
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
    label: "Frecuencia",
    category: "space",
    description: "Vocoder y un filtro wah que se mueve solo: electrónica clásica.",
    tune: { speedMs: 0, transitionMs: 0, humanize: 0, flex: 0 },
    lead: { gain: 0.5 },
    voices: [],
    vocoder: { mix: 0.7, carrier: "follow" },
    wah: { rateHz: 1.2, mix: 0.75 },
    trimDb: -5,
  },
  {
    id: "gorgon",
    label: "Coloso",
    category: "texture",
    description: "Toda la voz una octava abajo con timbre de gigante, saturación y una sala corta.",
    tune: { speedMs: 10, transitionMs: 30, humanize: 0, flex: 0 },
    lead: { gain: 0 },
    voices: [{ interval: -12, diatonic: false, gain: 1, pan: 0, formant: 0.78, main: true }],
    drive: { amount: 0.2, mix: 0.4 },
    compress: 0.4,
    lowpassHz: 8000,
    reverb: { mix: 0.1, decaySec: 1.4, sizeType: "room" },
    trimDb: 1,
  },
  {
    id: "halo",
    label: "Corona",
    category: "space",
    description: "Un acorde de sintetizador (tu nota, su tercera y su quinta) sigue tu voz, con placa.",
    tune: { speedMs: 5, transitionMs: 25, humanize: 0, flex: 0 },
    lead: { gain: 1 },
    voices: [],
    vocoder: { mix: 0.6, carrier: "chord" },
    reverb: { mix: 0.25, decaySec: 2, sizeType: "plate" },
    trimDb: -1,
  },
  {
    id: "drone",
    label: "Eclipse",
    category: "space",
    description: "Un zumbido de sintetizador fijo en la tónica de la clave bajo tu voz, con sala larga.",
    tune: { speedMs: 20, transitionMs: 60, humanize: 0.1, flex: 0 },
    lead: { gain: 1 },
    voices: [],
    vocoder: { mix: 0.55, carrier: "drone" },
    reverb: { mix: 0.35, decaySec: 3.5, sizeType: "hall" },
    trimDb: -0.6,
  },
];
export const AUTOPITCH_RECIPE_BY_ID: Record<AutoPitchPresetId, AutoPitchRecipe> = Object.fromEntries(
  AUTOPITCH_RECIPES.map((r) => [r.id, r])
) as Record<AutoPitchPresetId, AutoPitchRecipe>;

/** Display order inside each group (the array above keeps its history). */
const AUTOPITCH_ORDER: AutoPitchPresetId[] = [
  "classic", "hardTune", "natural",
  "duet", "third", "bigHarmony", "stone", "yummy", "ocean", "playCard", "simulacrum", "ultrashift", "appleX",
  "modernRap", "gorgon", "chip", "telephone", "amped", "hyper", "bitz",
  "robot", "halo", "futurescape", "krafty", "drone",
];

/** The presets of one group, in display order. */
export function autoPitchPresetsIn(category: AutoPitchCategory): AutoPitchRecipe[] {
  return AUTOPITCH_ORDER.map((id) => AUTOPITCH_RECIPE_BY_ID[id]).filter((r) => r.category === category);
}

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
/** The Level control is the nucleus' pull ("Fuerza"): how hard the voice is
 * drawn to the notes. */
export function autoPitchLevelLabel(level: number, enabled: boolean): string {
  if (!enabled) return "Apagado";
  if (level >= 0.99) return "Atracción total";
  if (level >= 0.6) return "Fuerte";
  if (level >= 0.3) return "Media";
  return "Suave";
}
