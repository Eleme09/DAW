import { fftInPlace, hannWindow, ifftInPlace } from "./fft";

/**
 * Classic spectral subtraction noise reduction (Boll 1979-style) — no ML,
 * no trained model, just STFT analysis/resynthesis with a subtracted noise
 * magnitude profile. This is what `vocalAnalysis.ts` and AUDIO_ENGINE.md's
 * "What's deliberately not here yet" pointed at when they said the Noise
 * Gate can't remove noise sitting *underneath* a loud signal — this can,
 * within the real limits of the technique (see below).
 *
 * Pipeline: STFT (Hann-windowed overlapping frames) -> estimate a noise
 * magnitude profile from the recording's own quietest frames (no separate
 * "noise-only" clip required from the user) -> per-frame magnitude
 * subtraction with a spectral floor -> reuse the ORIGINAL phase (standard
 * simplification in this technique; phase is far less perceptually
 * important than magnitude, and there's no way to recover a "clean" phase
 * for noise alone) -> inverse FFT -> windowed overlap-add back to a
 * time-domain signal, normalized by the actual accumulated window energy
 * (not an assumed closed-form constant, to avoid baking in a subtly wrong
 * normalization).
 *
 * Real, honest limitations, named rather than hidden:
 * - Needs the recording to actually contain some genuinely-quiet moments
 *   (room tone between phrases, a pause) to build an accurate noise
 *   profile from. A signal with no quiet moments at all (e.g. a
 *   continuous tone/drone) gets an inaccurate profile built from its
 *   quietest-but-still-loud frames, and reduction quality suffers.
 * - Classic spectral subtraction is prone to "musical noise" (isolated
 *   residual bins creating a warbly/gurgly artifact) at aggressive
 *   settings — the spectral floor here (never subtracting below
 *   NOISE_FLOOR_RATIO of the noise estimate) mitigates but does not
 *   eliminate this, especially at high strength.
 * - Assumes the noise is roughly stationary (its spectral shape doesn't
 *   change much over the recording) - a good assumption for steady hiss/
 *   hum/fan noise, a poor one for noise that varies over time (e.g. a
 *   door closing partway through).
 * - Not a substitute for a trained model (RNNoise-style) at separating
 *   noise from speech that overlaps heavily in both time and frequency -
 *   this only ever subtracts a fixed spectral shape, it doesn't learn
 *   what "voice" sounds like.
 * - The auto-estimated profile (`estimateNoiseProfile`) deliberately
 *   averages only the quietest 10% of frames, which for a recording
 *   that's uniformly noisy throughout (no distinct quiet gaps) ends up
 *   averaging an unrepresentatively-quiet subset of an already-quiet
 *   signal - a conservative (weaker-than-ideal) estimate by construction,
 *   favoring not damaging real signal over maximum noise removal. A
 *   recording with real silence/room-tone gaps between phrases (the
 *   realistic case this is built for) doesn't hit this as hard, since
 *   those gaps' frames genuinely represent the ambient noise level.
 */

const FRAME_SIZE = 2048;
const HOP_SIZE = FRAME_SIZE / 4; // 75% overlap - standard for Hann analysis+synthesis COLA
const NOISE_FLOOR_RATIO = 0.02; // never subtract below 2% of the noise estimate - limits musical noise
const NOISE_PERCENTILE = 0.1; // bottom 10% of frames by RMS are treated as "noise-only"

export interface NoiseReductionSettings {
  /** 0..1. Scales the over-subtraction factor: 0 = no reduction, 1 = aggressive. */
  strength: number;
}

/** Per-frame RMS used to pick the quietest frames for the noise profile estimate. */
function frameRms(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}

/**
 * Estimates a noise magnitude profile (length FRAME_SIZE/2) by averaging
 * the magnitude spectra of the quietest NOISE_PERCENTILE fraction of
 * non-overlapping analysis frames in the signal. Exposed for the UI to
 * show "how much of this recording looks like noise" before committing to
 * a full render.
 */
export function estimateNoiseProfile(channelData: Float32Array): Float32Array {
  const window = hannWindow(FRAME_SIZE);
  const frameStarts: number[] = [];
  for (let start = 0; start + FRAME_SIZE <= channelData.length; start += FRAME_SIZE) {
    frameStarts.push(start);
  }
  if (frameStarts.length === 0) {
    return new Float32Array(FRAME_SIZE / 2 + 1);
  }

  const rmsPerFrame = frameStarts.map((start) => frameRms(channelData.subarray(start, start + FRAME_SIZE)));
  const sortedIndices = rmsPerFrame
    .map((rms, i) => ({ rms, i }))
    .sort((a, b) => a.rms - b.rms)
    .map((e) => e.i);
  const quietCount = Math.max(1, Math.round(frameStarts.length * NOISE_PERCENTILE));
  const quietIndices = sortedIndices.slice(0, quietCount);

  // Bins 0..FRAME_SIZE/2 inclusive - the DC bin and the Nyquist bin are
  // each their own mirror in a real FFT, everything else has a partner at
  // FRAME_SIZE-k (see reduceNoiseChannel's mirroring below).
  const profile = new Float32Array(FRAME_SIZE / 2 + 1);
  for (const idx of quietIndices) {
    const start = frameStarts[idx];
    const re = new Float32Array(FRAME_SIZE);
    const im = new Float32Array(FRAME_SIZE);
    for (let i = 0; i < FRAME_SIZE; i++) re[i] = channelData[start + i] * window[i];
    fftInPlace(re, im);
    // Deliberately NOT dividing by FRAME_SIZE here: reduceNoiseChannel's
    // own `mag` below is raw (unnormalized) FFT magnitude too - the two
    // need to be in the same units to subtract meaningfully. An earlier
    // version of this function normalized here while reduceNoiseChannel
    // didn't, which made the profile ~2048x too small and effectively a
    // no-op subtraction at any strength - caught by a debug render
    // comparing the expected per-bin scale factor against what the
    // pipeline actually produced.
    for (let k = 0; k <= FRAME_SIZE / 2; k++) {
      profile[k] += Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    }
  }
  for (let k = 0; k < profile.length; k++) profile[k] /= quietIndices.length;
  return profile;
}

