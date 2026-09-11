import { VOCAL_BANDS, type Band } from "./spectralAnalysis";
import type { GainStagingFinding, MaskingFinding, TrackBandProfile } from "@/types/mixAnalysis";

/**
 * Pure session-wide diagnostic logic (Phase 10) — no AudioContext, no
 * rendering, just comparisons across already-measured per-track profiles.
 * `mixAnalysis.ts` is the glue that actually renders each track (via
 * bounce.ts) to produce those profiles; this file is unit-testable with
 * synthetic profiles the way vocalEngineerChain.ts's tests operate on
 * synthetic VocalAnalysisResult objects instead of real audio.
 *
 * Both checks are rule-based comparisons, not ML — same principle-3
 * reasoning as every other "AI" feature in this project (see
 * AI_FEATURES.md).
 */

/**
 * A band share above ~1.3x the flat-share baseline (1/8 bands ≈ 0.125)
 * counts as "concentrated" — an explicit, tunable threshold, not a
 * statistically derived one.
 */
const MASKING_SHARE_THRESHOLD = 0.16;
const MAX_MASKING_FINDINGS = 8;
/** How far a track's RMS has to sit from the session median before it's worth flagging. */
const GAIN_STAGING_FLAG_DB = 6;

function bandCenterHz(band: Band): number {
  return Math.sqrt(band.minHz * band.maxHz);
}

/**
 * Flags track pairs that both concentrate a significant share of their own
 * energy in the same frequency band — a real, well-known mixing risk (two
 * sources competing for the same sonic space). A broad, already-balanced
 * mix naturally keeps per-band shares low and won't trigger this; two
 * narrow, similarly-voiced sources (e.g. two vocal doubles, or a vocal and
 * a bass-heavy 808 both loud in the same band) will.
 */
export function detectMasking(profiles: TrackBandProfile[]): MaskingFinding[] {
  const findings: MaskingFinding[] = [];
  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const a = profiles[i];
      const b = profiles[j];
      if (!a.bandShares || !b.bandShares) continue;
      for (const band of VOCAL_BANDS) {
        const shareA = a.bandShares[band.name] ?? 0;
        const shareB = b.bandShares[band.name] ?? 0;
        if (shareA >= MASKING_SHARE_THRESHOLD && shareB >= MASKING_SHARE_THRESHOLD) {
          findings.push({
            trackAId: a.trackId,
            trackAName: a.trackName,
            trackBId: b.trackId,
            trackBName: b.trackName,
            band: band.name,
            freqHz: bandCenterHz(band),
            overlapScore: Math.min(shareA, shareB),
          });
        }
      }
    }
  }
  findings.sort((x, y) => y.overlapScore - x.overlapScore);
  return findings.slice(0, MAX_MASKING_FINDINGS);
}

/**
 * Flags tracks whose rendered level sits well away from the session's
 * median track level — a simple, explainable proxy for "this needs a
 * fader move," not a loudness-matching algorithm. Silent/fully-muted
 * tracks (rmsDb === -Infinity) are excluded from both the median and the
 * findings — they aren't part of the mix to stage.
 */
export function detectGainStaging(profiles: TrackBandProfile[]): GainStagingFinding[] {
  const audible = profiles.filter((p) => Number.isFinite(p.rmsDb));
  if (audible.length < 2) return [];

  const sorted = [...audible].sort((a, b) => a.rmsDb - b.rmsDb);
  const median = sorted[Math.floor(sorted.length / 2)].rmsDb;

  const findings: GainStagingFinding[] = [];
  for (const p of audible) {
    const delta = p.rmsDb - median;
    if (Math.abs(delta) >= GAIN_STAGING_FLAG_DB) {
      findings.push({
        trackId: p.trackId,
        trackName: p.trackName,
        rmsDb: p.rmsDb,
        deltaFromMedianDb: delta,
        direction: delta > 0 ? "louder" : "quieter",
      });
    }
  }
  return findings.sort((a, b) => Math.abs(b.deltaFromMedianDb) - Math.abs(a.deltaFromMedianDb));
}
