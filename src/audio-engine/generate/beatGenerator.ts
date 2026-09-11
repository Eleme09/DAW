import { buildChordEvents, pickProgression } from "./progressions";
import { generateDrumEvents } from "./drumPatterns";
import { generateBassEvents } from "./bassGenerator";
import { generateMelodyEvents } from "./melodyGenerator";
import type { GenerateBeatOptions, GeneratedBeat } from "@/types/beatGen";

const DEFAULT_BARS_PER_CHORD = 2;

/** Deterministic string hash — same inputs always produce the same seed, so generation is reproducible. */
function hashSeed(options: GenerateBeatOptions): number {
  const s = `${options.genre}:${options.mood}:${options.key}:${options.scale}:${options.seed ?? 0}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/**
 * Orchestrates the whole rule-based generation pipeline: picks a
 * progression, builds chords from it, generates a drum pattern for the
 * chosen genre/mood, then derives bass (from the drums) and melody (from
 * the chords). Pure and deterministic — no AudioContext, no audio
 * synthesis here (see generate/synthesizeBeat.ts for that half).
 */
export function generateBeat(options: GenerateBeatOptions): GeneratedBeat {
  const seed = hashSeed(options);
  const progressionDegrees = pickProgression(options.scale, seed);
  const bars = options.bars ?? progressionDegrees.length * DEFAULT_BARS_PER_CHORD;
  if (bars % progressionDegrees.length !== 0) {
    throw new Error(`bars (${bars}) must be a multiple of the progression length (${progressionDegrees.length})`);
  }

  const chords = buildChordEvents(progressionDegrees, options.key, options.scale, bars);
  const drums = generateDrumEvents(options.genre, options.mood, bars, seed);
  const bass = generateBassEvents(chords, drums);
  const melody = generateMelodyEvents(chords);

  return {
    bpm: options.bpm,
    key: options.key,
    scale: options.scale,
    genre: options.genre,
    mood: options.mood,
    bars,
    progressionDegrees,
    chords,
    drums,
    bass,
    melody,
  };
}
