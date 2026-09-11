/**
 * Iterative radix-2 Cooley-Tukey FFT. Pure math, no AudioContext — usable
 * offline on any Float32Array, unit-testable in Node. Input length must be
 * a power of 2 (callers pad/trim frames to match — see spectralAnalysis.ts).
 */

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** In-place FFT. `re`/`im` are overwritten with the transform. */
export function fftInPlace(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  if (n !== im.length) throw new Error("fftInPlace: re/im length mismatch");
  if (n & (n - 1)) throw new Error("fftInPlace: length must be a power of 2");

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < half; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + half] * curRe - im[i + k + half] * curIm;
        const vIm = re[i + k + half] * curIm + im[i + k + half] * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + half] = uRe - vRe;
        im[i + k + half] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        const nextIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
        curIm = nextIm;
      }
    }
  }
}

/** Magnitude spectrum (bins 0..N/2-1) of a real-valued frame, normalized by frame length. */
export function magnitudeSpectrum(frame: Float32Array): Float32Array<ArrayBuffer> {
  const n = frame.length;
  const re = Float32Array.from(frame);
  const im = new Float32Array(n);
  fftInPlace(re, im);
  const mag = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / n;
  }
  return mag;
}

export function hannWindow(size: number): Float32Array<ArrayBuffer> {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return w;
}