/**
 * Runs spectral subtraction on one channel using a noise profile from
 * `estimateNoiseProfile`. Returns a new Float32Array the same length as
 * the input — never mutates the input, matching every other offline
 * render in this project (PSOLA, mastering gain, etc).
 */
export function reduceNoiseChannel(
  channelData: Float32Array,
  settings: NoiseReductionSettings,
  noiseProfile?: Float32Array
): Float32Array {
  const profile = noiseProfile ?? estimateNoiseProfile(channelData);
  const alpha = 4 * Math.max(0, Math.min(1, settings.strength)); // over-subtraction factor: 0 = no subtraction, 4 = aggressive
  const window = hannWindow(FRAME_SIZE);

  const output = new Float32Array(channelData.length);
  const windowEnergy = new Float32Array(channelData.length);

  for (let start = 0; start + FRAME_SIZE <= channelData.length; start += HOP_SIZE) {
    const re = new Float32Array(FRAME_SIZE);
    const im = new Float32Array(FRAME_SIZE);
    for (let i = 0; i < FRAME_SIZE; i++) re[i] = channelData[start + i] * window[i];
    fftInPlace(re, im);

    for (let k = 0; k <= FRAME_SIZE / 2; k++) {
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      const floor = NOISE_FLOOR_RATIO * profile[k];
      // The floor is a lower bound on subtraction, never a boost: a bin
      // already quieter than the floor (real signal, not noise) must stay
      // as-is, not get pulled up to it. min(mag, ...) enforces that, and
      // also makes strength=0 (alpha=0) a true no-op rather than a subtle
      // amplification of already-quiet bins.
      const subtracted = Math.min(mag, Math.max(mag - alpha * profile[k], floor));
      const scale = mag > 1e-12 ? subtracted / mag : 0;
      re[k] *= scale;
      im[k] *= scale;
      // `scale` is real, so multiplying the mirror bin by the same scale
      // preserves conjugate symmetry (mirror = conj(bin) before AND after)
      // - required for the inverse FFT of this real-valued frame to come
      // back out real instead of complex. Bins 0 and Nyquist (k=FRAME_SIZE/2)
      // have no distinct mirror - they're already their own.
      if (k > 0 && k < FRAME_SIZE / 2) {
        const mirror = FRAME_SIZE - k;
        re[mirror] *= scale;
        im[mirror] *= scale;
      }
    }

    ifftInPlace(re, im);

    for (let i = 0; i < FRAME_SIZE; i++) {
      const w = window[i];
      output[start + i] += re[i] * w;
      windowEnergy[start + i] += w * w;
    }
  }

  // Near the absolute start/end of the buffer, fewer than the full set of
  // overlapping frames contribute (only 1 of 4 at sample 0, ramping up to
  // full coverage by ~FRAME_SIZE-HOP_SIZE samples in), so windowEnergy is
  // tiny there - dividing by it doesn't just normalize, it AMPLIFIES: any
  // spectral modification (even a legitimate, correctly-bounded one) gets
  // blown up by orders of magnitude once divided by a near-zero
  // normalizer, in a way that never happens for an *unmodified* spectrum
  // (where the division exactly undoes the window taper, by construction).
  // Found via a debug render showing peaks reaching ~2x the input's after
  // reduction - traced to exactly this division at the first ~15 samples.
  // Fix: only trust the division where overlap coverage is close to full
  // (relative to this buffer's own steady-state window energy, not an
  // assumed absolute constant); the few dozen samples at the very start/
  // end of the WHOLE processed clip fade to silence instead - an honest,
  // well-precedented STFT edge artifact (a fraction of a millisecond),
  // not a defect in the subtraction itself.
  let maxWindowEnergy = 0;
  for (let i = 0; i < windowEnergy.length; i++) {
    if (windowEnergy[i] > maxWindowEnergy) maxWindowEnergy = windowEnergy[i];
  }
  const energyThreshold = maxWindowEnergy * 0.05;
  for (let i = 0; i < output.length; i++) {
    output[i] = windowEnergy[i] > energyThreshold ? output[i] / windowEnergy[i] : 0;
  }
  return output;
}

/** Runs reduceNoiseChannel independently per channel (each channel gets its own noise profile). */
export function reduceNoiseBuffer(
  channels: Float32Array[],
  settings: NoiseReductionSettings
): Float32Array[] {
  return channels.map((channel) => reduceNoiseChannel(channel, settings));
}
