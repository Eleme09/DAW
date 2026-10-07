import type { Project } from "@/types/project";

/**
 * What each processor costs, measured: % of one desktop core (Xeon 2.8 GHz,
 * Chromium) to run it in real time at 48 kHz on a sung vocal (offline
 * render of 20 s, an empty chain subtracted). A phone is not that core -
 * these are for comparing sessions and finding the heavy parts, not a
 * promise of what an iPhone does. Re-measure with the benchmark in
 * PROGRESS.md ("Lag al repetir tomas") when a processor changes.
 */
export const EFFECT_COST: Record<string, number> = {
  eq: 0.8,
  compressor: 1.1,
  deesser: 1.8,
  saturation: 0.9,
  limiter: 1.2,
  clipper: 1.3,
  noiseGate: 0.8,
  reverb: 3.6,
  delay: 1.0,
  multibandCompressor: 4.6,
  chorus: 0.8,
  flanger: 0.7,
  exciter: 1.7,
  autoPan: 0.7,
  stereoWidth: 0.6,
  pitchCorrection: 24.4,
  vocoder: 5.1,
  pitchShift: 11.1,
};

/** Núcleo per preset (same bench); unknown presets count as the heaviest. */
export const NUCLEO_COST: Record<string, number> = {
  classic: 9.2, hardTune: 9.8, natural: 16.1, duet: 10.7, third: 11.0, bigHarmony: 16.5, stone: 10.6, yummy: 12.4,
  ocean: 18.5, playCard: 12.6, simulacrum: 13.7, ultrashift: 10.3, appleX: 17.7, modernRap: 11.4, gorgon: 16.9,
  chip: 11.9, telephone: 10.5, amped: 12.1, hyper: 11.7, bitz: 11.3, robot: 12.5, futurescape: 17.8, krafty: 13.9,
  halo: 17.1, drone: 18.1,
};
const NUCLEO_MAX = 18.5;
export const MASTERING_COST = 11.6;
export const OUTPUT_GUARD_COST = 0.6;

export interface SessionWeight {
  /** Sum of the measured costs of everything that runs (see above). */
  total: number;
  /** The heaviest parts, heaviest first. */
  parts: { label: string; cost: number }[];
}

/** How heavy the session is for the audio thread, from what runs in it:
 * every track with audio (its Núcleo and active effects), the master
 * effects and the mastering. */
export function sessionWeight(project: Project): SessionWeight {
  const parts: { label: string; cost: number }[] = [];
  for (const t of project.tracks) {
    if (t.muted || !t.clips.some((c) => !c.muted)) continue;
    let cost = 0;
    if (t.autoPitch?.enabled) cost += NUCLEO_COST[t.autoPitch.presetId] ?? NUCLEO_MAX;
    for (const e of t.inserts) if (!e.bypassed) cost += EFFECT_COST[e.type] ?? 2;
    if (cost > 0) parts.push({ label: t.name, cost });
  }
  let master = OUTPUT_GUARD_COST;
  for (const e of project.masterInserts) if (!e.bypassed) master += EFFECT_COST[e.type] ?? 2;
  parts.push({ label: "Máster", cost: master });
  if (project.mastering?.enabled) parts.push({ label: "Masterizar", cost: MASTERING_COST });
  parts.sort((a, b) => b.cost - a.cost);
  const total = parts.reduce((a, p) => a + p.cost, 0);
  return { total: Math.round(total * 10) / 10, parts: parts.map((p) => ({ ...p, cost: Math.round(p.cost * 10) / 10 })) };
}
