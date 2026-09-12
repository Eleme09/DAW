import { createEffectInstance } from "@/types/effects";
import type { EqBand } from "@/types/effects";
import type {
  EqCutSuggestion,
  GainStagingFinding,
  GainTrimSuggestion,
  MaskingFinding,
} from "@/types/mixAnalysis";

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
