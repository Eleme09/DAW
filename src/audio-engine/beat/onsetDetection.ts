import { hannWindow, magnitudeSpectrum } from "../analysis/fft";
import type { OnsetEvent } from "@/types/beat";

/**
 * Spectral-flux onset detection (Dixon 2006-style): half-wave-rectified
 * frame-to-frame magnitude spectrum difference, peak-picked against a
 * local adaptive threshold. Standard, well-documented MIR technique — not
 * ML, not invented for this project. Feeds tempo estimation, section
 * boundaries, and drum-hit classification, all in this same directory.
 */

const FRAME_SIZE = 1024;
const HOP_SIZE = 512;

export interface OnsetEnvelope {
  hopSec: number;
  flux: Float32Array;
}

export function computeOnsetEnvelope(
  channelData: Float32Array,
  sampleRate: number,
  frameSize = FRAME_SIZE,
  hopSize = HOP_SIZE
): OnsetEnvelope {
  const window = hannWindow(frameSize);
  let prevMag: Float32Array | null = null;
  const fluxValues: number[] = [];

  for (let start = 0; start + frameSize <= channelData.length; start += hopSize) {
    const frame = new Float32Array(frameSize);
    for (let i = 0; i < frameSize; i++) frame[i] = channelData[start + i] * window[i];
    const mag = magnitudeSpectrum(frame);

    let flux = 0;
    if (prevMag) {
      for (let b = 0; b < mag.length; b++) {
        const diff = mag[b] - prevMag[b];
        if (diff > 0) flux += diff;
      }
    }
    fluxValues.push(flux);
    prevMag = mag;
  }

  return { hopSec: hopSize / sampleRate, flux: Float32Array.from(fluxValues) };
}

const LOCAL_WINDOW_SEC = 0.1;
const REFRACTORY_SEC = 0.05;

/** Peak-picks the flux envelope into discrete onset events using a local adaptive threshold. */
export function detectOnsets(envelope: OnsetEnvelope, sensitivity = 1.5): OnsetEvent[] {
  const { flux, hopSec } = envelope;
  if (flux.length === 0) return [];

  const windowRadius = Math.max(1, Math.round(LOCAL_WINDOW_SEC / hopSec));
  const onsets: OnsetEvent[] = [];

  for (let i = 0; i < flux.length; i++) {
    const start = Math.max(0, i - windowRadius);
    const end = Math.min(flux.length, i + windowRadius + 1);
    let mean = 0;
    for (let j = start; j < end; j++) mean += flux[j];
    mean /= end - start;
    let variance = 0;
    for (let j = start; j < end; j++) variance += (flux[j] - mean) ** 2;
    const std = Math.sqrt(variance / (end - start));
    const threshold = mean + sensitivity * std;

    const isLocalPeak =
      flux[i] > threshold &&
      flux[i] > 1e-6 &&
      (i === 0 || flux[i] >= flux[i - 1]) &&
      (i === flux.length - 1 || flux[i] >= flux[i + 1]);

    if (isLocalPeak) {
      const lastOnset = onsets[onsets.length - 1];
      const timeSec = i * hopSec;
      if (!lastOnset || timeSec - lastOnset.timeSec > REFRACTORY_SEC) {
        onsets.push({ timeSec, strength: flux[i] });
      }
    }
  }

  return onsets;
}
