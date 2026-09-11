import { describe, expect, it } from "vitest";
import { fftInPlace, hannWindow, magnitudeSpectrum, nextPowerOfTwo } from "./fft";

describe("nextPowerOfTwo", () => {
  it("returns the same value for exact powers of two", () => {
    expect(nextPowerOfTwo(1024)).toBe(1024);
  });
  it("rounds up otherwise", () => {
    expect(nextPowerOfTwo(1000)).toBe(1024);
    expect(nextPowerOfTwo(1)).toBe(1);
  });
});

describe("fftInPlace", () => {
  it("rejects non-power-of-two lengths", () => {
    expect(() => fftInPlace(new Float32Array(10), new Float32Array(10))).toThrow();
  });

  it("DC input (constant signal) produces energy only in bin 0", () => {
    const n = 64;
    const re = new Float32Array(n).fill(1);
    const im = new Float32Array(n);
    fftInPlace(re, im);
    expect(Math.abs(re[0])).toBeCloseTo(n, 3);
    for (let i = 1; i < n; i++) {
      expect(Math.abs(re[i])).toBeLessThan(1e-3);
      expect(Math.abs(im[i])).toBeLessThan(1e-3);
    }
  });
});

describe("magnitudeSpectrum", () => {
  it("places a pure sine's energy at its bin", () => {
    const n = 256;
    const bin = 10;
    const frame = new Float32Array(n);
    for (let i = 0; i < n; i++) frame[i] = Math.sin((2 * Math.PI * bin * i) / n);

    const mag = magnitudeSpectrum(frame);
    let peakBin = 0;
    for (let i = 1; i < mag.length; i++) if (mag[i] > mag[peakBin]) peakBin = i;

    expect(peakBin).toBe(bin);
  });

  it("a higher-frequency sine has energy at a higher bin than a lower-frequency one", () => {
    const n = 256;
    const lowFrame = new Float32Array(n);
    const highFrame = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      lowFrame[i] = Math.sin((2 * Math.PI * 4 * i) / n);
      highFrame[i] = Math.sin((2 * Math.PI * 40 * i) / n);
    }
    const lowMag = magnitudeSpectrum(lowFrame);
    const highMag = magnitudeSpectrum(highFrame);
    const argmax = (m: Float32Array) => m.reduce((best, v, i) => (v > m[best] ? i : best), 0);
    expect(argmax(highMag)).toBeGreaterThan(argmax(lowMag));
  });
});

describe("hannWindow", () => {
  it("starts and ends near zero, peaks near the middle", () => {
    const w = hannWindow(256);
    expect(w[0]).toBeCloseTo(0, 5);
    expect(w[w.length - 1]).toBeCloseTo(0, 5);
    expect(w[Math.floor(w.length / 2)]).toBeGreaterThan(0.9);
  });
});
