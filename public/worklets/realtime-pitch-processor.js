/**
 * Real-time pitch correction for live monitoring while singing — the
 * streaming counterpart to the offline Phase 5 pipeline
 * (pitch/pitchDetection.ts + correctionCurve.ts + psola.ts). Deliberately
 * NOT a reuse of that offline code (it needs the whole recording up
 * front); this is a from-scratch streaming/causal reimplementation of the
 * same algorithms, kept self-contained plain JS like every other worklet
 * in this project (see AUDIO_ENGINE.md "Loading the noise-gate worklet"
 * for why worklets stay dependency-free static files).
 *
 * Three stages per output sample:
 *  1. YIN pitch detection on a rolling analysis window (same algorithm as
 *     pitchDetection.ts's detectPitchYin, same threshold/range defaults),
 *     re-run every hop (~512 samples, ~11.6ms at 44.1kHz).
 *  2. A streaming version of correctionCurve.ts's glide+humanize logic —
 *     same math, restructured as a per-hop state update instead of a
 *     whole-array pass, so "how retune speed/humanize sound" matches the
 *     offline tool exactly. Produces `this.pitchRatio`, the target/current
 *     ratio for stage 3.
 *  3. A causal, real-time TD-PSOLA shifter (REPLACED — see below for why
 *     the previous approach was wrong and had to go).
 *
 * --- Why this isn't a resampled delay line anymore ---
 * An earlier version of stage 3 was a single read tap trailing the write
 * head by a continuously-drifting delay (`delay += 1 - pitchRatio` every
 * sample, read through linear interpolation — the digital equivalent of
 * scrubbing tape at a slightly different speed). That design DID shift
 * pitch correctly and was free of clicks, but it has a structural flaw
 * that isn't a bug to patch: reading a waveform at a different speed moves
 * EVERY frequency in it by the same ratio, formants included — which is
 * exactly the "chipmunk/Darth Vader" coloration real Auto-Tune/Waves Tune
 * do NOT have. Measured directly, not assumed: feeding that shifter a
 * synthetic 8-harmonic test tone (standing in for a formant structure) and
 * a +7-semitone correction, the harmonic-amplitude PATTERN at the new,
 * shifted frequencies matched the ORIGINAL pattern almost exactly — proof
 * the whole spectral envelope moved with the pitch instead of staying put.
 * That is the real, measured cause of "el autotune no sirve/suena
 * artificial" for any correction bigger than a cent-level nudge.
 *
 * TD-PSOLA (Time-Domain Pitch-Synchronous Overlap-Add) fixes this because
 * it never resamples the waveform at all: it cuts real, unresampled
 * 2-period grains out of the input at the input's own natural rate (so
 * each grain's internal spectral envelope — the formants — is untouched,
 * straight from the real recording), then re-deposits those exact grains
 * into the output at a DIFFERENT repetition rate (closer together = higher
 * pitch, farther apart = lower). Only the REPETITION rate changes; the
 * content of each repeated grain does not, which is what keeps formants
 * fixed while the fundamental moves — a pitch shift without a vocal-tract
 * resize. This is the same family of technique real-time hardware/plugin
 * pitch correctors use (not literally Antares' proprietary implementation,
 * which is unknown/closed, but the same textbook principle).
 *
 * Mechanics, causal/real-time constraints included:
 *  - `extractGrain()` runs once per estimated input period (~every
 *    `smoothedPeriod` samples): searches a short backward-only window for
 *    the nearest local amplitude peak (a cheap, causal proxy for a true
 *    glottal-closure epoch — no future samples available in a live
 *    stream), then copies a *fully causal* 2-period window ending at that
 *    point straight out of the rolling input ring buffer. No resampling
 *    happens here — the copied samples are bit-for-bit the real recorded
 *    waveform.
 *  - `depositGrain()` runs once per *target* period (`smoothedPeriod /
 *    pitchRatio` samples — faster than extraction when shifting up,
 *    slower when shifting down): windows the most recently extracted grain
 *    (Hann) and adds it into a small overlap-add buffer, always centered a
 *    fixed `SYNTH_LOOKAHEAD` samples ahead of the current read position —
 *    this fixed lookahead (not a growing one) is this stage's entire added
 *    latency, ~20ms at 44.1kHz, deliberately small because this is a live
 *    monitor and every extra ms makes it harder to sing along with. When
 *    shifting up, the same grain naturally gets deposited more than once
 *    in a row (synthesis outruns extraction); shifting down, some
 *    extracted grains are naturally never deposited (extraction outruns
 *    synthesis) — both are standard PSOLA behavior, not a bug.
 *  - Reading the overlap-add buffer divides by a parallel accumulated-
 *    window-weight buffer (classic weighted-OLA normalization) because
 *    retiming the hop away from exactly half the window length breaks the
 *    Hann window's constant-overlap-add property — without this division,
 *    bigger corrections would gain/lose energy in a slow amplitude
 *    "breathing" pattern. At `pitchRatio === 1` the hop IS exactly half the
 *    window length, so the buffer reconstructs the original input to
 *    near-bit-perfect accuracy (a free correctness check on the engine
 *    itself, not just the shift it applies at other ratios).
 *  - A short, fully-silent voiced period at startup (no grain extracted
 *    yet) or a period estimate too low to fit the fixed lookahead budget
 *    (sub-~45Hz input, rare for a vocal-focused effect, and already below
 *    `detectMinHz`'s own practical defaults) is handled by clamping the
 *    grain length rather than growing the lookahead — a deliberately
 *    small, constant latency was chosen over perfect low-end quality; see
 *    `maxGrainPeriod`.
 *
 * Real, honest limitations of THIS implementation (not invented/hidden):
 *  - Epoch marking is a cheap local-peak search, not true glottal-closure
 *    detection — good enough for a clear single voice, noisier on a
 *    breathy/distorted/multi-voice input than a lab-grade pitch tracker.
 *  - All retiming happens through one engine; there's no separate voiced/
 *    unvoiced (noise vs. tone) split, so sibilants and breaths ride through
 *    the same grain machinery as sung notes (their "pitch" estimate is
 *    whatever the last voiced period held).
 *  - Total latency through this stage is small and fixed (~20ms) by
 *    design, not auto-tuned per voice — a bass voice near the very bottom
 *    of the detectable range gets a slightly truncated grain rather than
 *    more latency.
 */

