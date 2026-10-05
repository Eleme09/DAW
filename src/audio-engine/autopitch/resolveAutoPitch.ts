import {
  AUTOPITCH_RECIPE_BY_ID,
  AUTOPITCH_SCALES,
  type AutoPitchSettings,
} from "@/types/autoPitch";

export const AUTOPITCH_MAX_VOICES = 4;

/** Every AudioParam of public/worklets/autopitch-processor.js, by name. The
 * worklet reads them all as k-rate values; AutoPitchEffect writes them
 * straight from this object, so the names here ARE the worklet's names. */
export interface AutoPitchWorkletParams {
  key: number;
  scaleIndex: number;
  customMask: number;
  referenceHz: number;
  /** 0..1 share of the distance to the note that gets corrected (Waves
   * "Correction %"). Never a dry/wet blend: blending a delayed corrected
   * voice with the dry one is a comb filter. */
  amount: number;
  speedMs: number;
  transitionMs: number;
  humanize: number;
  flex: number;
  lowLatency: number;
  formantFollow: number;
  leadGain: number;
  vibRate: number;
  vibCents: number;
  vocMix: number;
  vocCarrier: number;
  crushBits: number;
  crushDown: number;
  crushMix: number;
  wahMix: number;
  wahRate: number;
  driveAmt: number;
  driveMix: number;
  hpHz: number;
  lpHz: number;
  comp: number;
  chorusMix: number;
  chorusDepth: number;
  chorusRate: number;
  outGain: number;
  [voiceParam: `v${number}${"Active" | "Interval" | "Diatonic" | "Gain" | "Pan" | "Formant" | "Detune" | "Delay"}`]: number;
}

export interface AutoPitchReverb {
  mix: number;
  decaySec: number;
  sizeType: "room" | "hall" | "plate";
}

export interface ResolvedAutoPitch {
  worklet: AutoPitchWorkletParams;
  reverb: AutoPitchReverb | null;
}

const VOCODER_CARRIER_INDEX = { follow: 0, chord: 1, drone: 2 } as const;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Geometric interpolation - for filter corners, where "halfway" is in octaves. */
function lerpLog(a: number, b: number, t: number): number {
  return Math.exp(lerp(Math.log(a), Math.log(b), t));
}

/**
 * Turns the user-facing AutoPitch state (preset + Level knob + key + advanced
 * settings) into the worklet's numbers. Pure, so the Level mapping is tested.
 *
 * Level, matched to what the user's BandLab recording shows (100% = notes
 * snap flat; 61%/17% = the voice glides between notes): Level first slows the
 * correction down (speed and transition +250 ms at 0) and only below 50% also
 * stops correcting all the way. Every layer the preset adds on top
 * (harmonies, vocoder, character effects, reverb) scales with Level.
 */
export function resolveAutoPitch(settings: AutoPitchSettings): ResolvedAutoPitch {
  const recipe = AUTOPITCH_RECIPE_BY_ID[settings.presetId] ?? AUTOPITCH_RECIPE_BY_ID.classic;
  const level = Math.min(1, Math.max(0, settings.level));
  const harmonyMix = Math.min(1, Math.max(0, settings.harmonyMix));
  const slow = (1 - level) * 250;

  const worklet: AutoPitchWorkletParams = {
    key: ((Math.round(settings.key) % 12) + 12) % 12,
    scaleIndex: Math.max(0, AUTOPITCH_SCALES.findIndex((s) => s.id === settings.scale)),
    customMask: settings.customMask & 0xfff,
    referenceHz: 440,
    amount: level >= 0.5 ? 1 : level * 2,
    speedMs: recipe.tune.speedMs + slow,
    transitionMs: recipe.tune.transitionMs + slow,
    humanize: recipe.tune.humanize,
    flex: recipe.tune.flex,
    lowLatency: settings.algorithm === "lowLatency" ? 1 : 0,
    // "Original" lets the harmony voices' timbre move with their pitch (the
    // classic harmonizer sound BandLab calls "less transparent"); the
    // formant-preserving algorithm keeps it.
    formantFollow: settings.algorithm === "formant" ? 0 : 1,
    leadGain: lerp(1, recipe.lead.gain, level),
    vibRate: recipe.vibrato?.rateHz ?? 0,
    vibCents: (recipe.vibrato?.cents ?? 0) * level,
    vocMix: (recipe.vocoder?.mix ?? 0) * level,
    vocCarrier: VOCODER_CARRIER_INDEX[recipe.vocoder?.carrier ?? "follow"],
    crushBits: recipe.crush?.bits ?? 16,
    crushDown: recipe.crush?.downsample ?? 1,
    crushMix: (recipe.crush?.mix ?? 0) * level,
    wahMix: (recipe.wah?.mix ?? 0) * level,
    wahRate: recipe.wah?.rateHz ?? 1,
    driveAmt: recipe.drive?.amount ?? 0,
    driveMix: (recipe.drive?.mix ?? 0) * level,
    hpHz: recipe.highpassHz ? lerpLog(20, recipe.highpassHz, level) : 20,
    lpHz: recipe.lowpassHz ? lerpLog(20000, recipe.lowpassHz, level) : 20000,
    comp: (recipe.compress ?? 0) * level,
    chorusMix: (recipe.chorus?.mix ?? 0) * level,
    chorusDepth: recipe.chorus?.depthMs ?? 3,
    chorusRate: recipe.chorus?.rateHz ?? 0.5,
    outGain: Math.pow(10, ((recipe.trimDb ?? 0) * level) / 20),
  };

  for (let i = 0; i < AUTOPITCH_MAX_VOICES; i++) {
    const v = recipe.voices[i];
    worklet[`v${i}Active`] = v ? 1 : 0;
    worklet[`v${i}Interval`] = v?.interval ?? 0;
    worklet[`v${i}Diatonic`] = v?.diatonic ? 1 : 0;
    worklet[`v${i}Gain`] = v ? v.gain * level * (v.main ? 1 : harmonyMix) : 0;
    worklet[`v${i}Pan`] = v?.pan ?? 0;
    worklet[`v${i}Formant`] = v?.formant ?? 0;
    worklet[`v${i}Detune`] = v?.detuneCents ?? 0;
    worklet[`v${i}Delay`] = v?.delayMs ?? 0;
  }

  const reverb = recipe.reverb && level > 0 ? { ...recipe.reverb, mix: recipe.reverb.mix * level } : null;
  return { worklet, reverb };
}

/** Constant delay of the AutoPitch output vs. its input, per algorithm - the
 * worklet's lead-voice latency (see its header). Used to start that track's
 * clips earlier on playback so the tuned voice stays on the beat. */
export function autoPitchLatencySec(lowLatency: boolean): number {
  return lowLatency ? AUTOPITCH_LOW_LATENCY_SEC : AUTOPITCH_LATENCY_SEC;
}

export const AUTOPITCH_LATENCY_SEC = 0.026;
export const AUTOPITCH_LOW_LATENCY_SEC = 0.014;
