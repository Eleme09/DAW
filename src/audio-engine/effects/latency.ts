/**
 * DynamicsCompressorNode delays its output by a fixed look-ahead: measured
 * in Chromium as floor(0.006 * sampleRate) whole samples (264 at 44.1 kHz,
 * 288 at 48 kHz). Safari not measured. Matching it with a whole-sample
 * DelayNode time avoids the linear interpolation a fractional delay would
 * add (a high-frequency loss on the delayed path).
 */
export function compressorLatencySec(sampleRate: number): number {
  return Math.floor(0.006 * sampleRate) / sampleRate;
}

/** Butterworth (Q 1/sqrt2) for Web Audio lowpass/highpass, whose Q is in dB. */
export const BUTTERWORTH_Q_DB = 20 * Math.log10(Math.SQRT1_2);
