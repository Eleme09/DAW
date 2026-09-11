/**
 * Offline-only biquad filtering (RBJ Audio EQ Cookbook coefficients).
 * Deliberately not a Web Audio BiquadFilterNode/OfflineAudioContext — this
 * whole directory runs without an AudioContext (pure math, Node-testable),
 * matching src/audio-engine/analysis/ and src/audio-engine/pitch/.
 */
export function lowpassFilter(data: Float32Array, sampleRate: number, cutoffHz: number, q = 0.707): Float32Array {
  const omega = (2 * Math.PI * cutoffHz) / sampleRate;
  const alpha = Math.sin(omega) / (2 * q);
  const cosOmega = Math.cos(omega);

  const b0 = (1 - cosOmega) / 2;
  const b1 = 1 - cosOmega;
  const b2 = (1 - cosOmega) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosOmega;
  const a2 = 1 - alpha;

  const output = new Float32Array(data.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  for (let i = 0; i < data.length; i++) {
    const x0 = data[i];
    const y0 = (b0 / a0) * x0 + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    output[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return output;
}
