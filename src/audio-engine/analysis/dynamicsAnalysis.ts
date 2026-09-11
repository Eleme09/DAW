import { computePeakDb, computeRmsDb } from "../loudness";

/**
 * Windowed-RMS based dynamics analysis. Noise floor is estimated from the
 * quietest windows in the recording (a percentile, not a user-selected
 * "noise only" region) — this assumes the recording actually has quiet
 * moments (breaths, gaps between phrases), which real vocal takes do. A
 * take with no pauses at all (rare, but a sustained note/drone) will read
 * its own signal level as "noise floor" since there's no gap to measure
 * instead. Weaker than a real noise profile either way — said plainly in
 * vocalAnalysis.ts, not papered over.
 */

const WINDOW_SEC = 0.05;
const NOISE_FLOOR_PERCENTILE = 0.1; // bottom 10% of windows, by RMS
const LOUD_PERCENTILE = 0.95;
const CLIP_THRESHOLD = 0.999; // |sample| at/above this counts as clipped

export interface DynamicsAnalysis {
  peakDb: number;
  rmsDb: number;
  noiseFloorDb: number;
  dynamicRangeDb: number;
  clippedSampleRatio: number; // 0..1
}

export function analyzeDynamics(channelData: Float32Array, sampleRate: number): DynamicsAnalysis {
  const windowSize = Math.max(1, Math.floor(WINDOW_SEC * sampleRate));
  const windowRmsDb: number[] = [];

  for (let start = 0; start < channelData.length; start += windowSize) {
    const window = channelData.subarray(start, Math.min(channelData.length, start + windowSize));
    if (window.length === 0) continue;
    windowRmsDb.push(computeRmsDb(window));
  }

  windowRmsDb.sort((a, b) => a - b);
  const noiseFloorDb = percentile(windowRmsDb, NOISE_FLOOR_PERCENTILE);
  const loudDb = percentile(windowRmsDb, LOUD_PERCENTILE);

  let clippedCount = 0;
  for (let i = 0; i < channelData.length; i++) {
    if (Math.abs(channelData[i]) >= CLIP_THRESHOLD) clippedCount++;
  }

  return {
    peakDb: computePeakDb(channelData),
    rmsDb: computeRmsDb(channelData),
    noiseFloorDb,
    dynamicRangeDb: Number.isFinite(loudDb) && Number.isFinite(noiseFloorDb) ? loudDb - noiseFloorDb : 0,
    clippedSampleRatio: channelData.length > 0 ? clippedCount / channelData.length : 0,
  };
}

function percentile(sortedValues: number[], p: number): number {
  const finite = sortedValues.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return -Infinity;
  const index = Math.min(finite.length - 1, Math.max(0, Math.floor(p * finite.length)));
  return finite[index];
}