const SCALE_INTERVALS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  naturalMinor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};
// index 4 ("custom") isn't in here - it's a runtime bitmask (customMask
// param), not a fixed interval set, checked separately in nearestScaleMidi.
const SCALE_NAMES_BY_INDEX = ["major", "naturalMinor", "harmonicMinor", "chromatic", "custom"];

const YIN_THRESHOLD = 0.15;
const MIN_HZ = 70;
const MAX_HZ = 1000;
const VOICED_CONFIDENCE_MIN = 0.5;

const HUMANIZE_MAX_SEMITONES = 0.15;
const HUMANIZE_WALK_STEP = 0.05;
const HUMANIZE_WALK_DECAY = 0.9;

// Time constant for smoothing the *detected* pitch/period before either is
// used for anything downstream - fast enough to follow a real note change
// (~40ms, well under retuneSpeedMs's own default of 120ms), slow enough to
// reject hop-to-hop YIN jitter and momentary octave errors instead of
// turning them straight into an audible wobble (speed wobble in the old
// delay-line shifter; grain-size/epoch jitter here).
const DETECT_SMOOTH_TAU_SEC = 0.04;

const ANALYSIS_SIZE = 2048;
const HOP_SIZE = 512;
const RING_SIZE = 8192; // power of 2, comfortably > ANALYSIS_SIZE and > the largest possible grain + epoch-search margin
const MIN_PITCH_RATIO = 0.7;
const MAX_PITCH_RATIO = 1.4;
const WEIGHT_EPS = 1e-6;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wrapIndex(a, size) {
  const m = a % size;
  return m < 0 ? m + size : m;
}

