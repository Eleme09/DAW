import { hannWindow, magnitudeSpectrum, nextPowerOfTwo } from "../analysis/fft";
import type { DrumHitType, OnsetEvent } from "@/types/beat";

/**
 * Onset -> kick/snare/hihat-ish classification from spectral shape alone
 * (low-band energy ratio, spectral centroid, high-band energy ratio). This
 * is an explainable heuristic, not a trained drum-transcription model —
 * real drum transcription (especially separating layered/sampled kits) is
 * a genuinely hard MIR problem that needs ML to do well. Good enough to
 * sketch a rough pattern for visualization, not good enough to trust as a
 * transcription. Say so wherever this result is shown, not just here.
 */

const KICK_LOW_HZ = 150;
const SNARE_BAND_HZ = 4000;
const HIHAT_LOW_CUT_HZ = 4000;
const ANALYSIS_WINDOW_SEC = 0.05;

interface SpectralFeatures {
  lowRatio: number;
  highRatio: number;
  centroidHz: number;
}

function computeSpectralFeatures(window: Float32Array, sampleRate: number): SpectralFeatures {
  const hann = hannWindow(window.length);
  // FFT needs a power-of-2 length; zero-pad rather than trim so no signal is discarded.
  const fftSize = nextPowerOfTwo(window.length);
  const windowed = new Float32Array(fftSize);
  for (let i = 0; i < window.length; i++) windowed[i] = window[i] * hann[i];

  const mag = magnitudeSpectrum(windowed);
  const binHz = sampleRate / fftSize;

  let lowEnergy = 0;
  let highEnergy = 0;
  let totalEnergy = 0;
  let weightedFreqSum = 0;

  for (let b = 1; b < mag.length; b++) {
    const freq = b * binHz;
    const power = mag[b] * mag[b];
    totalEnergy += power;
    weightedFreqSum += freq * power;
    if (freq < KICK_LOW_HZ) lowEnergy += power;
    if (freq >= HIHAT_LOW_CUT_HZ) highEnergy += power;
  }

  return {
    lowRatio: totalEnergy > 0 ? lowEnergy / totalEnergy : 0,
    highRatio: totalEnergy > 0 ? highEnergy / totalEnergy : 0,
    centroidHz: totalEnergy > 0 ? weightedFreqSum / totalEnergy : 0,
  };
}

export function classifyOnsetWindow(
  window: Float32Array,
  sampleRate: number
): { type: DrumHitType; confidence: number } {
  const { lowRatio, highRatio, centroidHz } = computeSpectralFeatures(window, sampleRate);

  if (lowRatio > 0.5 && centroidHz < KICK_LOW_HZ * 2) {
    return { type: "kick", confidence: lowRatio };
  }
  if (highRatio > 0.35 && centroidHz > SNARE_BAND_HZ) {
    return { type: "hihat", confidence: highRatio };
  }
  if (centroidHz >= KICK_LOW_HZ && centroidHz <= SNARE_BAND_HZ) {
    return { type: "snare", confidence: 1 - Math.abs(centroidHz - 1500) / SNARE_BAND_HZ };
  }
  return { type: "other", confidence: 0.3 };
}

export function classifyDrumHits(
  channelData: Float32Array,
  sampleRate: number,
  onsets: OnsetEvent[]
): { timeSec: number; type: DrumHitType; confidence: number }[] {
  const windowSamples = Math.round(ANALYSIS_WINDOW_SEC * sampleRate);
  return onsets.map((onset) => {
    const start = Math.round(onset.timeSec * sampleRate);
    const window = channelData.subarray(start, Math.min(channelData.length, start + windowSamples));
    if (window.length < 16) return { timeSec: onset.timeSec, type: "other" as DrumHitType, confidence: 0 };
    const { type, confidence } = classifyOnsetWindow(window, sampleRate);
    return { timeSec: onset.timeSec, type, confidence };
  });
}
