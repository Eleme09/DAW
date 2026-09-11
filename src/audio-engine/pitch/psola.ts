import { hannWindow } from "../analysis/fft";
import type { CorrectionFrame } from "./correctionCurve";

/**
 * TD-PSOLA-lite: time-domain pitch-synchronous overlap-add resynthesis.
 *
 * Deliberate simplification, stated plainly: this does **not** preserve
 * formants (no spectral-envelope separation, just period-locked grains) —
 * larger corrections can sound thinner/more "robotic" than a commercial
 * pitch corrector. For this project that's an acceptable trade for now:
 * small corrective shifts (tightening a mostly-in-tune take) sound fine,
 * and a slightly artificial character on large/instant shifts is exactly
 * the aesthetic the "Hard Tune"/"Modern Trap" modes want anyway. Proper
 * formant-preserving PSOLA is a documented future improvement, not a gap
 * pretending to be a feature — see AUDIO_ENGINE.md.
 *
 * Standard two-mark-sequence PSOLA: analysis marks track the input's own
 * detected period (so grains are extracted period-synchronously); synthesis
 * marks span the *same total duration* using the target period, so pitch
 * changes without changing timing. Each synthesis mark borrows its grain
 * from the nearest analysis mark **in time**, not by matching mark index —
 * that decoupling is what keeps duration independent of pitch shift.
 */

const DEFAULT_FALLBACK_HZ = 200; // period spacing used where there's nothing to correct (silence/unvoiced)
const MIN_PERIOD_SAMPLES = 8;

export function psolaShift(
  channelData: Float32Array,
  sampleRate: number,
  correctionCurve: CorrectionFrame[],
  fallbackHz = DEFAULT_FALLBACK_HZ
): Float32Array {
  const durationSec = channelData.length / sampleRate;
  if (correctionCurve.length === 0 || durationSec <= 0) return Float32Array.from(channelData);

  const sampleAt = (timeSec: number) => sampleCorrectionCurve(correctionCurve, timeSec, fallbackHz);

  // 1. Analysis marks: spaced by the input's own (detected) period.
  const analysisMarksSec: number[] = [0];
  const analysisHz: number[] = [sampleAt(0).detectedHz];
  while (true) {
    const t = analysisMarksSec[analysisMarksSec.length - 1];
    if (t >= durationSec) break;
    const { detectedHz } = sampleAt(t);
    analysisMarksSec.push(t + 1 / detectedHz);
    analysisHz.push(sampleAt(analysisMarksSec[analysisMarksSec.length - 1]).detectedHz);
  }

  // 2. Synthesis marks: spaced by the target period, spanning the same duration.
  const synthesisMarksSec: number[] = [0];
  while (true) {
    const t = synthesisMarksSec[synthesisMarksSec.length - 1];
    if (t >= durationSec) break;
    const { detectedHz, shiftRatio } = sampleAt(t);
    const outputPeriod = 1 / detectedHz / shiftRatio;
    synthesisMarksSec.push(t + Math.max(outputPeriod, MIN_PERIOD_SAMPLES / sampleRate));
  }

  // 3. Overlap-add: each synthesis mark borrows a grain from its nearest analysis mark.
  const output = new Float32Array(channelData.length);
  const weight = new Float32Array(channelData.length);
  const windowCache = new Map<number, Float32Array<ArrayBuffer>>();

  let analysisIdx = 0;
  for (const synTime of synthesisMarksSec) {
    while (
      analysisIdx + 1 < analysisMarksSec.length &&
      Math.abs(analysisMarksSec[analysisIdx + 1] - synTime) < Math.abs(analysisMarksSec[analysisIdx] - synTime)
    ) {
      analysisIdx++;
    }

    const periodSamples = Math.max(MIN_PERIOD_SAMPLES, Math.round(sampleRate / analysisHz[analysisIdx]));
    const grainLen = periodSamples * 2;
    let window = windowCache.get(grainLen);
    if (!window) {
      window = hannWindow(grainLen);
      windowCache.set(grainLen, window);
    }

    const centerInput = Math.round(analysisMarksSec[analysisIdx] * sampleRate);
    const centerOutput = Math.round(synTime * sampleRate);

    for (let k = -periodSamples; k < periodSamples; k++) {
      const srcIdx = centerInput + k;
      const dstIdx = centerOutput + k;
      if (srcIdx < 0 || srcIdx >= channelData.length) continue;
      if (dstIdx < 0 || dstIdx >= output.length) continue;
      const w = window[k + periodSamples];
      output[dstIdx] += channelData[srcIdx] * w;
      weight[dstIdx] += w;
    }
  }

  for (let i = 0; i < output.length; i++) {
    if (weight[i] > 1e-6) output[i] /= weight[i];
  }

  return output;
}

function sampleCorrectionCurve(
  curve: CorrectionFrame[],
  timeSec: number,
  fallbackHz: number
): { detectedHz: number; shiftRatio: number } {
  const frame = curve[findFrameIndex(curve, timeSec)];
  if (!frame || frame.detectedFrequencyHz === null || frame.targetFrequencyHz === null) {
    return { detectedHz: fallbackHz, shiftRatio: 1 };
  }
  return { detectedHz: frame.detectedFrequencyHz, shiftRatio: frame.targetFrequencyHz / frame.detectedFrequencyHz };
}

/** Binary search: index of the frame with the largest timeSec <= query. */
function findFrameIndex(curve: CorrectionFrame[], timeSec: number): number {
  let lo = 0;
  let hi = curve.length - 1;
  if (hi < 0) return -1;
  if (timeSec <= curve[0].timeSec) return 0;
  if (timeSec >= curve[hi].timeSec) return hi;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (curve[mid].timeSec <= timeSec) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
