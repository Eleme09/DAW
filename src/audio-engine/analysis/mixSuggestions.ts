import { createEffectInstance } from "@/types/effects";
import type { EqBand } from "@/types/effects";
import { VOCAL_BANDS, type Band } from "./spectralAnalysis";
import { bandCenterHz } from "./mixDiagnostics";
import type {
  EqCutSuggestion,
  GainStagingFinding,
  GainTrimSuggestion,
  MaskingFinding,
  MasterToneSuggestion,
  PanSuggestion,
} from "@/types/mixAnalysis";
import type { Severity } from "@/types/analysis";
import type { Track } from "@/types/project";

/**
 * Turns mixDiagnostics.ts findings into concrete, ready-to-apply
 * `EffectInstance`/param changes — the "AI proposes" half of principle 3
 * (AI_FEATURES.md). Nothing here mutates a project; every suggestion is
 * data the UI shows and the user explicitly applies (or doesn't) through
 * the normal store actions, same as every other chain-builder in this
 * project. Pure functions, no AudioContext — unit-tested directly.
 */

const EQ_CUT_GAIN_DB = -3;
const EQ_CUT_Q = 1.4;

function makeEqCutEffect(freqHz: number) {
  const eq = createEffectInstance("eq");
  if (eq.type !== "eq") throw new Error("unreachable"); // createEffectInstance("eq") always returns an eq instance
  const band: EqBand = {
    id: crypto.randomUUID(),
    type: "peaking",
    freq: Math.round(freqHz),
    gainDb: EQ_CUT_GAIN_DB,
    q: EQ_CUT_Q,
    enabled: true,
  };
  eq.params.bands = [band];
  return eq;
}

/**
 * One masking finding produces two independent suggestions, one per
 * track — the user picks whichever side makes sense for their mix (which
 * track is "in the way" isn't something this can know), never both.
 */
export function buildMaskingSuggestions(findings: MaskingFinding[]): EqCutSuggestion[] {
  const suggestions: EqCutSuggestion[] = [];
  for (const f of findings) {
    const reason =
      `${f.trackAName} y ${f.trackBName} concentran energía cerca de ` +
      `${Math.round(f.freqHz)}Hz (${f.band}) — cortar aquí en una de ellas puede hacerle espacio a la otra.`;
    suggestions.push({
      kind: "eqCut",
      id: crypto.randomUUID(),
      trackId: f.trackAId,
      trackName: f.trackAName,
      band: f.band,
      freqHz: f.freqHz,
      effect: makeEqCutEffect(f.freqHz),
      reason,
      pairedWithTrackId: f.trackBId,
    });
    suggestions.push({
      kind: "eqCut",
      id: crypto.randomUUID(),
      trackId: f.trackBId,
      trackName: f.trackBName,
      band: f.band,
      freqHz: f.freqHz,
      effect: makeEqCutEffect(f.freqHz),
      reason,
      pairedWithTrackId: f.trackAId,
    });
  }
  return suggestions;
}

export function buildGainStagingSuggestions(findings: GainStagingFinding[]): GainTrimSuggestion[] {
  return findings.map((f) => ({
    kind: "gainTrim",
    id: crypto.randomUUID(),
    trackId: f.trackId,
    trackName: f.trackName,
    deltaDb: Math.round(-f.deltaFromMedianDb * 10) / 10,
    reason:
      `${f.trackName} está unos ${Math.abs(f.deltaFromMedianDb).toFixed(1)}dB más ${f.direction === "louder" ? "alta" : "baja"} que ` +
      `el nivel típico de pista de esta sesión.`,
  }));
}

/** How far apart (in pan units) a suggested move pushes the pair. */
const PAN_SEPARATION = 0.3;
/** Pair already counts as separated when both sit at least this far from center on opposite sides. */
const ALREADY_SEPARATED_PAN = 0.25;

/**
 * Reuses the same masking pairs as buildMaskingSuggestions, but proposes a
 * pan move instead of an EQ cut — a second, independent way to address the
 * same real finding (panning doesn't remove the frequency overlap, it only
 * separates the two sources in the stereo field). One suggestion pair per
 * track pair, even if they share several overlapping bands — more bands in
 * common doesn't call for more pan moves.
 */
