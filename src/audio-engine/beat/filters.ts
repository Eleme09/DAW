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

  return runBiquad(data, {
    b0: (1 - cosOmega) / 2,
    b1: 1 - cosOmega,
    b2: (1 - cosOmega) / 2,
    a0: 1 + alpha,
    a1: -2 * cosOmega,
    a2: 1 - alpha,
  });
}

function runBiquad(data: Float32Array, coeffs: { b0: number; b1: number; b2: number; a0: number; a1: number; a2: number }): Float32Array {
  const { b0, b1, b2, a0, a1, a2 } = coeffs;
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

export function highpassFilter(data: Float32Array, sampleRate: number, cutoffHz: number, q = 0.707): Float32Array {
  const omega = (2 * Math.PI * cutoffHz) / sampleRate;
  const alpha = Math.sin(omega) / (2 * q);
  const cosOmega = Math.cos(omega);

  return runBiquad(data, {
    b0: (1 + cosOmega) / 2,
    b1: -(1 + cosOmega),
    b2: (1 + cosOmega) / 2,
    a0: 1 + alpha,
    a1: -2 * cosOmega,
    a2: 1 - alpha,
  });
}

/**
 * RBJ cookbook high-shelf, shelf slope S=1 (a reasonable fixed default —
 * not tuned to match Web Audio BiquadFilterNode's Q-to-S mapping
 * bit-exactly, since this is only ever used for an already-approximate
 * loudness estimate, not anywhere precision matters).
 */
export function highShelfFilter(
  data: Float32Array,
  sampleRate: number,
  cutoffHz: number,
  gainDb: number
): Float32Array {
  const A = Math.pow(10, gainDb / 40);
  const omega = (2 * Math.PI * cutoffHz) / sampleRate;
  const cosOmega = Math.cos(omega);
  const sinOmega = Math.sin(omega);
  const alpha = (sinOmega / 2) * Math.sqrt(2); // shelf slope S=1
  const sqrtA = Math.sqrt(A);

  return runBiquad(data, {
    b0: A * (A + 1 + (A - 1) * cosOmega + 2 * sqrtA * alpha),
    b1: -2 * A * (A - 1 + (A + 1) * cosOmega),
    b2: A * (A + 1 + (A - 1) * cosOmega - 2 * sqrtA * alpha),
    a0: A + 1 - (A - 1) * cosOmega + 2 * sqrtA * alpha,
    a1: 2 * (A - 1 - (A + 1) * cosOmega),
    a2: A + 1 - (A - 1) * cosOmega - 2 * sqrtA * alpha,
  });
}
