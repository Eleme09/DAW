/** Waveshaping curve generators for SaturationEffect/ClipperEffect. Pure math, unit-testable. */
import type { SaturationParams } from "@/types/effects";

const CURVE_SAMPLES = 2048;

export function makeSaturationCurve(tone: SaturationParams["tone"]): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(CURVE_SAMPLES);
  for (let i = 0; i < CURVE_SAMPLES; i++) {
    const x = (i / (CURVE_SAMPLES - 1)) * 2 - 1; // -1..1
    curve[i] = shapeSample(x, tone);
  }
  return curve;
}

function shapeSample(x: number, tone: SaturationParams["tone"]): number {
  switch (tone) {
    case "warm": {
      // Gentle symmetric soft-clip — mostly odd harmonics, rounds peaks smoothly.
      return Math.tanh(x * 1.6) / Math.tanh(1.6);
    }
    case "bright": {
      // Slight asymmetry adds even harmonics, reads as more aggressive/present.
      const shaped = Math.tanh(x * 2.2);
      const asym = shaped + 0.12 * shaped * shaped * Math.sign(x);
      return clamp(asym / 1.12, -1, 1);
    }
    case "neutral":
    default:
      return Math.tanh(x * 1.2) / Math.tanh(1.2);
  }
}

export function makeHardClipCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(CURVE_SAMPLES);
  for (let i = 0; i < CURVE_SAMPLES; i++) {
    const x = (i / (CURVE_SAMPLES - 1)) * 2 - 1;
    curve[i] = clamp(x, -1, 1);
  }
  return curve;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