export function buildPanSuggestions(findings: MaskingFinding[], tracks: Track[]): PanSuggestion[] {
  const trackById = new Map(tracks.map((t) => [t.id, t]));
  const seenPairs = new Set<string>();
  const suggestions: PanSuggestion[] = [];

  for (const f of findings) {
    const pairKey = [f.trackAId, f.trackBId].sort().join("|");
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    const trackA = trackById.get(f.trackAId);
    const trackB = trackById.get(f.trackBId);
    if (!trackA || !trackB) continue;

    const alreadySeparated =
      Math.sign(trackA.pan) !== Math.sign(trackB.pan) &&
      Math.abs(trackA.pan) >= ALREADY_SEPARATED_PAN &&
      Math.abs(trackB.pan) >= ALREADY_SEPARATED_PAN;
    if (alreadySeparated) continue;

    const reason =
      `${f.trackAName} y ${f.trackBName} compiten por espacio cerca de ${Math.round(f.freqHz)}Hz (${f.band}) ` +
      `y ambas están cerca del centro — esto no quita la superposición de frecuencia, pero separarlas en el ` +
      `campo estéreo puede ayudar a que se perciban menos encima una de la otra.`;

    suggestions.push({
      kind: "panSeparation",
      id: crypto.randomUUID(),
      trackId: trackA.id,
      trackName: trackA.name,
      targetPan: Math.max(-1, Math.min(1, trackA.pan - PAN_SEPARATION)),
      pairedWithTrackId: trackB.id,
      reason,
    });
    suggestions.push({
      kind: "panSeparation",
      id: crypto.randomUUID(),
      trackId: trackB.id,
      trackName: trackB.name,
      targetPan: Math.max(-1, Math.min(1, trackB.pan + PAN_SEPARATION)),
      pairedWithTrackId: trackA.id,
      reason,
    });
  }
  return suggestions;
}

const MASTER_EQ_CUT_GAIN_DB = -2;
const MASTER_EQ_CUT_Q = 1.0;

function makeMasterEqCutEffect(freqHz: number) {
  const eq = createEffectInstance("eq");
  if (eq.type !== "eq") throw new Error("unreachable"); // createEffectInstance("eq") always returns an eq instance
  const band: EqBand = {
    id: crypto.randomUUID(),
    type: "peaking",
    freq: Math.round(freqHz),
    gainDb: MASTER_EQ_CUT_GAIN_DB,
    q: MASTER_EQ_CUT_Q,
    enabled: true,
  };
  eq.params.bands = [band];
  return eq;
}

function findBand(name: string): Band {
  const band = VOCAL_BANDS.find((b) => b.name === name);
  if (!band) throw new Error(`unreachable: unknown band "${name}"`);
  return band;
}

type MasterToneKind = "lowEnd" | "mud" | "harshness" | "sibilance";

/**
 * Which real VOCAL_BANDS band grounds each severity read. lowEnd itself is
 * averaged from subBass+bass in vocalAnalysis.ts, but subBass (20-60Hz) is
 * rarely a practical EQ target (mostly inaudible on phone speakers/earbuds,
 * the project's own stated context) — bass (60-250Hz) is the honest,
 * actionable representative for "boomy low end."
 */
const MASTER_TONE_BAND_BY_KIND: Record<MasterToneKind, string> = {
  lowEnd: "bass",
  mud: "lowMid",
  harshness: "highMid",
  sibilance: "sibilance",
};

const MASTER_TONE_LABEL: Record<MasterToneKind, string> = {
  lowEnd: "graves",
  mud: "barro",
  harshness: "aspereza",
  sibilance: "sibilancia",
};

/**
 * Turns the mix-wide mud/harshness/sibilance/lowEnd severities (already
 * computed by analyzeVocalChannel, already shown in the UI) into an actual
 * master-bus EQ suggestion — until now those readouts were purely
 * informational with no corresponding action. Only fires on "high": at
 * "medium" the read is already a borderline call, not solid enough to
 * propose a specific frequency to cut on the whole mix.
 */
export function buildMasterToneSuggestions(mix: {
  lowEnd: Severity;
  mud: Severity;
  harshness: Severity;
  sibilance: Severity;
}): MasterToneSuggestion[] {
  const suggestions: MasterToneSuggestion[] = [];
  for (const kind of Object.keys(MASTER_TONE_BAND_BY_KIND) as MasterToneKind[]) {
    if (mix[kind] !== "high") continue;
    const band = findBand(MASTER_TONE_BAND_BY_KIND[kind]);
    const freqHz = bandCenterHz(band);
    suggestions.push({
      kind: "masterTone",
      id: crypto.randomUUID(),
      trackId: "master",
      trackName: "Master",
      band: band.name,
      freqHz,
      severity: mix[kind],
      effect: makeMasterEqCutEffect(freqHz),
      reason:
        `La mezcla completa lee ${MASTER_TONE_LABEL[kind]} alta, concentrada cerca de ${Math.round(freqHz)}Hz — ` +
        `un corte suave ahí en el bus master puede ayudar.`,
    });
  }
  return suggestions;
}