function frequencyToMidi(freq, refHz) {
  return 69 + 12 * Math.log2(freq / refHz);
}

function midiToFrequency(midi, refHz) {
  return refHz * Math.pow(2, (midi - 69) / 12);
}

/** `scale === "custom"` checks `customMask` (bit N set = pitch class N
 * allowed) instead of a fixed interval table - see the addendum's "tap a
 * key to exclude that note" requirement, which needs an arbitrary,
 * user-editable note set rather than one of the fixed named scales. */
function nearestScaleMidi(midi, key, scale, customMask) {
  const intervals = scale === "custom" ? null : SCALE_INTERVALS[scale] || SCALE_INTERVALS.chromatic;
  const rounded = Math.round(midi);
  let best = rounded;
  let bestDist = Infinity;
  for (let candidate = rounded - 12; candidate <= rounded + 12; candidate++) {
    const pc = (((candidate - key) % 12) + 12) % 12;
    const allowed = intervals ? intervals.indexOf(pc) !== -1 : (customMask & (1 << pc)) !== 0;
    if (!allowed) continue;
    const dist = Math.abs(candidate - midi);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}

/** Same algorithm as pitchDetection.ts's detectPitchYin, translated to plain JS (no TS syntax, worklets can't import modules here). */
function yinDetect(frame, sampleRate, minHz, maxHz, threshold) {
  const maxTau = Math.min(frame.length - 1, Math.floor(sampleRate / minHz));
  const minTau = Math.max(2, Math.floor(sampleRate / maxHz));
  if (maxTau <= minTau) return { frequencyHz: null, confidence: 0 };

  const windowLength = frame.length - maxTau;
  if (windowLength <= 0) return { frequencyHz: null, confidence: 0 };

  const diff = new Float32Array(maxTau + 1);
  for (let tau = 0; tau <= maxTau; tau++) {
    let sum = 0;
    for (let j = 0; j < windowLength; j++) {
      const delta = frame[j] - frame[j + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }

  const cmnd = new Float32Array(maxTau + 1);
  cmnd[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    runningSum += diff[tau];
    cmnd[tau] = runningSum > 0 ? (diff[tau] * tau) / runningSum : 1;
  }

  let tauEstimate = -1;
  for (let tau = minTau; tau <= maxTau; tau++) {
    if (cmnd[tau] < threshold) {
      while (tau + 1 <= maxTau && cmnd[tau + 1] < cmnd[tau]) tau++;
      tauEstimate = tau;
      break;
    }
  }

  if (tauEstimate === -1) {
    tauEstimate = minTau;
    for (let tau = minTau + 1; tau <= maxTau; tau++) {
      if (cmnd[tau] < cmnd[tauEstimate]) tauEstimate = tau;
    }
    const confidence = Math.max(0, 1 - cmnd[tauEstimate]);
    if (confidence < 0.5) return { frequencyHz: null, confidence: confidence };
  }

  const x0 = tauEstimate > minTau ? tauEstimate - 1 : tauEstimate;
  const x2 = tauEstimate < maxTau ? tauEstimate + 1 : tauEstimate;
  let betterTau = tauEstimate;
  if (x0 !== tauEstimate && x2 !== tauEstimate) {
    const s0 = cmnd[x0];
    const s1 = cmnd[tauEstimate];
    const s2 = cmnd[x2];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) betterTau = tauEstimate + (s2 - s0) / denom;
  }

  const confidence = Math.max(0, Math.min(1, 1 - cmnd[tauEstimate]));
  return { frequencyHz: sampleRate / betterTau, confidence: confidence };
}

// 0/1/2 rather than a string, and an AudioParam rather than a port message:
// k-rate params are guaranteed to be in effect from the very first render
// quantum once set via `.value =` on the main thread, with no async
// round-trip. A port message is NOT — postMessage to a worklet is a real
// async hop, and for a one-shot OfflineAudioContext render in particular
// (which can finish crunching samples before the message is even
// delivered), the worklet would run with its default scale instead of the
// one actually requested. This bit early during development, caught by a
// verification test that rendered a known off-pitch tone and found the
// output snapping to a note outside the requested scale — worth
// remembering if another "occasional config" ever seems like a port-message
// candidate: if it needs to be correct from sample zero, it needs to be an
// AudioParam, not a message.

class RealtimePitchProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "key", defaultValue: 0, minValue: 0, maxValue: 11 },
      { name: "scaleIndex", defaultValue: 1, minValue: 0, maxValue: 4 },
      { name: "customMask", defaultValue: 2741, minValue: 0, maxValue: 4095 },
      { name: "retuneSpeedMs", defaultValue: 120, minValue: 0, maxValue: 500 },
      { name: "humanizeAmount", defaultValue: 0, minValue: 0, maxValue: 1 },
      { name: "mix", defaultValue: 1, minValue: 0, maxValue: 1 },
      { name: "referenceHz", defaultValue: 440, minValue: 400, maxValue: 480 },
      { name: "detectMinHz", defaultValue: MIN_HZ, minValue: 40, maxValue: 300 },
      { name: "detectMaxHz", defaultValue: MAX_HZ, minValue: 300, maxValue: 2000 },
      { name: "bypassed", defaultValue: 0, minValue: 0, maxValue: 1 },
      // 0 = "scale" (existing scale-correction behavior below), 1 = "fixed"
      // (constant transpose, no pitch detection/target involved - see
      // fixedSemitones and the mode check in runAnalysisHop).
      { name: "mode", defaultValue: 0, minValue: 0, maxValue: 1 },
      // Range matches what the PSOLA shifter can actually do before
      // MIN/MAX_PITCH_RATIO clamps it (±0.7x..1.4x = roughly ±6 semitones,
      // see clamp() in runAnalysisHop) - the param bound is honest about
      // the ceiling, not wider than what the shifter can deliver.
      { name: "fixedSemitones", defaultValue: 0, minValue: -6, maxValue: 6 },
    ];
  }

  constructor() {
    super();

    this.ring = new Float32Array(RING_SIZE);
    this.ringWritePos = 0;
    this.samplesWritten = 0;
    this.analysisScratch = new Float32Array(ANALYSIS_SIZE);
    this.samplesUntilHop = HOP_SIZE;

    this.detectedHz = null;
    this.confidence = 0;
    this.targetHz = null;
    this.smoothedTargetMidi = null;
    // Smoothed version of the YIN-detected pitch, used as the *denominator*
    // of the shift ratio (see runAnalysisHop). Raw per-hop YIN output is
    // noisy on a real voice - vibrato, breathiness, sibilants, and the
    // occasional octave error - filtering it keeps that noise from turning
    // straight into ratio jitter.
    this.smoothedDetectedMidi = null;
    this.snappedMidi = null;
    this.humanizeWalk = 0;

    this.pitchRatio = 1;

    // --- TD-PSOLA engine state ---
    // Smoothed estimate of the input's own natural period, in samples -
    // drives both grain size (extraction) and grain spacing (both
    // extraction and deposit). Held (not reset) through brief unvoiced
    // gaps so grain size doesn't jump on every consonant/breath. Default
    // seeds it at a mid-vocal 220Hz so the engine has *something* sane to
    // work with before the first real detection lands.
    this.smoothedPeriod = sampleRate / 220;

    // Fixed added latency of the synthesis stage (~20ms) - see the header
    // comment for why this is a small constant instead of a value that
    // grows with the detected period.
    this.synthLookahead = Math.round(sampleRate * 0.02);
    // A grain's period can't exceed what the fixed lookahead budget can fit
    // (with a safety margin) - see "Real, honest limitations" above.
    this.maxGrainPeriod = Math.max(32, this.synthLookahead - 64);
    this.minPeriodSamples = Math.max(8, Math.floor(sampleRate / 2000));

    this.olaSize = 4096; // power of 2, comfortably > synthLookahead + maxGrainPeriod
    this.olaBuffer = new Float32Array(this.olaSize);
    this.weightBuffer = new Float32Array(this.olaSize);
    this.outputReadPos = 0;

    this.lastGrainRaw = null;
    this.lastGrainWindow = null;
    this.lastGrainLength = 0;

    this.samplesUntilAnalysisEpoch = Math.round(this.smoothedPeriod);
    this.samplesUntilSynthesisEpoch = Math.round(this.smoothedPeriod);

    this.hopsSinceReport = 0;
  }

  runAnalysisHop(key, scale, customMask, retuneSpeedMs, humanizeAmount, referenceHz, detectMinHz, detectMaxHz, mode, fixedSemitones) {
    // Extract the ANALYSIS_SIZE most recent samples from the ring, oldest first.
    let start = (this.ringWritePos - ANALYSIS_SIZE + RING_SIZE) % RING_SIZE;
    for (let i = 0; i < ANALYSIS_SIZE; i++) {
      this.analysisScratch[i] = this.ring[(start + i) % RING_SIZE];
    }

    // Detection still runs in "fixed" mode too - purely for the live
    // detected-note readout (so you can see what you're singing before the
    // constant transpose is applied), never to derive the shift ratio
    // itself. It also always feeds the period tracker below, since grain
    // sizing needs a real period estimate regardless of mode.
    const yin = yinDetect(this.analysisScratch, sampleRate, detectMinHz, detectMaxHz, YIN_THRESHOLD);
    this.detectedHz = yin.frequencyHz;
    this.confidence = yin.confidence;

    const dtSec = HOP_SIZE / sampleRate;

    // Period tracking - independent of mode, feeds grain sizing for the
    // PSOLA engine either way. Held at its last value when unvoiced rather
    // than reset, so a brief consonant/breath doesn't jerk the grain size.
    if (this.detectedHz !== null && this.confidence >= VOICED_CONFIDENCE_MIN) {
      const rawPeriod = clamp(sampleRate / this.detectedHz, this.minPeriodSamples, sampleRate / 40);
      const periodAlpha = 1 - Math.exp(-dtSec / DETECT_SMOOTH_TAU_SEC);
      this.smoothedPeriod += (rawPeriod - this.smoothedPeriod) * periodAlpha;
    }

    if (mode === 1) {
      // Fixed transpose: a constant ratio, deliberately independent of
      // whatever's detected - no scale snapping, no glide, no humanize
      // (none of those mean anything for "always shift by N semitones").
      this.pitchRatio = clamp(Math.pow(2, fixedSemitones / 12), MIN_PITCH_RATIO, MAX_PITCH_RATIO);
      this.smoothedTargetMidi = null;
      this.snappedMidi = null;
      this.targetHz =
        this.detectedHz !== null && this.confidence >= VOICED_CONFIDENCE_MIN ? this.detectedHz * this.pitchRatio : null;
      return;
    }

    if (this.detectedHz === null || this.confidence < VOICED_CONFIDENCE_MIN) {
      this.smoothedTargetMidi = null;
      this.smoothedDetectedMidi = null;
      this.snappedMidi = null;
      this.targetHz = null;
      this.pitchRatio = 1;
      return;
    }

    const detectedMidi = frequencyToMidi(this.detectedHz, referenceHz);

    // Smooth the detected pitch itself before it drives anything - both the
    // scale-snap decision and the shift ratio denominator. Without this, a
    // single noisy/octave-wrong hop out of YIN (common on real vocals)
    // flips the snapped note and/or spikes the ratio for that hop alone.
    if (this.smoothedDetectedMidi === null) {
      this.smoothedDetectedMidi = detectedMidi;
    } else {
      const detectAlpha = 1 - Math.exp(-dtSec / DETECT_SMOOTH_TAU_SEC);
      this.smoothedDetectedMidi += (detectedMidi - this.smoothedDetectedMidi) * detectAlpha;
    }

    const snappedMidi = nearestScaleMidi(this.smoothedDetectedMidi, key, scale, customMask);
    this.snappedMidi = snappedMidi;

    const step = (Math.random() * 2 - 1) * HUMANIZE_WALK_STEP;
    this.humanizeWalk = clamp(this.humanizeWalk * HUMANIZE_WALK_DECAY + step, -1, 1);
    const desiredMidi = snappedMidi + this.humanizeWalk * HUMANIZE_MAX_SEMITONES * humanizeAmount;

    if (this.smoothedTargetMidi === null) {
      this.smoothedTargetMidi = this.smoothedDetectedMidi;
    }
    if (retuneSpeedMs <= 0) {
      this.smoothedTargetMidi = desiredMidi;
    } else {
      const tau = retuneSpeedMs / 1000;
      const alpha = 1 - Math.exp(-dtSec / tau);
      this.smoothedTargetMidi += (desiredMidi - this.smoothedTargetMidi) * alpha;
    }

    this.targetHz = midiToFrequency(this.smoothedTargetMidi, referenceHz);
    // Ratio derived from the two smoothed MIDI values (semitone domain),
    // not raw targetHz/detectedHz - keeps a single noisy detection hop from
    // producing a single noisy ratio hop, same reasoning as smoothedTargetMidi.
    this.pitchRatio = clamp(Math.pow(2, (this.smoothedTargetMidi - this.smoothedDetectedMidi) / 12), MIN_PITCH_RATIO, MAX_PITCH_RATIO);
  }

  /** Cuts a fully causal, un-resampled 2-period grain out of the input ring
   * buffer, ending at a cheap backward-only local-peak epoch (a practical
   * stand-in for a true glottal-closure mark - no future samples exist in
   * a live stream to do better). The grain is raw signal, untouched -
   * preserving its content is exactly what keeps formants fixed later. */
  extractGrain() {
    const period = clamp(Math.round(this.smoothedPeriod), this.minPeriodSamples, this.maxGrainPeriod);
    const length = 2 * period;
    const nowAbs = this.samplesWritten - 1;
    const searchLen = Math.max(1, Math.floor(period / 2));

    let bestAbsVal = -1;
    let bestOffset = 0;
    for (let k = 0; k < searchLen; k++) {
      const a = nowAbs - k;
      if (a < 0) break;
      const v = Math.abs(this.ring[wrapIndex(a, RING_SIZE)]);
      if (v > bestAbsVal) {
        bestAbsVal = v;
        bestOffset = k;
      }
    }
    const epoch = nowAbs - bestOffset;
    if (epoch - (length - 1) < 0) return; // not enough history yet (startup) - keep whatever grain we already had

    if (!this.lastGrainRaw || this.lastGrainRaw.length !== length) {
      this.lastGrainRaw = new Float32Array(length);
      this.lastGrainWindow = new Float32Array(length);
      for (let n = 0; n < length; n++) {
        this.lastGrainWindow[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (length - 1));
      }
    }
    for (let n = 0; n < length; n++) {
      const a = epoch - (length - 1) + n;
      this.lastGrainRaw[n] = this.ring[wrapIndex(a, RING_SIZE)];
    }
    this.lastGrainLength = length;
  }

  /** Windows the most recently extracted grain and adds it into the
   * overlap-add buffer centered `synthLookahead` samples ahead of the
   * current read position - deliberately a fixed offset from "now", not
   * an accumulating one, so the engine self-corrects every deposit instead
   * of drifting. Also accumulates the raw window shape into a parallel
   * buffer for the weighted-OLA normalization read() does. */
  depositGrain() {
    if (!this.lastGrainRaw) return;
    const length = this.lastGrainLength;
    const half = length / 2;
    const center = this.outputReadPos + this.synthLookahead;
    const start = Math.round(center - half);
    for (let n = 0; n < length; n++) {
      const idx = wrapIndex(start + n, this.olaSize);
      const w = this.lastGrainWindow[n];
      this.olaBuffer[idx] += this.lastGrainRaw[n] * w;
      this.weightBuffer[idx] += w;
    }
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0] && inputs[0][0];
    const output = outputs[0] && outputs[0][0];
    if (!output) return true;
    if (!input) {
      output.fill(0);
      return true;
    }

    const bypassed = parameters.bypassed[0] >= 0.5;
    const key = Math.round(parameters.key[0]);
    const scale = SCALE_NAMES_BY_INDEX[Math.round(parameters.scaleIndex[0])] || "naturalMinor";
    const customMask = Math.round(parameters.customMask[0]);
    const retuneSpeedMs = parameters.retuneSpeedMs[0];
    const humanizeAmount = parameters.humanizeAmount[0];
    const mix = parameters.mix[0];
    const referenceHz = parameters.referenceHz[0];
    const detectMinHz = parameters.detectMinHz[0];
    const detectMaxHz = parameters.detectMaxHz[0];
    const mode = Math.round(parameters.mode[0]);
    const fixedSemitones = parameters.fixedSemitones[0];

    for (let i = 0; i < input.length; i++) {
      const x = input[i];

      this.ring[this.ringWritePos] = x;
      this.ringWritePos = (this.ringWritePos + 1) % RING_SIZE;
      this.samplesWritten++;
      this.samplesUntilHop--;
      if (this.samplesUntilHop <= 0 && this.samplesWritten >= ANALYSIS_SIZE) {
        this.samplesUntilHop = HOP_SIZE;
        this.runAnalysisHop(
          key,
          scale,
          customMask,
          retuneSpeedMs,
          humanizeAmount,
          referenceHz,
          detectMinHz,
          detectMaxHz,
          mode,
          fixedSemitones
        );
        this.hopsSinceReport++;
        if (this.hopsSinceReport >= 4) {
          this.hopsSinceReport = 0;
          this.port.postMessage({
            type: "pitch",
            detectedHz: this.detectedHz,
            targetHz: this.targetHz,
            snappedMidi: this.snappedMidi,
            confidence: this.confidence,
            pitchRatio: this.pitchRatio,
            // Cents from the raw detected pitch to the *unsmoothed* nearest
            // scale note - a tuner-style "how far off" reading, distinct
            // from targetHz (which is smoothed by retuneSpeedMs/humanize
            // and is what you'll actually hear, not what you sang).
            centsOff:
              this.snappedMidi === null || this.detectedHz === null
                ? null
                : (frequencyToMidi(this.detectedHz, referenceHz) - this.snappedMidi) * 100,
          });
        }
      }

      if (bypassed) {
        output[i] = x;
        continue; // PSOLA engine state stays frozen (not advanced), resumes cleanly once un-bypassed
      }

      this.samplesUntilAnalysisEpoch--;
      if (this.samplesUntilAnalysisEpoch <= 0) {
        this.extractGrain();
        this.samplesUntilAnalysisEpoch = Math.max(1, Math.round(this.smoothedPeriod));
      }

      this.samplesUntilSynthesisEpoch--;
      if (this.samplesUntilSynthesisEpoch <= 0) {
        this.depositGrain();
        this.samplesUntilSynthesisEpoch = Math.max(1, Math.round(this.smoothedPeriod / this.pitchRatio));
      }

      const idx = wrapIndex(this.outputReadPos, this.olaSize);
      const weight = this.weightBuffer[idx];
      const outSample = weight > WEIGHT_EPS ? this.olaBuffer[idx] / weight : 0;
      this.olaBuffer[idx] = 0;
      this.weightBuffer[idx] = 0;
      this.outputReadPos++;

      output[i] = x * (1 - mix) + outSample * mix;
    }

    return true;
  }
}

registerProcessor("realtime-pitch-processor", RealtimePitchProcessor);
