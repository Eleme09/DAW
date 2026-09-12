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
 *     offline tool exactly.
 *  3. A causal delay-line pitch shifter: a single read tap trails the
 *     write head by a continuously-drifting delay — `delay +=
 *     (1 - pitchRatio)` every sample. That continuous drift, read through
 *     linear interpolation, *is* the pitch shift (reading faster than 1:1
 *     = higher pitch, like scrubbing tape at a slightly different speed);
 *     it is NOT reapplied by resetting anything on a fixed cycle (an
 *     earlier version of this file used a fixed-rate 2-voice grain
 *     crossfade that reset each voice's read position every cycle — that
 *     discards the very drift that produces the shift, netting ~zero
 *     correction overall, caught by a verification test that rendered a
 *     known off-pitch tone through the worklet and measured the output
 *     frequency hadn't moved). The delay is only ever rebased — briefly
 *     crossfaded to a second "standby" tap reset to a safe centered
 *     delay — when it would otherwise drift past the delay buffer's
 *     bounds, which for realistic correction amounts (a few percent) only
 *     happens every several hundred ms to a few seconds, not every cycle.
 *     This is NOT PSOLA — PSOLA needs pitch-synchronous marks computed
 *     from the *whole* signal, including samples that haven't arrived
 *     yet, which a live monitor fundamentally can't have. Real, audible
 *     cost of the tradeoff: total latency of roughly 30-50ms (mostly the
 *     analysis window), an occasional brief crossfade artifact at a
 *     rebase (not synced to the signal's own period, unlike PSOLA), and a
 *     slightly less clean character on larger corrections than the
 *     offline PSOLA render — acceptable for "hear yourself land on the
 *     note while singing," not a substitute for the higher-quality
 *     offline correction once you've got a take down.
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

const ANALYSIS_SIZE = 2048;
const HOP_SIZE = 512;
const RING_SIZE = 4096; // power of 2, > ANALYSIS_SIZE
const DELAY_SIZE = 16384;
const MIN_PITCH_RATIO = 0.7;
const MAX_PITCH_RATIO = 1.4;
// NOMINAL_DELAY is the baseline latency through the shifter (~23ms) — kept
// small deliberately, since this is a *live monitor* and every extra ms
// between singing a note and hearing the corrected version back makes it
// harder to sing along with. DELAY_SIZE stays large regardless (headroom
// for the delay to drift before a rebase is needed, not baseline latency —
// only NOMINAL_DELAY and the MIN/MAX bounds affect what you actually hear).
const NOMINAL_DELAY = 1024;
const MIN_SAFE_DELAY = 128;
const MAX_SAFE_DELAY = DELAY_SIZE - 1024;
const CROSSFADE_LEN = 512; // ~11.6ms at 44.1kHz — long enough to hide the resync click, short enough to stay unobtrusive

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

function readDelayLinear(buffer, size, pos) {
  const wrapped = pos % size;
  const p = wrapped < 0 ? wrapped + size : wrapped;
  const i0 = Math.floor(p);
  const frac = p - i0;
  const i1 = (i0 + 1) % size;
  return buffer[i0] * (1 - frac) + buffer[i1] * frac;
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
    ];
  }

  constructor() {
    super();

    this.ring = new Float32Array(RING_SIZE);
    this.ringWritePos = 0;
    this.samplesWritten = 0;
    this.analysisScratch = new Float32Array(ANALYSIS_SIZE);
    this.samplesUntilHop = HOP_SIZE;

    this.delayBuffer = new Float32Array(DELAY_SIZE);
    this.writePos = 0;

    this.detectedHz = null;
    this.confidence = 0;
    this.targetHz = null;
    this.smoothedTargetMidi = null;
    this.snappedMidi = null;
    this.humanizeWalk = 0;

    this.pitchRatio = 1;

    // Delay-line pitch shifter: `activeDelay` is how far behind the write
    // head the (single) active read tap sits, in samples. It drifts
    // continuously by `(1 - pitchRatio)` every sample — that continuous
    // drift *is* the pitch shift (read faster than 1:1 = higher pitch),
    // exactly like scrubbing a tape at a slightly different speed. It is
    // NOT reset every grain (an earlier version of this file did that —
    // wrong: resetting the delay to a fixed value every cycle throws away
    // the very drift that produces the shift, netting ~zero correction
    // overall, caught by a verification test that measured the output
    // frequency and found it hadn't moved). A reset is only needed
    // rarely, when the drifting delay would otherwise run past the
    // delay buffer's bounds — handled by briefly crossfading to a second
    // "standby" tap reset to a safe centered delay, exactly once every
    // few hundred ms to a few seconds for realistic correction amounts,
    // not every grain cycle.
    this.activeDelay = NOMINAL_DELAY;
    this.standbyDelay = 0;
    this.crossfading = false;
    this.crossfadeProgress = 0;

    this.hopsSinceReport = 0;
  }

  runAnalysisHop(key, scale, customMask, retuneSpeedMs, humanizeAmount, referenceHz, detectMinHz, detectMaxHz) {
    // Extract the ANALYSIS_SIZE most recent samples from the ring, oldest first.
    let start = (this.ringWritePos - ANALYSIS_SIZE + RING_SIZE) % RING_SIZE;
    for (let i = 0; i < ANALYSIS_SIZE; i++) {
      this.analysisScratch[i] = this.ring[(start + i) % RING_SIZE];
    }

    const yin = yinDetect(this.analysisScratch, sampleRate, detectMinHz, detectMaxHz, YIN_THRESHOLD);
    this.detectedHz = yin.frequencyHz;
    this.confidence = yin.confidence;

    const dtSec = HOP_SIZE / sampleRate;
    if (this.detectedHz === null || this.confidence < VOICED_CONFIDENCE_MIN) {
      this.smoothedTargetMidi = null;
      this.snappedMidi = null;
      this.targetHz = null;
      this.pitchRatio = 1;
      return;
    }

    const detectedMidi = frequencyToMidi(this.detectedHz, referenceHz);
    const snappedMidi = nearestScaleMidi(detectedMidi, key, scale, customMask);
    this.snappedMidi = snappedMidi;

    const step = (Math.random() * 2 - 1) * HUMANIZE_WALK_STEP;
    this.humanizeWalk = clamp(this.humanizeWalk * HUMANIZE_WALK_DECAY + step, -1, 1);
    const desiredMidi = snappedMidi + this.humanizeWalk * HUMANIZE_MAX_SEMITONES * humanizeAmount;

    if (this.smoothedTargetMidi === null) {
      this.smoothedTargetMidi = detectedMidi;
    }
    if (retuneSpeedMs <= 0) {
      this.smoothedTargetMidi = desiredMidi;
    } else {
      const tau = retuneSpeedMs / 1000;
      const alpha = 1 - Math.exp(-dtSec / tau);
      this.smoothedTargetMidi += (desiredMidi - this.smoothedTargetMidi) * alpha;
    }

    this.targetHz = midiToFrequency(this.smoothedTargetMidi, referenceHz);
    this.pitchRatio = clamp(this.targetHz / this.detectedHz, MIN_PITCH_RATIO, MAX_PITCH_RATIO);
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

    for (let i = 0; i < input.length; i++) {
      const x = input[i];

      this.ring[this.ringWritePos] = x;
      this.ringWritePos = (this.ringWritePos + 1) % RING_SIZE;
      this.samplesWritten++;
      this.samplesUntilHop--;
      if (this.samplesUntilHop <= 0 && this.samplesWritten >= ANALYSIS_SIZE) {
        this.samplesUntilHop = HOP_SIZE;
        this.runAnalysisHop(key, scale, customMask, retuneSpeedMs, humanizeAmount, referenceHz, detectMinHz, detectMaxHz);
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

      this.delayBuffer[this.writePos % DELAY_SIZE] = x;

      if (bypassed) {
        output[i] = x;
        this.writePos++;
        continue;
      }

      // Continuous drift is the pitch shift itself — see the constructor
      // comment. `pitchRatio > 1` shrinks the delay (reads newer material
      // than 1:1 would) = higher pitch; `< 1` grows it = lower pitch.
      this.activeDelay += 1 - this.pitchRatio;

      if (!this.crossfading && (this.activeDelay < MIN_SAFE_DELAY || this.activeDelay > MAX_SAFE_DELAY)) {
        this.standbyDelay = NOMINAL_DELAY;
        this.crossfading = true;
        this.crossfadeProgress = 0;
      }

      const activeReadPos = this.writePos - this.activeDelay;
      let outSample = readDelayLinear(this.delayBuffer, DELAY_SIZE, activeReadPos);

      if (this.crossfading) {
        this.standbyDelay += 1 - this.pitchRatio;
        const standbyReadPos = this.writePos - this.standbyDelay;
        const standbySample = readDelayLinear(this.delayBuffer, DELAY_SIZE, standbyReadPos);
        // Equal-power-ish crossfade (sin/cos quarter-wave) between the old and new taps.
        const t = this.crossfadeProgress;
        const fadeOut = Math.cos((t * Math.PI) / 2);
        const fadeIn = Math.sin((t * Math.PI) / 2);
        outSample = outSample * fadeOut + standbySample * fadeIn;

        this.crossfadeProgress += 1 / CROSSFADE_LEN;
        if (this.crossfadeProgress >= 1) {
          this.activeDelay = this.standbyDelay;
          this.crossfading = false;
        }
      }

      output[i] = x * (1 - mix) + outSample * mix;
      this.writePos++;
    }

    return true;
  }
}

registerProcessor("realtime-pitch-processor", RealtimePitchProcessor);
