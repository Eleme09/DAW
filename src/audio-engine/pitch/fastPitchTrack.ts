import { detectPitchYin } from "./pitchDetection";
import type { PitchFrame } from "@/types/pitch";

/**
 * Coarse-to-fine version of `trackPitch` for long takes. Plain YIN costs
 * frameSize x maxTau multiply-adds per frame (~900k at 44.1 kHz), which took
 * 3.4 s for 30 s of audio and froze the phone while Armonizar ran. Here:
 *
 *  1. The whole take is averaged down 4x once, and normal YIN runs on that
 *     (16x fewer operations) - this decides voiced/unvoiced, the octave and
 *     the confidence exactly as `detectPitchYin` does.
 *  2. The pitch is then refined at the full sample rate around the coarse
 *     period (+-6 samples, parabolic interpolation on the difference
 *     function), so the result keeps full-rate precision instead of the
 *     ~3 cents the decimated rate alone would give.
 *
 * Same frames, hop and `PitchFrame` shape as `trackPitch`, so it is a
 * drop-in for the harmonizer's key detection and resynthesis.
 */

const FRAME_SIZE = 2048;
const HOP_SIZE = 512;
const DECIMATION = 4;
const REFINE_RADIUS = 6;

export interface FastTrackHooks {
  /** 0..1, called a few dozen times over the whole take. */
  onProgress?: (fraction: number) => void;
  /** Checked every few hundred frames; true stops early (returns what was done). */
  shouldCancel?: () => boolean;
}

export function trackPitchFast(
  channelData: Float32Array,
  sampleRate: number,
  hooks: FastTrackHooks = {},
  minHz = 70,
  maxHz = 1000
): PitchFrame[] {
  const frames: PitchFrame[] = [];
  const decLength = Math.floor(channelData.length / DECIMATION);
  const dec = new Float32Array(decLength);
  for (let i = 0; i < decLength; i++) {
    const b = i * DECIMATION;
    dec[i] = (channelData[b] + channelData[b + 1] + channelData[b + 2] + channelData[b + 3]) / DECIMATION;
  }
  const decFrame = FRAME_SIZE / DECIMATION;
  const decRate = sampleRate / DECIMATION;
  const maxTau = Math.min(FRAME_SIZE - 1, Math.floor(sampleRate / minHz));
  const window = FRAME_SIZE - maxTau;
  const total = Math.max(1, Math.floor((channelData.length - FRAME_SIZE) / HOP_SIZE) + 1);
  const diff = new Float64Array(2 * REFINE_RADIUS + 1);

  let n = 0;
  for (let start = 0; start + FRAME_SIZE <= channelData.length; start += HOP_SIZE, n++) {
    if (n % 256 === 0) {
      if (hooks.shouldCancel?.()) return frames;
      hooks.onProgress?.(n / total);
    }
    const timeSec = start / sampleRate;
    const coarse = detectPitchYin(dec.subarray(start / DECIMATION, start / DECIMATION + decFrame), decRate, minHz, maxHz);
    if (coarse.frequencyHz === null) {
      frames.push({ timeSec, frequencyHz: null, confidence: coarse.confidence });
      continue;
    }

    // Refine around the coarse period on the full-rate frame.
    const tau0 = Math.round(sampleRate / coarse.frequencyHz);
    const lo = Math.max(2, tau0 - REFINE_RADIUS);
    const hi = Math.min(maxTau - 1, tau0 + REFINE_RADIUS);
    let best = -1;
    for (let tau = lo; tau <= hi; tau++) {
      let sum = 0;
      for (let j = 0; j < window; j++) {
        const delta = channelData[start + j] - channelData[start + j + tau];
        sum += delta * delta;
      }
      diff[tau - lo] = sum;
      if (best === -1 || sum < diff[best - lo]) best = tau;
    }
    let tau = best === -1 ? sampleRate / coarse.frequencyHz : best;
    if (best > lo && best < hi) {
      const s0 = diff[best - 1 - lo];
      const s1 = diff[best - lo];
      const s2 = diff[best + 1 - lo];
      const denom = 2 * (2 * s1 - s2 - s0);
      if (denom !== 0) tau = best + (s2 - s0) / denom;
    } else {
      tau = sampleRate / coarse.frequencyHz; // minimum on the edge: keep the coarse estimate
    }
    frames.push({ timeSec, frequencyHz: sampleRate / tau, confidence: coarse.confidence });
  }
  hooks.onProgress?.(1);
  return frames;
}
