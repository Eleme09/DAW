/**
 * ITU-R BS.1770-4 gated loudness measurement — the K-weighting filter
 * pair plus the standard's absolute/relative gating algorithm, computing
 * true **integrated** (gated) LUFS instead of the momentary,
 * exponentially-smoothed approximation `loudness.ts`'s
 * `approxLufsFromMix` uses for the live meter (that one stays as-is —
 * it needs to update continuously without buffering, which the gated
 * algorithm structurally can't do).
 *
 * **Honesty note, read before trusting this as "certified":** the
 * K-weighting coefficients below are the widely-published exact values
 * for a 48kHz design (they appear verbatim across essentially every
 * independent open-source BS.1770 implementation — high confidence).
 * The gating algorithm (400ms blocks, 75% overlap, -70 LUFS absolute
 * gate, then a second pass at (ungated average - 10 LU) relative gate)
 * is implemented per the standard's documented structure. What this has
 * **not** been checked against is the ITU/EBU's own published
 * conformance test vectors (specific reference signals with known exact
 * expected outputs) — no internet access in this environment to fetch
 * them and no confident enough recall of their exact values to hand-type
 * them as a test oracle without risking a false "verified" claim. So:
 * structurally complete and built from the standard's real published
 * filter coefficients, not independently conformance-tested. Treat a
 * reading from this as trustworthy for *comparing* levels (louder vs.
 * quieter, on-target vs. off-target for a mastering suggestion) — the
 * same honest bar as everything else non-invented-precision in this
 * project — rather than a guaranteed bit-exact match to a certified
 * meter.
 *
 * Also mono-only, like the rest of this project's analysis pipeline
 * (everything downstream of `audioBufferUtils.ts`'s `mixToMono` already
 * works this way): a true multichannel BS.1770 measurement applies
 * different channel weights (e.g. surround channels get +1.5dB) before
 * summing, which this doesn't do — it measures the already-mono-summed
 * signal.
 */

const LUFS_OFFSET = -0.691;
const ABSOLUTE_GATE_LUFS = -70;
const RELATIVE_GATE_OFFSET_LU = -10;
const BLOCK_SEC = 0.4;
const HOP_SEC = 0.1; // 400ms blocks, 75% overlap
const DESIGN_SAMPLE_RATE = 48000;

/** Stage 1: shelving filter approximating head diffraction (~+4dB shelf above ~1.7kHz). Exact 48kHz-design coefficients. */
const STAGE1_B = [1.53512485958697, -2.69169618940638, 1.19839281085285];
const STAGE1_A1 = -1.69065929318241;
const STAGE1_A2 = 0.73248077421585;

/** Stage 2: RLB weighting — a high-pass rolling off below ~38Hz. Exact 48kHz-design coefficients. */
const STAGE2_B = [1.0, -2.0, 1.0];
const STAGE2_A1 = -1.99004745483398;
const STAGE2_A2 = 0.99007225036621;

function applyBiquad(data: Float32Array, b: number[], a1: number, a2: number): Float32Array {
  const out = new Float32Array(data.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x0 = data[i];
    const y0 = b[0] * x0 + b[1] * x1 + b[2] * x2 - a1 * y1 - a2 * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

/**
 * Linear-interpolation resample to the filter's 48kHz design rate. A real
 * approximation, not a bandlimited/sinc resample — acceptable here since
 * the K-weighting filter itself is already a broad perceptual
 * approximation, not a precision-critical path; documented rather than
 * silently assumed exact.
 */
function resampleLinear(data: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return data;
  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.floor(data.length / ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcPos = i * ratio;
    const i0 = Math.floor(srcPos);
    const frac = srcPos - i0;
    const s0 = i0 < data.length ? data[i0] : 0;
    const s1 = i0 + 1 < data.length ? data[i0 + 1] : 0;
    out[i] = s0 * (1 - frac) + s1 * frac;
  }
  return out;
}

/** K-weights a mono signal, resampling to 48kHz first if needed (see module header). Exposed mainly for testing. */
export function applyKWeighting(mono: Float32Array, sampleRate: number): Float32Array {
  const at48k = resampleLinear(mono, sampleRate, DESIGN_SAMPLE_RATE);
  const stage1 = applyBiquad(at48k, STAGE1_B, STAGE1_A1, STAGE1_A2);
  return applyBiquad(stage1, STAGE2_B, STAGE2_A1, STAGE2_A2);
}

function meanSquare(data: Float32Array, start: number, length: number): number {
  let sum = 0;
  for (let i = start; i < start + length; i++) sum += data[i] * data[i];
  return sum / length;
}

function loudnessOf(ms: number): number {
  return ms > 0 ? LUFS_OFFSET + 10 * Math.log10(ms) : -Infinity;
}

/**
 * BS.1770-4 integrated (gated) loudness: 400ms blocks at 100ms hop,
 * absolute-gated at -70 LUFS, then relative-gated at
 * (ungated average - 10 LU) — the standard's two-pass gating, meant to
 * stop quiet passages (intros, silence, breaths) from dragging the
 * overall reading down the way a plain average would.
 */
export function computeIntegratedLufs(mono: Float32Array, sampleRate: number): number {
  const weighted = applyKWeighting(mono, sampleRate);
  const blockSamples = Math.round(BLOCK_SEC * DESIGN_SAMPLE_RATE);
  const hopSamples = Math.round(HOP_SEC * DESIGN_SAMPLE_RATE);

  const blockMeanSquares: number[] = [];
  for (let start = 0; start + blockSamples <= weighted.length; start += hopSamples) {
    blockMeanSquares.push(meanSquare(weighted, start, blockSamples));
  }
  if (blockMeanSquares.length === 0) return -Infinity;

  const passingAbsolute = blockMeanSquares.filter((ms) => loudnessOf(ms) >= ABSOLUTE_GATE_LUFS);
  if (passingAbsolute.length === 0) return -Infinity;

  const ungatedAverageLufs = loudnessOf(average(passingAbsolute));
  const relativeThreshold = ungatedAverageLufs + RELATIVE_GATE_OFFSET_LU;

  const passingRelative = passingAbsolute.filter((ms) => loudnessOf(ms) >= relativeThreshold);
  if (passingRelative.length === 0) return -Infinity;

  return loudnessOf(average(passingRelative));
}

function average(values: number[]): number {
  let sum = 0;
  for (const v of values) sum += v;
  return values.length > 0 ? sum / values.length : 0;
}
