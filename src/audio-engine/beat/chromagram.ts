import { hannWindow, magnitudeSpectrum } from "../analysis/fft";
import { frequencyToMidi } from "../pitch/noteUtils";

/**
 * Full-spectrum chroma extraction for polyphonic material (a beat/mix),
 * as opposed to pitch/keyDetection.ts's chroma-from-a-monophonic-pitch-
 * track (built for a single vocal line in Phase 5). Every FFT bin's energy
 * gets folded into one of 12 pitch classes regardless of octave or how
 * many notes are sounding at once — the standard MIR "chromagram"
 * technique, which is what lets key detection work on a full beat instead
 * of just a solo melody. Feeds keyDetection.ts's detectKeyFromChroma
 * (Phase 5) directly — same correlation-against-key-profiles logic, reused
 * rather than reimplemented, per AI_FEATURES.md's own note about this.
 */

const FRAME_SIZE = 4096; // wide enough for meaningful low-end/bass resolution
const MIN_HZ = 60; // below this, bin-to-pitch-class mapping gets unstable/meaningless

export interface ChromaFrame {
  timeSec: number;
  chroma: number[]; // length 12, index 0 = C
}

export function computeChromaFrame(frame: Float32Array, sampleRate: number): number[] {
  const mag = magnitudeSpectrum(frame);
  const chroma = new Array(12).fill(0);
  const binHz = sampleRate / frame.length;

  for (let b = 1; b < mag.length; b++) {
    const freq = b * binHz;
    if (freq < MIN_HZ) continue;
    const pc = (((Math.round(frequencyToMidi(freq)) % 12) + 12) % 12);
    chroma[pc] += mag[b] * mag[b];
  }
  return chroma;
}

export function computeChromagram(
  channelData: Float32Array,
  sampleRate: number,
  frameSize = FRAME_SIZE,
  hopSize = Math.floor(frameSize / 2)
): ChromaFrame[] {
  const window = hannWindow(frameSize);
  const frames: ChromaFrame[] = [];

  for (let start = 0; start + frameSize <= channelData.length; start += hopSize) {
    const windowed = new Float32Array(frameSize);
    for (let i = 0; i < frameSize; i++) windowed[i] = channelData[start + i] * window[i];
    frames.push({ timeSec: start / sampleRate, chroma: computeChromaFrame(windowed, sampleRate) });
  }
  return frames;
}

export function sumChroma(frames: ChromaFrame[]): number[] {
  const sum = new Array(12).fill(0);
  for (const f of frames) {
    for (let i = 0; i < 12; i++) sum[i] += f.chroma[i];
  }
  return sum;
}
