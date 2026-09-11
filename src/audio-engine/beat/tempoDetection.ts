import type { OnsetEnvelope } from "./onsetDetection";
import type { TempoResult } from "@/types/beat";

const TEMPO_PRIOR_CENTER_BPM = 120;
const TEMPO_PRIOR_SIGMA = 30;

/**
 * Autocorrelation naturally scores a tempo's octaves (half/double time)
 * almost as strongly as the "true" tempo — a hi-hat subdividing the beat,
 * or a chord/bar-length pattern, can easily make the half-time lag win
 * outright, which is exactly what happened during development on a
 * synthesized 120 BPM trap-style beat (it came back 60). There's no way to
 * resolve this from the envelope alone — half vs. double time is often a
 * genuinely ambiguous *musical* question, not just a measurement error, and
 * that's especially true in trap/rage where half-time feel is a deliberate
 * style choice, not a bug. So: a soft prior (a wide Gaussian centered on a
 * typical tempo) nudges the pick toward the more common octave when scores
 * are close, without hard-excluding legitimately slow or fast material —
 * see the confidence score for how sure this actually is.
 */
function tempoPriorWeight(bpm: number): number {
  const delta = bpm - TEMPO_PRIOR_CENTER_BPM;
  return Math.exp(-(delta * delta) / (2 * TEMPO_PRIOR_SIGMA * TEMPO_PRIOR_SIGMA));
}

/**
 * Autocorrelation of the onset-strength envelope itself (not discrete
 * onset times) — the standard "tempogram via autocorrelation" technique.
 * More robust than histogramming inter-onset intervals: it doesn't depend
 * on onset peak-picking getting every hit right, since it works on the
 * continuous envelope directly.
 */
export function estimateTempo(envelope: OnsetEnvelope, minBpm = 60, maxBpm = 200): TempoResult {
  const { flux, hopSec } = envelope;
  if (flux.length < 4) return { bpm: 120, confidence: 0 };

  const mean = flux.reduce((s, v) => s + v, 0) / flux.length;
  const centered = Float32Array.from(flux, (v) => v - mean);

  const minLag = Math.max(1, Math.round(60 / maxBpm / hopSec));
  const maxLag = Math.min(centered.length - 1, Math.round(60 / minBpm / hopSec));
  if (minLag >= maxLag) return { bpm: 120, confidence: 0 };

  const rawScores = new Float32Array(maxLag - minLag + 1);
  let bestLag = minLag;
  let bestWeighted = -Infinity;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < centered.length; i++) sum += centered[i] * centered[i + lag];
    rawScores[lag - minLag] = sum;

    const weighted = sum * tempoPriorWeight(60 / (lag * hopSec));
    if (weighted > bestWeighted) {
      bestWeighted = weighted;
      bestLag = lag;
    }
  }

  let energy = 0;
  for (const v of centered) energy += v * v;
  const rawScoreAtBest = rawScores[bestLag - minLag];
  const confidence = energy > 0 ? Math.max(0, Math.min(1, rawScoreAtBest / energy)) : 0;

  return { bpm: 60 / (bestLag * hopSec), confidence };
}
