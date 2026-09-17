/**
 * The canonical/idealized shape for each oscillator type - the same
 * convention every synth UI draws (a textbook square/saw/triangle), not a
 * sample-for-sample capture of what a live OscillatorNode renders. Web
 * Audio band-limits these internally (PolyBLEP-style additive synthesis)
 * to avoid aliasing, which puts subtle ripple into the real audio this
 * doesn't attempt to replicate - drawing the idealized shape is standard
 * practice, not a misrepresentation of what's playing.
 */
export function oscillatorSample(type: OscillatorType, phase: number): number {
  const t = phase - Math.floor(phase);
  switch (type) {
    case "sine":
      return Math.sin(2 * Math.PI * t);
    case "square":
      return t < 0.5 ? 1 : -1;
    case "sawtooth":
      return 2 * t - 1;
    case "triangle":
      return t < 0.5 ? 4 * t - 1 : 3 - 4 * t;
    default:
      return Math.sin(2 * Math.PI * t);
  }
}

const SUSTAIN_HOLD_SEC = 0.4; // nominal hold shown in a static preview - a real note's hold length depends on its duration, which this editor doesn't know

/**
 * Exact piecewise-linear ADSR level at time `tSec`, matching the same
 * `linearRampToValueAtTime` shape synthVoice.ts's `scheduleVoice` actually
 * schedules on the real GainNode - not a redrawn approximation.
 */
export function adsrLevel(tSec: number, attack: number, decay: number, sustain: number, release: number): number {
  const attackEnd = attack;
  const decayEnd = attackEnd + decay;
  const holdEnd = decayEnd + SUSTAIN_HOLD_SEC;
  const releaseEnd = holdEnd + release;
  if (tSec <= attackEnd) return attack > 0 ? tSec / attack : 1;
  if (tSec <= decayEnd) return decay > 0 ? 1 + ((sustain - 1) * (tSec - attackEnd)) / decay : sustain;
  if (tSec <= holdEnd) return sustain;
  if (tSec <= releaseEnd) return release > 0 ? sustain * (1 - (tSec - holdEnd) / release) : 0;
  return 0;
}

export function adsrTotalSec(attack: number, decay: number, release: number): number {
  return attack + decay + SUSTAIN_HOLD_SEC + release;
}

export { SUSTAIN_HOLD_SEC };
