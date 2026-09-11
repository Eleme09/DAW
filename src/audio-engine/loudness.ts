/**
 * Pure math for the loudness readout. The K-weighting filters that feed
 * this are a perceptual approximation (BiquadFilterNode highshelf +
 * highpass, not the exact ITU-R BS.1770 bilinear-transformed coefficients),
 * and this is a momentary/smoothed reading, not the standard's full gated
 * integration. Label it "approx." wherever it's shown — see AUDIO_ENGINE.md.
 */
import { highShelfFilter, highpassFilter } from "./beat/filters";

const LUFS_OFFSET = -0.691; // per ITU-R BS.1770's loudness formula: L = -0.691 + 10*log10(meanSquare)

export function meanSquareToLufsApprox(meanSquare: number): number {
  if (meanSquare <= 0) return -Infinity;
  return LUFS_OFFSET + 10 * Math.log10(meanSquare);
}

export function computeMeanSquare(samples: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return samples.length > 0 ? sum / samples.length : 0;
}

export function computePeakDb(samples: ArrayLike<number>): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }
  return peak <= 0 ? -Infinity : 20 * Math.log10(peak);
}

export function computeRmsDb(samples: ArrayLike<number>): number {
  const ms = computeMeanSquare(samples);
  return ms <= 0 ? -Infinity : 10 * Math.log10(ms);
}

/**
 * Offline equivalent of the live K-weighting tap in AudioEngine.ts
 * (highshelf ~1.5kHz +4dB, then highpass ~60Hz) — the same two-filter
 * chain, run over a full buffer instead of a live analyser tap, so an
 * offline "LUFS (approx.)" read (e.g. the Mastering Assistant analyzing
 * a bounced mix) stays consistent with what the live Analyzer shows for
 * comparable material. Still an approximation, not exact ITU-R BS.1770
 * K-weighting or gated integration — same caveat as
 * `meanSquareToLufsApprox` above.
 */
export function approxLufsFromMix(monoData: Float32Array, sampleRate: number): number {
  const shelved = highShelfFilter(monoData, sampleRate, 1500, 4);
  const filtered = highpassFilter(shelved, sampleRate, 60);
  return meanSquareToLufsApprox(computeMeanSquare(filtered));
}
