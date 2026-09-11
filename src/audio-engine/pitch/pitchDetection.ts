import type { PitchFrame } from "@/types/pitch";

/**
 * YIN pitch detection (de Cheveigné & Kawahara, 2002): difference function
 * -> cumulative mean normalized difference -> absolute threshold with
 * parabolic interpolation for sub-sample precision. Chosen over naive
 * autocorrelation because it's specifically designed to avoid octave
 * errors, which matter a lot once this feeds pitch *correction* (an
 * octave-wrong snap target would be obviously broken, not just imprecise).
 */

const DEFAULT_THRESHOLD = 0.15;

export interface YinResult {
  frequencyHz: number | null;
  confidence: number;
}

export function detectPitchYin(
  frame: Float32Array,
  sampleRate: number,
  minHz = 70,
  maxHz = 1000,
  threshold = DEFAULT_THRESHOLD
): YinResult {
  const maxTau = Math.min(frame.length - 1, Math.floor(sampleRate / minHz));
  const minTau = Math.max(2, Math.floor(sampleRate / maxHz));
  if (maxTau <= minTau) return { frequencyHz: null, confidence: 0 };

  const windowLength = frame.length - maxTau;
  if (windowLength <= 0) return { frequencyHz: null, confidence: 0 };

  // 1. Difference function.
  const diff = new Float32Array(maxTau + 1);
  for (let tau = 0; tau <= maxTau; tau++) {
    let sum = 0;
    for (let j = 0; j < windowLength; j++) {
      const delta = frame[j] - frame[j + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }

  // 2. Cumulative mean normalized difference function (CMND).
  const cmnd = new Float32Array(maxTau + 1);
  cmnd[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    runningSum += diff[tau];
    cmnd[tau] = runningSum > 0 ? (diff[tau] * tau) / runningSum : 1;
  }

  // 3. Absolute threshold: first dip below `threshold`, refined to its local minimum.
  let tauEstimate = -1;
  for (let tau = minTau; tau <= maxTau; tau++) {
    if (cmnd[tau] < threshold) {
      while (tau + 1 <= maxTau && cmnd[tau + 1] < cmnd[tau]) tau++;
      tauEstimate = tau;
      break;
    }
  }

  if (tauEstimate === -1) {
    // Nothing confidently periodic — report the best candidate anyway, but
    // let the caller see the low confidence and decide to treat it as unvoiced.
    tauEstimate = minTau;
    for (let tau = minTau + 1; tau <= maxTau; tau++) {
      if (cmnd[tau] < cmnd[tauEstimate]) tauEstimate = tau;
    }
    const confidence = Math.max(0, 1 - cmnd[tauEstimate]);
    if (confidence < 0.5) return { frequencyHz: null, confidence };
  }

  // 4. Parabolic interpolation around the estimate for sub-sample precision.
  const x0 = tauEstimate > minTau ? tauEstimate - 1 : tauEstimate;
  const x2 = tauEstimate < maxTau ? tauEstimate + 1 : tauEstimate;
  let betterTau = tauEstimate;
  if (x0 !== tauEstimate && x2 !== tauEstimate) {
    const s0 = cmnd[x0];
    const s1 = cmnd[tauEstimate];
    const s2 = cmnd[x2];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) betterTau = tauEstimate + (s2 - s0) / denom;
  }

  const confidence = Math.max(0, Math.min(1, 1 - cmnd[tauEstimate]));
  return { frequencyHz: sampleRate / betterTau, confidence };
}

const FRAME_SIZE = 2048;
const HOP_SIZE = 512;

/** Frame-hopped pitch tracking across a full channel. */
export function trackPitch(
  channelData: Float32Array,
  sampleRate: number,
  frameSize = FRAME_SIZE,
  hopSize = HOP_SIZE,
  minHz = 70,
  maxHz = 1000
): PitchFrame[] {
  const frames: PitchFrame[] = [];
  for (let start = 0; start + frameSize <= channelData.length; start += hopSize) {
    const frame = channelData.subarray(start, start + frameSize);
    const { frequencyHz, confidence } = detectPitchYin(frame, sampleRate, minHz, maxHz);
    frames.push({ timeSec: start / sampleRate, frequencyHz, confidence });
  }
  return frames;
}
