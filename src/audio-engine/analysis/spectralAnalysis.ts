import { hannWindow, magnitudeSpectrum } from "./fft";

/**
 * Frame-averaged spectral analysis. Reports each band's energy *relative
 * to the recording's own overall average* rather than an absolute dB
 * threshold — that's what lets "Mud: High" mean something regardless of
 * how loud or quiet the source recording is. Band edges and severity
 * thresholds (see vocalAnalysis.ts) are heuristic, calibrated by ear, not
 * trained on a labeled dataset — documented as such, not oversold.
 */

export interface Band {
  name: string;
  minHz: number;
  maxHz: number;
}

export const VOCAL_BANDS: Band[] = [
  { name: "subBass", minHz: 20, maxHz: 60 },
  { name: "bass", minHz: 60, maxHz: 250 },
  { name: "lowMid", minHz: 250, maxHz: 500 },
  { name: "mid", minHz: 500, maxHz: 2000 },
  { name: "highMid", minHz: 2000, maxHz: 4000 },
  { name: "presence", minHz: 4000, maxHz: 6000 },
  { name: "sibilance", minHz: 5000, maxHz: 9000 },
  { name: "air", minHz: 9000, maxHz: 16000 },
];

const FRAME_SIZE = 2048;

/** Average power spectrum (bins 0..frameSize/2-1) across Hann-windowed, 50%-overlap frames. */
export function computeAveragePowerSpectrum(
  channelData: Float32Array,
  frameSize = FRAME_SIZE
): Float32Array {
  const window = hannWindow(frameSize);
  const hop = Math.floor(frameSize / 2);
  const numBins = frameSize / 2;
  const accum = new Float32Array(numBins);
  let frameCount = 0;

  for (let start = 0; start + frameSize <= channelData.length; start += hop) {
    const frame = new Float32Array(frameSize);
    for (let i = 0; i < frameSize; i++) frame[i] = channelData[start + i] * window[i];
    const mag = magnitudeSpectrum(frame);
    for (let b = 0; b < numBins; b++) accum[b] += mag[b] * mag[b];
    frameCount++;
  }

  if (frameCount === 0) {
    // Shorter than one frame — analyze what we have, zero-padded, once.
    const frame = new Float32Array(frameSize);
    frame.set(channelData.subarray(0, Math.min(frameSize, channelData.length)));
    for (let i = 0; i < frameSize; i++) frame[i] *= window[i];
    const mag = magnitudeSpectrum(frame);
    for (let b = 0; b < numBins; b++) accum[b] = mag[b] * mag[b];
    frameCount = 1;
  }

  for (let b = 0; b < numBins; b++) accum[b] /= frameCount;
  return accum;
}

export interface BandEnergy {
  name: string;
  /** dB, relative to this recording's own overall average bin power. */
  relativeDb: number;
}

export function computeBandEnergies(
  powerSpectrum: Float32Array,
  sampleRate: number,
  frameSize = FRAME_SIZE,
  bands: Band[] = VOCAL_BANDS
): BandEnergy[] {
  const binHz = sampleRate / frameSize;
  const overallAvgPower = average(powerSpectrum);

  return bands.map((band) => {
    const startBin = Math.max(0, Math.floor(band.minHz / binHz));
    const endBin = Math.min(powerSpectrum.length, Math.ceil(band.maxHz / binHz));
    const bandPower = average(powerSpectrum.slice(startBin, Math.max(startBin + 1, endBin)));
    const ratio = bandPower / overallAvgPower || 1e-12;
    return { name: band.name, relativeDb: 10 * Math.log10(ratio) };
  });
}

function average(values: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return values.length > 0 ? sum / values.length : 0;
}
