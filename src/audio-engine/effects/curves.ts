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

/**
 * Soft-knee compressor transfer curve: output dB for a given input dB,
 * given threshold/ratio/knee - the standard piecewise formula (see e.g. the
 * Web Audio spec's own description of DynamicsCompressorNode's curve).
 * Below the knee it's a straight 1:1 pass-through; inside the knee it's a
 * quadratic blend into the compressed slope; above it, straight
 * `threshold + (x - threshold) / ratio`. This is the idealized static
 * shape from the parameters alone - CompressorEffect.getReductionDb()
 * gives the real, attack/release-shaped reduction the native node is
 * actually applying at any instant, which will differ from this curve
 * during a transient (that's what attack/release time are for).
 */
export function compressorTransferDb(inputDb: number, thresholdDb: number, ratio: number, kneeDb: number): number {
  const halfKnee = kneeDb / 2;
  if (inputDb < thresholdDb - halfKnee) return inputDb;
  if (inputDb > thresholdDb + halfKnee) return thresholdDb + (inputDb - thresholdDb) / ratio;
  if (kneeDb <= 0) return thresholdDb + (inputDb - thresholdDb) / ratio;
  const t = inputDb - thresholdDb + halfKnee;
  return inputDb + ((1 / ratio - 1) * t * t) / (2 * kneeDb);
}
