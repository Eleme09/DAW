/**
 * Algorithmically generated reverb impulse responses (decay-shaped noise) —
 * no external IR files, no convolution with a real recorded space. This is
 * a deliberate simplification: a real algorithmic reverb (diffusion
 * network, modulation) or recorded IRs would sound better, but this is
 * honest, dependency-free, and good enough as a first pass. See
 * AUDIO_ENGINE.md.
 */
import type { ReverbParams } from "@/types/effects";

export const DECAY_EXPONENT: Record<ReverbParams["sizeType"], number> = {
  room: 3,
  hall: 1.5,
  plate: 2,
};

/**
 * The exact envelope `generateImpulseResponseSamples` multiplies its noise
 * by, in dB - not a redrawn approximation of the tail, the literal formula
 * (`(1-t)^exponent`) that produces the impulse response actually loaded
 * into the convolver. `t` is fraction of decaySec elapsed (0..1).
 */
export function reverbDecayEnvelopeDb(t: number, sizeType: ReverbParams["sizeType"]): number {
  const clamped = Math.min(1, Math.max(0, t));
  const linear = Math.pow(1 - clamped, DECAY_EXPONENT[sizeType]);
  return linear <= 0 ? -Infinity : 20 * Math.log10(linear);
}

export function generateImpulseResponseSamples(
  sampleRate: number,
  decaySec: number,
  sizeType: ReverbParams["sizeType"]
): Float32Array<ArrayBuffer> {
  const length = Math.max(1, Math.floor(sampleRate * decaySec));
  const samples = new Float32Array(length);
  const exponent = DECAY_EXPONENT[sizeType];

  let prev = 0;
  for (let i = 0; i < length; i++) {
    const t = i / length;
    const envelope = Math.pow(1 - t, exponent);
    const noise = Math.random() * 2 - 1;
    let value = noise * envelope;

    if (sizeType === "plate") {
      // High-frequency emphasis via simple differencing — brighter, denser tail.
      const bright = (noise - prev) * envelope;
      value = value * 0.7 + bright * 0.3;
    }
    prev = noise;
    samples[i] = Math.max(-1, Math.min(1, value));
  }

  return samples;
}
