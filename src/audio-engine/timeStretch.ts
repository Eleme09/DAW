/**
 * Pitch-preserving time-stretch (WSOLA - Waveform Similarity Overlap-Add)
 * and a pitch shift built on it, for ANY audio (a full beat, not only a
 * monophonic voice the way the PSOLA-based transpose in ./pitch/ needs).
 * Backs BandLab's "Expansión de tiempo" (0.5x / 1x / 2x) and "Transponer"
 * region actions.
 *
 * WSOLA: output is built from overlapping Hann-windowed grains taken from
 * the input at a hop scaled by `speed`; each grain's exact source position
 * is nudged within ±tolerance to the spot whose waveform best matches the
 * natural continuation of the previous grain, which keeps periodic content
 * phase-coherent (no "phasey" smear of a plain overlap-add). Offsets are
 * chosen on the mono mix and applied to every channel, so stereo stays
 * aligned.
 */

const FRAME_SEC = 0.04;
const TOLERANCE_SEC = 0.012;
/** Correlation is evaluated on every Nth sample - plenty to find the best
 * alignment, and keeps a long region interactive in plain JS. */
const SEARCH_STEP = 4;

function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

/**
 * Returns new channels `1 / speed` times as long, same pitch.
 * speed 2 = twice as fast (half the length); 0.5 = half speed (double length).
 */
export function timeStretch(channels: Float32Array[], sampleRate: number, speed: number): Float32Array[] {
  if (channels.length === 0) return [];
  const inputLength = channels[0].length;
  if (Math.abs(speed - 1) < 1e-6 || inputLength === 0) return channels.map((c) => Float32Array.from(c));

  const frame = Math.max(64, Math.round(FRAME_SEC * sampleRate));
  const synthesisHop = Math.floor(frame / 2);
  const analysisHop = synthesisHop * speed;
  const tolerance = Math.round(TOLERANCE_SEC * sampleRate);
  const window = hann(frame);
  const outputLength = Math.max(1, Math.round(inputLength / speed));

  const mono = new Float32Array(inputLength);
  for (const ch of channels) for (let i = 0; i < inputLength; i++) mono[i] += ch[i] / channels.length;
  const sampleAt = (data: Float32Array, i: number) => (i >= 0 && i < data.length ? data[i] : 0);

  const out = channels.map(() => new Float32Array(outputLength + frame));
  const norm = new Float32Array(outputLength + frame);

  let prevSource = 0;
  for (let outPos = 0, k = 0; outPos < outputLength; outPos += synthesisHop, k++) {
    const nominal = Math.round(k * analysisHop);
    let best = nominal;
    if (k > 0) {
      // The natural continuation of the previous grain - the segment that
      // would have followed it had nothing been stretched.
      const target = prevSource + synthesisHop;
      let bestScore = -Infinity;
      for (let delta = -tolerance; delta <= tolerance; delta += 3) {
        const candidate = nominal + delta;
        let score = 0;
        for (let i = 0; i < frame; i += SEARCH_STEP) score += sampleAt(mono, candidate + i) * sampleAt(mono, target + i);
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
    }
    for (let c = 0; c < channels.length; c++) {
      const src = channels[c];
      const dst = out[c];
      for (let i = 0; i < frame; i++) dst[outPos + i] += sampleAt(src, best + i) * window[i];
    }
    for (let i = 0; i < frame; i++) norm[outPos + i] += window[i];
    prevSource = best;
  }

  return out.map((data) => {
    const result = new Float32Array(outputLength);
    for (let i = 0; i < outputLength; i++) result[i] = norm[i] > 1e-3 ? data[i] / norm[i] : data[i];
    return result;
  });
}

/** Linear-interpolation resample to `targetLength` samples. */
function resampleTo(data: Float32Array, targetLength: number): Float32Array {
  const out = new Float32Array(targetLength);
  if (data.length === 0) return out;
  const ratio = (data.length - 1) / Math.max(1, targetLength - 1);
  for (let i = 0; i < targetLength; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(data.length - 1, i0 + 1);
    const frac = pos - i0;
    out[i] = data[i0] * (1 - frac) + data[i1] * frac;
  }
  return out;
}

/**
 * Shifts pitch by `semitones` keeping the length: stretch by the pitch
 * ratio, then resample back to the original length (which raises/lowers
 * the pitch by exactly that ratio). Works on polyphonic material.
 */
export function pitchShift(channels: Float32Array[], sampleRate: number, semitones: number): Float32Array[] {
  if (semitones === 0 || channels.length === 0) return channels.map((c) => Float32Array.from(c));
  const ratio = Math.pow(2, semitones / 12);
  const length = channels[0].length;
  return timeStretch(channels, sampleRate, 1 / ratio).map((c) => resampleTo(c, length));
}

/** Plays the region backwards. */
export function reverseChannels(channels: Float32Array[]): Float32Array[] {
  return channels.map((c) => Float32Array.from(c).reverse());
}
