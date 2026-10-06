/**
 * AutoPitch - BandLab-style real-time vocal tuning with harmony voices,
 * vocoder and character effects. Mono in, stereo out.
 *
 * Built on what Antares Auto-Tune (Auto-Tune Realtime Advanced manual) and
 * Waves Tune Real-Time (its manual) do, because the earlier tuner
 * (realtime-pitch-processor.js) broke in exactly the places these products
 * are careful about:
 *
 *  - Two time constants, not one: `speedMs` corrects drift WITHIN a note
 *    (Auto-Tune Retune Speed, Waves Speed - 0 = the hard "Auto-Tune effect")
 *    and `transitionMs` moves BETWEEN notes (Waves Note Transition).
 *  - Hysteresis on the target note (Waves Tolerance): singing between two
 *    scale notes no longer flips the target back and forth every few ms.
 *  - Humanize is Auto-Tune's: a slower correction only on the held part of
 *    long notes. (The old tuner added a random pitch wobble instead.)
 *  - Flex-Tune: corrects only when the voice is near the note; bends and
 *    slides pass through.
 *  - Level/amount scales the correction distance (Waves "Correction %").
 *    Nothing ever blends the dry voice with the delayed corrected one - that
 *    blend is a comb filter (the old tuner's `mix`).
 *  - Choosy detection (Auto-Tune Tracking / Waves Range): YIN plus an energy
 *    gate, voicing hysteresis, a median of three, and octave-jump
 *    confirmation (a jump of more than 7 semitones has to repeat before it is
 *    believed - a single octave error no longer becomes an audible jump).
 *
 * Pitch shifting is real-time TD-PSOLA with a CONSTANT latency D:
 *  - Analysis: pitch marks (epochs) are TRACKED period by period - each new
 *    mark is searched only within +-1/4 period of where the previous mark
 *    plus one period says it should be, on a low-passed copy of the input.
 *    The old tuner took the loudest sample of the last half period, which
 *    hops between waveform peaks and makes the output rough/buzzy.
 *  - Synthesis: each output stream (lead + up to 4 voices) places its own
 *    marks one TARGET period apart and, for each mark m, takes the input
 *    grain whose epoch is nearest to m - D. Grains are Hann-windowed, one
 *    input period per side, optionally resampled to move the formants
 *    (Chip, Gorgon, the "Original" algorithm's harmony voices), and scaled
 *    by hop/halfLength so the overlap-add keeps a constant level.
 *  - Because D is constant, the dry input delayed by D lines up sample-exact
 *    with the tuned voice: unvoiced sounds (s, sh, t, breaths) crossfade to
 *    that clean dry signal instead of going through the grain machinery.
 *  - D = 26 ms (lead), 14 ms with "Low-Latency" - grains can be up to D/2
 *    per side, so a voice down to ~77 Hz (14 ms: ~143 Hz) keeps full grains;
 *    lower ones get shorter grains (the documented Low-Latency trade-off).
 *    Harmony voices use D + 16 ms: they need longer grains to go an octave
 *    down, and a few ms of offset behind the lead reads as a double, not an
 *    echo.
 *
 * After the voices: vocoder (16-band channel vocoder whose carrier follows
 * the tuned pitch, plays a chord, or holds a drone on the key), auto-wah,
 * bit crusher, drive, high/low-pass, compressor, stereo chorus. Reverb is a
 * native ConvolverNode after this node (AutoPitchEffect.ts).
 */

const TWO_PI = Math.PI * 2;
const RING = 16384; // input history, power of 2 (> analysis + D + grain at 96 kHz)
const RING_MASK = RING - 1;
const OLA = 8192;
const OLA_MASK = OLA - 1;
const DECIM = 2;
const HOP = 256; // input samples between analyses (~5.8 ms at 44.1 kHz)
const MIN_HZ = 70;
const MAX_HZ = 1000;
const YIN_THRESHOLD = 0.2;
const MIN_CONFIDENCE = 0.55;
const GATE_RMS = 0.0018; // ~ -55 dBFS: quieter frames are treated as unvoiced
const MAX_VOICES = 4;
const STREAMS = MAX_VOICES + 1; // stream 0 = lead
const VOC_BANDS = 16;
const WIN_SIZE = 2048;
// Hann half-window table: HANN[i] = 0.5 + 0.5 cos(pi * i / WIN_SIZE), i = 0..WIN_SIZE
const HANN = new Float32Array(WIN_SIZE + 2);
for (let i = 0; i <= WIN_SIZE + 1; i++) HANN[i] = 0.5 + 0.5 * Math.cos((Math.PI * Math.min(i, WIN_SIZE)) / WIN_SIZE);

const SCALE_TABLES = [
  null, // custom (mask)
  null, // chromatic
  [0, 2, 4, 5, 7, 9, 11], // major
  [0, 2, 3, 5, 7, 8, 10], // minor
  [0, 2, 4, 7, 9], // major pentatonic
  [0, 3, 5, 7, 10], // minor pentatonic
];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function allowedPcs(scaleIndex, mask) {
  if (scaleIndex === 1) return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  if (scaleIndex === 0) {
    const pcs = [];
    for (let pc = 0; pc < 12; pc++) if (mask & (1 << pc)) pcs.push(pc);
    return pcs.length ? pcs : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  }
  return SCALE_TABLES[scaleIndex] || MAJOR;
}

/** Steps for diatonic harmony: a "third" means two steps of a 7-note scale.
 * Pentatonics and chromatic harmonize in their parent major/minor; a custom
 * scale uses its own notes when it has at least 5. */
function harmonyPcs(scaleIndex, mask) {
  if (scaleIndex === 3 || scaleIndex === 5) return MINOR;
  if (scaleIndex === 0) {
    const pcs = allowedPcs(0, mask);
    return pcs.length >= 5 ? pcs : MAJOR;
  }
  return MAJOR;
}

/** Nearest allowed note (MIDI, integer) to `midi` (float). */
function nearestNote(midi, key, pcs) {
  const r = Math.round(midi);
  let best = r;
  let bestDist = Infinity;
  for (let c = r - 7; c <= r + 7; c++) {
    const pc = (((c - key) % 12) + 12) % 12;
    if (pcs.indexOf(pc) === -1) continue;
    const d = Math.abs(c - midi);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

/** `note` moved `steps` degrees along `pcs` (relative to `key`). A note that
 * isn't in the scale is first taken to the scale note just below it. */
function diatonicShift(note, steps, key, pcs) {
  const n = pcs.length;
  const rel = note - key;
  let oct = Math.floor(rel / 12);
  const pc = rel - oct * 12;
  let idx = 0;
  for (let i = 0; i < n; i++) if (pcs[i] <= pc) idx = i;
  const below = pcs[idx];
  let j = idx + steps;
  oct += Math.floor(j / n);
  j = ((j % n) + n) % n;
  return key + oct * 12 + pcs[j] + (pc - below);
}

function hzToMidi(hz, ref) {
  return 69 + 12 * Math.log2(hz / ref);
}

function midiToHz(m, ref) {
  return ref * Math.pow(2, (m - 69) / 12);
}

/** RBJ biquad, direct form I. */
function makeBiquad() {
  return { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0, x1: 0, x2: 0, y1: 0, y2: 0 };
}

function setBiquad(f, type, freq, q, sr) {
  const w0 = (TWO_PI * clamp(freq, 10, sr * 0.45)) / sr;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  let b0;
  let b1;
  let b2;
  if (type === "lp") {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = (1 - cos) / 2;
  } else if (type === "hp") {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = (1 + cos) / 2;
  } else {
    // band-pass, 0 dB peak
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  }
  f.b0 = b0 / a0;
  f.b1 = b1 / a0;
  f.b2 = b2 / a0;
  f.a1 = (-2 * cos) / a0;
  f.a2 = (1 - alpha) / a0;
}

function runBiquad(f, x) {
  const y = f.b0 * x + f.b1 * f.x1 + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2;
  f.x2 = f.x1;
  f.x1 = x;
  f.y2 = f.y1;
  f.y1 = y;
  return y;
}

/** Half-width, in output samples, of the grain for an epoch whose period is
 * `per`: one input period each side (scaled by the formant factor), at least
 * 0.7 of the output hop so neighbours overlap, never more than the latency
 * budget `hMax` allows. */
function grainHalfWidth(per, ratio, f, hMax) {
  const hop = Math.max(8, per / ratio);
  return Math.min(Math.max(per / f, 0.7 * hop), hMax);
}

function polyBlep(t, dt) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

const VOICE_FIELDS = ["Active", "Interval", "Diatonic", "Gain", "Pan", "Formant", "Detune", "Delay"];

const PARAMS = [
  ["key", 9, 0, 11],
  ["scaleIndex", 2, 0, 5],
  ["customMask", 2741, 0, 4095],
  ["referenceHz", 440, 400, 480],
  ["amount", 1, 0, 1],
  ["speedMs", 0, 0, 1000],
  ["transitionMs", 0, 0, 1000],
  ["humanize", 0, 0, 1],
  ["flex", 0, 0, 1],
  ["lowLatency", 0, 0, 1],
  ["formantFollow", 1, 0, 1],
  ["leadGain", 1, 0, 2],
  ["vibRate", 0, 0, 12],
  ["vibCents", 0, 0, 200],
  ["vocMix", 0, 0, 2],
  ["vocCarrier", 0, 0, 2],
  ["crushBits", 16, 2, 16],
  ["crushDown", 1, 1, 32],
  ["crushMix", 0, 0, 1],
  ["wahMix", 0, 0, 1],
  ["wahRate", 1, 0.05, 10],
  ["driveAmt", 0, 0, 1],
  ["driveMix", 0, 0, 1],
  ["hpHz", 20, 20, 2000],
  ["lpHz", 20000, 500, 20000],
  ["comp", 0, 0, 1],
  ["chorusMix", 0, 0, 1],
  ["chorusDepth", 3, 0, 15],
  ["chorusRate", 0.5, 0.05, 8],
  ["outGain", 1, 0, 4],
];
for (let i = 0; i < MAX_VOICES; i++) {
  PARAMS.push([`v${i}Active`, 0, 0, 1]);
  PARAMS.push([`v${i}Interval`, 0, -24, 24]);
  PARAMS.push([`v${i}Diatonic`, 0, 0, 1]);
  PARAMS.push([`v${i}Gain`, 0, 0, 2]);
  PARAMS.push([`v${i}Pan`, 0, -1, 1]);
  PARAMS.push([`v${i}Formant`, 0, 0, 3]);
  PARAMS.push([`v${i}Detune`, 0, -100, 100]);
  PARAMS.push([`v${i}Delay`, 0, 0, 40]);
}

class AutoPitchProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return PARAMS.map(([name, defaultValue, minValue, maxValue]) => ({ name, defaultValue, minValue, maxValue, automationRate: "k-rate" }));
  }

  constructor() {
    super();
    const sr = sampleRate;
    this.sr = sr;
    this.p = {};

    // input history + a low-passed copy for epoch peak picking
    this.ring = new Float32Array(RING);
    this.lpRing = new Float32Array(RING);
    this.lpFilter = makeBiquad();
    setBiquad(this.lpFilter, "lp", 1000, 0.707, sr);

    this.n = 0; // absolute index of the next input sample

    // decimated analysis ring. The YIN frame is as short as the lowest pitch
    // allows (2.1 periods of MIN_HZ, ~30 ms): its centre is then only ~15 ms
    // old, close to the input instant the grains are cut from.
    this.frameLen = Math.ceil((2.1 * sr) / DECIM / MIN_HZ);
    this.dRing = new Float32Array(this.frameLen * 2);
    this.dPos = 0;
    this.dSmooth = 0;
    this.dCount = 0;
    this.frame = new Float32Array(this.frameLen);
    this.yinDiff = new Float32Array(this.frameLen);
    this.untilHop = HOP;
    // correction at the centre of the last two analysis frames, so each grain
    // gets the correction for ITS input instant (interpolated), not the
    // newest frame's (which lags a vibrato by ~15 ms)
    this.histT0 = 0;
    this.histC0 = 0;
    this.histT1 = 0;
    this.histC1 = 0;
    // the pitch the tuned voice should have (detected + correction) at the same
    // two frame centres: output marks are spaced from THIS, not from the
    // input's own period jitter (see deposit)
    this.histO0 = 0;
    this.histO1 = 0;
    this.histOK0 = false;
    this.histOK1 = false;

    // detection state
    this.voiced = false;
    this.voicedHops = 0;
    this.unvoicedHops = 10;
    this.detMidi = null; // accepted detected pitch (MIDI, float)
    this.prev1 = null;
    this.prev2 = null;
    this.suspect = null;
    this.suspectHops = 0;
    this.pendingJump = null;
    this.period = sr / 200; // smoothed input period, samples

    // correction state
    this.targetNote = null;
    this.avgA = null; // two-pole average of the detected pitch (note decisions)
    this.avgMidi = 0;
    this.correction = 0; // semitones applied to the input
    this.transitioning = false;
    this.heldSec = 0;
    this.voiceOffset = new Float32Array(MAX_VOICES);
    this.voiceDrift = new Float32Array(MAX_VOICES);
    this.vibPhase = 0;
    this.outMidi = null; // pitch of the tuned lead (for vocoder carriers)

    // epochs
    this.epochPos = new Float64Array(512);
    this.epochPer = new Float32Array(512);
    this.epochCount = 0;
    this.lastEpoch = 0;
    this.epochLocked = false;
    this.alignScores = new Float64Array(2048);

    // synthesis streams
    this.ola = [];
    this.nextMark = new Float64Array(STREAMS);
    this.streamOn = new Uint8Array(STREAMS);
    this.olaW = []; // per stream: sum of the grain windows written to each slot
    for (let s = 0; s < STREAMS; s++) {
      this.ola.push(new Float32Array(OLA));
      this.olaW.push(new Float32Array(OLA));
    }
    this.configureLatency(0);

    // voicing crossfade (lead: dry <-> tuned; voices: gate)
    this.voicedGain = 0;
    this.voiceGate = 0;

    // vocoder: 16 band-pass pairs (modulator/carrier) sharing coefficients,
    // kept in typed arrays - this loop runs 32 filters per sample
    this.vB0 = new Float64Array(VOC_BANDS);
    this.vA1 = new Float64Array(VOC_BANDS);
    this.vA2 = new Float64Array(VOC_BANDS);
    this.vState = new Float64Array(VOC_BANDS * 8); // per band: mod x1 x2 y1 y2, car x1 x2 y1 y2
    this.vocEnv = new Float32Array(VOC_BANDS);
    for (let b = 0; b < VOC_BANDS; b++) {
      const fc = 150 * Math.pow(6000 / 150, b / (VOC_BANDS - 1));
      const f = makeBiquad();
      setBiquad(f, "bp", fc, 4.5, sr);
      this.vB0[b] = f.b0;
      this.vA1[b] = f.a1;
      this.vA2[b] = f.a2;
    }
    this.carPhase = new Float32Array(3);
    this.carHz = new Float32Array([110, 0, 0]);
    this.vocAtk = 1 - Math.exp(-1 / (0.002 * sr));
    this.vocRel = 1 - Math.exp(-1 / (0.015 * sr));
    this.noiseSeed = 12345;

    // post effects
    this.wahL = { low: 0, band: 0 };
    this.wahR = { low: 0, band: 0 };
    this.wahPhase = 0;
    this.crushHold = 0;
    this.crushL = 0;
    this.crushR = 0;
    this.hpL = makeBiquad();
    this.hpR = makeBiquad();
    this.lpL = makeBiquad();
    this.lpR = makeBiquad();
    this.hpHz = -1;
    this.lpHz = -1;
    this.compEnv = 0;
    this.compAtk = 1 - Math.exp(-1 / (0.005 * sr));
    this.compRel = 1 - Math.exp(-1 / (0.12 * sr));
    this.chorusL = new Float32Array(4096);
    this.chorusR = new Float32Array(4096);
    this.chorusPos = 0;
    this.chorusPhase = 0;
    this.depositCalls = 0; // work counter (tests assert it stays bounded)
    this.panL = new Float32Array(MAX_VOICES);
    this.panR = new Float32Array(MAX_VOICES);
    this.vDetune = new Float32Array(MAX_VOICES);
    this.vFormant = new Float32Array(MAX_VOICES);
    this.vDelay = new Float32Array(MAX_VOICES);
  }

  configureLatency(lowLatency) {
    this.lowLatency = lowLatency;
    const sr = this.sr;
    this.delay = new Float64Array(STREAMS);
    this.hMax = new Float64Array(STREAMS);
    const leadD = Math.round(sr * (lowLatency ? 0.014 : 0.026));
    const voiceD = leadD + Math.round(sr * 0.016);
    for (let s = 0; s < STREAMS; s++) {
      this.delay[s] = s === 0 ? leadD : voiceD;
      this.hMax[s] = Math.floor(this.delay[s] / 2) - 2;
      this.ola[s].fill(0);
      this.olaW[s].fill(0);
      this.nextMark[s] = this.n + this.hMax[s];
    }
  }

  readParams(parameters) {
    const p = this.p;
    for (let i = 0; i < PARAMS.length; i++) {
      const name = PARAMS[i][0];
      p[name] = parameters[name][0];
    }
  }

  // ---------------------------------------------------------------- analysis

  yin() {
    const sr = this.sr / DECIM;
    const frame = this.frame;
    const FRAME = this.frameLen;
    const start = this.dPos; // oldest sample (ring holds 2 frames, we read the last one)
    const len = this.dRing.length;
    let energy = 0;
    for (let i = 0; i < FRAME; i++) {
      const v = this.dRing[(start + len - FRAME + i) % len];
      frame[i] = v;
      energy += v * v;
    }
    const rms = Math.sqrt(energy / FRAME);
    const maxTau = Math.min(Math.floor(FRAME / 2), Math.floor(sr / MIN_HZ));
    const minTau = Math.max(2, Math.floor(sr / MAX_HZ));
    const w = FRAME - maxTau;
    const d = this.yinDiff;
    d[0] = 1;
    let running = 0;
    let tauEstimate = -1;
    for (let tau = 1; tau <= maxTau; tau++) {
      let sum = 0;
      for (let j = 0; j < w; j++) {
        const delta = frame[j] - frame[j + tau];
        sum += delta * delta;
      }
      running += sum;
      d[tau] = running > 0 ? (sum * tau) / running : 1;
    }
    for (let tau = minTau; tau <= maxTau; tau++) {
      if (d[tau] < YIN_THRESHOLD) {
        while (tau + 1 <= maxTau && d[tau + 1] < d[tau]) tau++;
        tauEstimate = tau;
        break;
      }
    }
    if (tauEstimate === -1) {
      tauEstimate = minTau;
      for (let tau = minTau + 1; tau <= maxTau; tau++) if (d[tau] < d[tauEstimate]) tauEstimate = tau;
    }
    // Subharmonic guard: the first dip under the threshold can be a multiple of
    // the true period (a noisy cycle misses the threshold, the next-but-one
    // matches it). When a half/third/quarter of that lag is nearly as good a
    // match, that shorter lag is the pitch - an octave-down detection makes
    // the tuner correct towards a note an octave away from what is sung.
    for (let div = 4; div >= 2; div--) {
      const t0 = Math.round(tauEstimate / div);
      if (t0 < minTau) continue;
      let bestT = -1;
      let bestD = Infinity;
      for (let t = Math.max(minTau, t0 - 2); t <= Math.min(maxTau, t0 + 2); t++) {
        if (d[t] < bestD) {
          bestD = d[t];
          bestT = t;
        }
      }
      if (bestT > 0 && bestD < d[tauEstimate] + 0.1 && bestD < 0.5) {
        tauEstimate = bestT;
        break;
      }
    }
    const confidence = clamp(1 - d[tauEstimate], 0, 1);
    let better = tauEstimate;
    if (tauEstimate > minTau && tauEstimate < maxTau) {
      const s0 = d[tauEstimate - 1];
      const s1 = d[tauEstimate];
      const s2 = d[tauEstimate + 1];
      const denom = 2 * (2 * s1 - s2 - s0);
      if (denom !== 0) better = tauEstimate + (s2 - s0) / denom;
    }
    return { hz: sr / better, confidence, rms };
  }

  analyze() {
    const p = this.p;
    const ref = p.referenceHz;
    const dt = HOP / this.sr;
    const det = this.yin();
    const goodFrame = det.rms >= GATE_RMS && det.confidence >= MIN_CONFIDENCE;

    // voicing with hysteresis: on after 1 good frame, off after 2 bad ones
    if (goodFrame) {
      this.voicedHops++;
      this.unvoicedHops = 0;
    } else {
      this.unvoicedHops++;
      this.voicedHops = 0;
    }
    const wasVoiced = this.voiced;
    if (!this.voiced && this.voicedHops >= 1) this.voiced = true;
    if (this.voiced && this.unvoicedHops >= 2) this.voiced = false;

    if (goodFrame) {
      let raw = hzToMidi(det.hz, ref);
      // octave-jump confirmation: a jump of more than 7 semitones must repeat
      if (this.detMidi !== null && wasVoiced && Math.abs(raw - this.detMidi) > 7) {
        if (this.pendingJump !== null && Math.abs(raw - this.pendingJump) < 1) {
          this.pendingJump = null;
          this.medianCount = 0;
        } else {
          this.pendingJump = raw;
          raw = this.detMidi;
        }
      } else {
        this.pendingJump = null;
      }
      // outlier rejection without the lag of a median filter: while the pitch
      // is steady, a reading that jumps more than half a semitone away is held
      // back until later readings agree with it (3 in a row, ~17 ms). A real
      // note change persists and gets through; a tracking error comes in runs
      // of 1-3 hops that don't agree and never reach the tuner - one such run
      // used to flip the target to the neighbouring note for a few ms, which
      // is an audible blip in a hard-tuned voice.
      let m = raw;
      const steady = this.prev1 !== null && this.prev2 !== null && Math.abs(this.prev1 - this.prev2) < 0.25;
      if (steady && Math.abs(raw - this.prev1) > 0.5) {
        if (this.suspect !== null && Math.abs(raw - this.suspect) < 0.5) this.suspectHops++;
        else {
          this.suspect = raw;
          this.suspectHops = 1;
        }
        if (this.suspectHops >= 3) {
          this.suspect = null; // it persisted: a real change
        } else {
          m = this.prev1;
        }
      } else {
        this.suspect = null;
      }
      this.prev2 = this.prev1;
      this.prev1 = m;
      this.detMidi = m;
      if (this.avgA === null) {
        this.avgA = m;
        this.avgMidi = m;
      } else {
        const k = 1 - Math.exp(-dt / 0.03);
        this.avgA += (m - this.avgA) * k;
        this.avgMidi += (this.avgA - this.avgMidi) * k;
      }
      const per = clamp(this.sr / midiToHz(m, ref), this.sr / MAX_HZ, this.sr / MIN_HZ);
      this.period += (per - this.period) * (1 - Math.exp(-dt / 0.012));
    }

    if (!this.voiced || this.detMidi === null) {
      this.targetNote = null;
      this.transitioning = false;
      this.correction *= Math.exp(-dt / 0.03);
      if (!this.voiced) {
        this.prev1 = null;
        this.prev2 = null;
        this.suspect = null;
        this.avgA = null;
      }
      this.pushHistory(false);
      return;
    }

    const key = Math.round(p.key);
    const scaleIndex = Math.round(p.scaleIndex);
    const pcs = allowedPcs(scaleIndex, Math.round(p.customMask));
    const d = this.detMidi;
    const nearest = nearestNote(d, key, pcs);

    if (this.targetNote === null) {
      this.targetNote = nearest;
      this.transitioning = true;
      this.heldSec = 0;
      this.correction = 0;
      this.updateVoiceOffsets(key, scaleIndex);
    } else {
      // Tolerance (Waves Tune's Tolerance Cents/Time): switch at once when the
      // voice lands on the new note (25+ cents past the midpoint between the
      // two); otherwise decide on the pitch averaged over ~60 ms, which
      // vibrato riding near the midpoint can't push across but a real note
      // change - even one sung 30 cents off - does within ~75 ms.
      const avgNearest = nearestNote(this.avgMidi, key, pcs);
      const rawMargin = Math.abs(d - this.targetNote) - Math.abs(d - nearest);
      const avgMargin = Math.abs(this.avgMidi - this.targetNote) - Math.abs(this.avgMidi - avgNearest);
      let next = null;
      if (nearest !== this.targetNote && rawMargin > 0.5) next = nearest;
      else if (avgNearest !== this.targetNote && avgMargin > 0.1) next = avgNearest;
      if (next !== null) {
        this.targetNote = next;
        this.transitioning = true;
        this.heldSec = 0;
        this.updateVoiceOffsets(key, scaleIndex);
      }
    }

    let wanted = (this.targetNote - d) * p.amount;
    if (p.flex > 0) {
      const zone = 1.2 - 1.0 * p.flex;
      const dist = Math.abs(this.targetNote - d);
      if (dist > zone) wanted *= Math.max(0, 1 - (dist - zone) / 0.4);
    }
    let tauSec = (this.transitioning ? p.transitionMs : p.speedMs) / 1000;
    if (!this.transitioning && p.humanize > 0 && this.heldSec > 0.15) {
      tauSec += p.humanize * 0.25 * Math.min(1, (this.heldSec - 0.15) / 0.3);
    }
    const alpha = tauSec <= 0.0005 ? 1 : 1 - Math.exp(-dt / tauSec);
    this.correction += (wanted - this.correction) * alpha;
    if (this.transitioning && Math.abs(wanted - this.correction) < 0.05) this.transitioning = false;
    this.heldSec += dt;
    this.outMidi = d + this.correction;
    this.pushHistory(true);

    // per-voice drift: two copies of a voice must not move identically
    for (let v = 0; v < MAX_VOICES; v++) {
      const step = (Math.random() * 2 - 1) * 0.25;
      this.voiceDrift[v] = clamp(this.voiceDrift[v] * 0.97 + step * 0.1, -1, 1);
    }
  }

  pushHistory(voiced) {
    // centre of the frame just analysed, in input samples
    const center = this.n - (this.frameLen * DECIM) / 2;
    this.histT0 = this.histT1;
    this.histC0 = this.histC1;
    this.histO0 = this.histO1;
    this.histOK0 = this.histOK1;
    this.histT1 = center;
    this.histC1 = this.correction;
    this.histO1 = this.outMidi === null ? 0 : this.outMidi;
    this.histOK1 = voiced && this.outMidi !== null;
  }

  /** Pitch (MIDI) the tuned voice has at input instant `t`, interpolated
   * between the last two voiced frames; null when either was unvoiced. */
  outMidiAt(t) {
    if (!this.histOK0 || !this.histOK1) return null;
    const span = this.histT1 - this.histT0;
    if (span <= 0) return this.histO1;
    const a = clamp((t - this.histT0) / span, 0, 1);
    return this.histO0 + (this.histO1 - this.histO0) * a;
  }

  /** Correction at input instant `t`: interpolated between the last two
   * frames, extrapolated at most one hop ahead while the motion is smooth
   * (never across a note jump, which would overshoot). */
  correctionAt(t) {
    const span = this.histT1 - this.histT0;
    if (span <= 0) return this.histC1;
    const dc = this.histC1 - this.histC0;
    if (t <= this.histT1) {
      const a = clamp((t - this.histT0) / span, 0, 1);
      return this.histC0 + dc * a;
    }
    if (Math.abs(dc) > 0.3) return this.histC1;
    return this.histC1 + dc * (Math.min(t - this.histT1, HOP) / span);
  }

  updateVoiceOffsets(key, scaleIndex) {
    const p = this.p;
    const hp = harmonyPcs(scaleIndex, Math.round(p.customMask));
    for (let v = 0; v < MAX_VOICES; v++) {
      const interval = Math.round(p[`v${v}Interval`]);
      if (p[`v${v}Diatonic`] >= 0.5) {
        this.voiceOffset[v] = diatonicShift(this.targetNote, interval, key, hp) - this.targetNote;
      } else {
        this.voiceOffset[v] = interval;
      }
    }
  }

  // ---------------------------------------------------------------- epochs

  trackEpochs(now) {
    // `now` = absolute index of the newest input sample
    let guard = 0;
    while (guard++ < 4) {
      const P = this.period;
      const cand = this.lastEpoch + P;
      // alignEpoch compares one period of signal on each side of the
      // candidate, so that period must already be in the history: wait for
      // it (reading ahead of `now` would compare against audio from one
      // ring length ago and bias every epoch early)
      const reach = Math.ceil(cand + P / 4) + (this.voiced ? Math.floor(P * 0.5) + 1 : 0);
      if (reach > now) return;
      let e = cand;
      if (this.voiced) {
        e = this.epochLocked ? this.alignEpoch(cand, P) : this.firstEpoch(cand, P);
        this.epochLocked = true;
      } else {
        this.epochLocked = false;
      }
      if (now - e > RING / 2) {
        e = now - Math.round(P); // resync after a long gap
        this.epochLocked = false;
      }
      const k = this.epochCount & 511;
      this.epochPos[k] = e;
      this.epochPer[k] = clamp(e - this.lastEpoch, this.sr / MAX_HZ, this.sr / MIN_HZ);
      this.epochCount++;
      this.lastEpoch = e;
    }
  }

  /** Fractional position of the loudest point of the signal within
   * `centre` +- `reach`: the maximum of the energy (x squared) smoothed over
   * ~P/8. In a voice that is the glottal pulse and the first ms of formant
   * ringing after it - the one place per period where nearly all the energy is.
   * Polarity-free, and a smoothed energy has one broad peak per period, so it
   * does not hop between the 2-3 comparable peaks of the raw waveform. */
  energyPeak(centre, reach, P) {
    const ring = this.ring;
    const w = Math.max(3, Math.round(P / 16));
    const lo = Math.round(centre) - Math.floor(reach);
    const hi = Math.round(centre) + Math.floor(reach);
    let acc = 0;
    for (let i = lo - w; i <= lo + w; i++) {
      const v = ring[i & RING_MASK];
      acc += v * v;
    }
    let bestI = lo;
    let best = acc;
    let prev = acc;
    let next = acc;
    const energies = this.alignScores;
    const n = hi - lo + 1;
    if (n >= 3 && n <= energies.length) {
      energies[0] = acc;
      for (let i = lo + 1; i <= hi; i++) {
        const a = ring[(i + w) & RING_MASK];
        const b = ring[(i - w - 1) & RING_MASK];
        acc += a * a - b * b;
        energies[i - lo] = acc;
        if (acc > best) {
          best = acc;
          bestI = i;
        }
      }
      const k = bestI - lo;
      if (k > 0 && k < n - 1) {
        prev = energies[k - 1];
        next = energies[k + 1];
        const den = prev - 2 * best + next;
        if (den < 0) return bestI + clamp((0.5 * (prev - next)) / den, -0.5, 0.5);
      }
    }
    return bestI;
  }

  /** First epoch of a voiced stretch: the energy peak nearest the period
   * grid. Which landmark it lands on matters: a grain is two periods wide
   * and weighted to zero at +-1 period, so with the epoch ON the glottal
   * pulse each grain holds exactly one strong pulse; an epoch half a period
   * off puts two pulses in every grain, and when the pitch is shifted they
   * are overlapped twice at slightly different positions (a comb filter:
   * level dips and a rough, hollow sound). */
  firstEpoch(cand, P) {
    return this.energyPeak(cand, P / 2, P);
  }

  /** Next epoch = where the waveform around the PREVIOUS epoch repeats best,
   * searched within +-P/4 of the predicted position (normalized
   * cross-correlation over one period, refined to a fraction of a sample).
   * Following the waveform's own shape keeps the marks on one feature of
   * the glottal pulse. The old picker took the highest low-passed sample
   * near the prediction, which on a real voice hops between the two or three
   * comparable peaks of a period: the output then glitched (period errors of
   * 10-20 % every few dozen cycles) and sounded rough/hoarse. */
  alignEpoch(cand, P) {
    const ring = this.ring;
    const half = Math.max(8, Math.floor(P * 0.5));
    const prev = Math.round(this.lastEpoch);
    const reach = Math.max(2, Math.floor(P / 4));
    const centre = Math.round(cand);
    const step = P > 400 ? 2 : 1;
    let refEnergy = 0;
    for (let i = -half; i <= half; i += step) {
      const v = ring[(prev + i) & RING_MASK];
      refEnergy += v * v;
    }
    if (refEnergy < 1e-9) return cand;
    const scores = this.alignScores;
    let bestIdx = 0;
    let best = -Infinity;
    const n = 2 * reach + 1;
    for (let o = -reach; o <= reach; o++) {
      const c = centre + o;
      let cross = 0;
      let energy = 0;
      for (let i = -half; i <= half; i += step) {
        const a = ring[(prev + i) & RING_MASK];
        const b = ring[(c + i) & RING_MASK];
        cross += a * b;
        energy += b * b;
      }
      const score = energy > 1e-9 ? cross / Math.sqrt(energy * refEnergy) : -1;
      scores[o + reach] = score;
      if (score > best) {
        best = score;
        bestIdx = o + reach;
      }
    }
    let frac = 0;
    if (bestIdx > 0 && bestIdx < n - 1) {
      const a = scores[bestIdx - 1];
      const b = scores[bestIdx];
      const c = scores[bestIdx + 1];
      const den = a - 2 * b + c;
      if (den < 0) frac = clamp((0.5 * (a - c)) / den, -0.5, 0.5);
    }
    const aligned = centre + (bestIdx - reach) + frac;
    // The correlation keeps every epoch on the same feature as the one before
    // but has no idea where on the period that is; a slow pull toward the
    // energy peak keeps it on the pulse (see firstEpoch) instead of letting
    // it wander off over many periods.
    // The pull has a dead zone (a few % of a period): inside it the epoch is
    // left exactly where the correlation put it, which is the most consistent
    // position; the pull only acts when it has really wandered.
    const peak = this.energyPeak(aligned, Math.max(3, P / 8), P);
    const dev = peak - aligned;
    const dead = P / 24;
    if (dev > dead) return aligned + 0.2 * (dev - dead);
    if (dev < -dead) return aligned + 0.2 * (dev + dead);
    return aligned;
  }

  /** The stored epoch nearest to `u` whose grain is already fully in the
   * input history. A grain's half-width depends on that epoch's own period
   * (`grainHalfWidth`), so availability is checked per epoch - an epoch that
   * is too recent for its grain is skipped for the previous one, never
   * cut short (a cut-short grain used to be amplified by hop/width and blew
   * the output up on real voices). */
  findEpoch(u, now, ratio, f, hMax) {
    const count = Math.min(this.epochCount, 512);
    let bestK = -1;
    let bestDist = Infinity;
    for (let i = 1; i <= count; i++) {
      const k = (this.epochCount - i) & 511;
      const e = this.epochPos[k];
      const per = this.epochPer[k];
      if (e + grainHalfWidth(per, ratio, f, hMax) * f > now) continue;
      const dist = Math.abs(e - u);
      if (dist < bestDist) {
        bestDist = dist;
        bestK = k;
      } else if (e < u) {
        break; // going further back only gets farther
      }
    }
    return bestK;
  }

  // ---------------------------------------------------------------- synthesis

  /** Semitones the stream shifts the input by at input instant `t`, and the
   * part of that which is NOT the tuner's correction (harmony interval,
   * detune, drift, vibrato) - the second is what output marks need. */
  streamSemis(s, t) {
    const p = this.p;
    const c = this.correctionAt(t);
    if (s === 0) return { semis: c, extra: 0 };
    const v = s - 1;
    const vib = p.vibCents > 0 ? (p.vibCents / 100) * Math.sin(this.vibPhase) : 0;
    const extra = this.voiceOffset[v] + this.vDetune[v] / 100 + this.voiceDrift[v] * 0.06 + vib;
    return { semis: c + extra, extra };
  }

  streamRatio(s, t) {
    const { semis } = this.streamSemis(s, t);
    return s === 0 ? clamp(Math.pow(2, semis / 12), 0.5, 2) : clamp(Math.pow(2, semis / 12), 0.25, 4);
  }

  streamFormant(s, ratio) {
    const p = this.p;
    if (s === 0) return 1;
    const fixed = this.vFormant[s - 1];
    if (fixed > 0) return fixed;
    return p.formantFollow > 0 ? Math.pow(ratio, p.formantFollow) : 1;
  }

  deposit(s, now) {
    this.depositCalls++;
    let mark = this.nextMark[s];
    const ratio = this.streamRatio(s, mark - this.delay[s]);
    const f = clamp(this.streamFormant(s, ratio), 0.5, 2.5);
    const k = this.findEpoch(mark - this.delay[s], now, ratio, f, this.hMax[s]);
    if (k < 0) {
      this.nextMark[s] = mark + Math.max(8, this.period / ratio);
      return;
    }
    const e = this.epochPos[k];
    // With no shift to apply, lock the mark onto the epoch: the output is
    // then the input delayed by exactly D, in phase with the dry path the
    // consonants use. (While shifting, marks must drift against epochs -
    // that drift IS the pitch change - so the lock only engages at 1:1.)
    const per = this.epochPer[k];
    // (only when that epoch is the one expected here: a stale fallback epoch
    // would drag the mark into the past and the scheduler would then spend
    // its whole time catching up)
    if (Math.abs(ratio - 1) < 0.0006 && s === 0 && Math.abs(e - (mark - this.delay[s])) < 0.5 * per) mark = e + this.delay[s];
    // Output marks are spaced from the pitch the voice SHOULD have, not from
    // the input epoch's own spacing: that carried the input's period jitter
    // (and the epoch picker's +-1 sample noise) straight into the output, which
    // a tuned voice must not have - cycle-to-cycle period noise above ~0.5 % is
    // what reads as rough/hoarse. At 100 % hard tune the target is one fixed
    // note, so the marks are exactly periodic.
    let hop = Math.max(8, per / ratio);
    const outMidi = this.outMidiAt(mark - this.delay[s]);
    if (outMidi !== null) {
      const { extra } = this.streamSemis(s, mark - this.delay[s]);
      const regular = clamp(this.sr / midiToHz(outMidi + extra, this.p.referenceHz), this.sr / 2000, this.sr / 30);
      // Cross-check against the input's own period: when the detector is wrong
      // (an octave error makes the "target" an octave away from what is really
      // being sung) the two disagree by far more than any correction does, and
      // following the target would drop the voice an octave. Then keep the
      // old behaviour (move the input by the correction), which stays close
      // to the sung pitch whatever the detector believed.
      if (Math.abs(regular / hop - 1) < 0.12) hop = regular;
    }
    this.nextMark[s] = mark + hop;
    const hOut = grainHalfWidth(per, ratio, f, this.hMax[s]);
    if (hOut < 4) return;
    const delaySamples = s === 0 ? 0 : (this.vDelay[s - 1] * this.sr) / 1000;
    const center = mark + delaySamples;
    const buf = this.ola[s];
    const wbuf = this.olaW[s];
    // never write behind the read position (that slot would replay one
    // buffer-length later)
    const j0 = Math.max(now, Math.ceil(center - hOut));
    const j1 = Math.floor(center + hOut);
    const winScale = WIN_SIZE / hOut;
    for (let j = j0; j <= j1; j++) {
      const x = j - center;
      const wi = (x < 0 ? -x : x) * winScale;
      const w0 = wi | 0;
      const w = HANN[w0] + (HANN[w0 + 1] - HANN[w0]) * (wi - w0);
      const pos = e + x * f;
      const i0 = Math.floor(pos);
      const frac = pos - i0;
      const a = this.ring[i0 & RING_MASK];
      const b = this.ring[(i0 + 1) & RING_MASK];
      buf[j & OLA_MASK] += (a + (b - a) * frac) * w;
      wbuf[j & OLA_MASK] += w;
    }
  }

  nextNoise() {
    this.noiseSeed = (this.noiseSeed * 1664525 + 1013904223) >>> 0;
    return this.noiseSeed / 2147483648 - 1;
  }

  updateCarriers() {
    const p = this.p;
    const ref = p.referenceHz;
    const mode = Math.round(p.vocCarrier);
    const key = Math.round(p.key);
    if (mode === 2) {
      let tonic = 36 + key;
      if (tonic < 40) tonic += 12;
      this.carHz[0] = midiToHz(tonic, ref);
      this.carHz[1] = midiToHz(tonic + 7, ref);
      this.carHz[2] = midiToHz(tonic + 12, ref);
      return;
    }
    if (this.outMidi === null) return; // hold the last pitch through consonants
    this.carHz[0] = midiToHz(this.outMidi, ref);
    if (mode === 1 && this.targetNote !== null) {
      const hp = harmonyPcs(Math.round(p.scaleIndex), Math.round(p.customMask));
      const third = diatonicShift(this.targetNote, 2, key, hp) - this.targetNote;
      const fifth = diatonicShift(this.targetNote, 4, key, hp) - this.targetNote;
      this.carHz[1] = midiToHz(this.outMidi + third, ref);
      this.carHz[2] = midiToHz(this.outMidi + fifth, ref);
    } else {
      this.carHz[1] = 0;
      this.carHz[2] = 0;
    }
  }

  vocoder(mod) {
    const sr = this.sr;
    let car = 0;
    let count = 0;
    for (let c = 0; c < 3; c++) {
      const hz = this.carHz[c];
      if (hz <= 0) continue;
      const dt = hz / sr;
      let ph = this.carPhase[c] + dt;
      if (ph >= 1) ph -= 1;
      this.carPhase[c] = ph;
      car += (2 * ph - 1 - polyBlep(ph, dt)) * (c === 0 ? 1 : 0.7);
      count++;
    }
    if (count > 1) car /= Math.sqrt(count);
    car += this.nextNoise() * (this.voiced ? 0.08 : 0.5);
    let out = 0;
    const st = this.vState;
    const env = this.vocEnv;
    const atk = this.vocAtk;
    const rel = this.vocRel;
    for (let b = 0; b < VOC_BANDS; b++) {
      const b0 = this.vB0[b];
      const a1 = this.vA1[b];
      const a2 = this.vA2[b];
      const o = b * 8;
      // band-pass: b1 = 0, b2 = -b0
      const m = b0 * (mod - st[o + 1]) - a1 * st[o + 2] - a2 * st[o + 3];
      st[o + 1] = st[o];
      st[o] = mod;
      st[o + 3] = st[o + 2];
      st[o + 2] = m;
      const c = b0 * (car - st[o + 5]) - a1 * st[o + 6] - a2 * st[o + 7];
      st[o + 5] = st[o + 4];
      st[o + 4] = car;
      st[o + 7] = st[o + 6];
      st[o + 6] = c;
      const a = m < 0 ? -m : m;
      const e = env[b];
      const ne = e + (a - e) * (a > e ? atk : rel);
      env[b] = ne;
      out += c * ne;
    }
    return out * 3;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0] && inputs[0][0];
    const out = outputs[0];
    const outL = out && out[0];
    const outR = out && out[1];
    if (!outL) return true;
    const blockLen = outL.length;
    this.readParams(parameters);
    const p = this.p;
    const sr = this.sr;

    const lowLatency = p.lowLatency >= 0.5 ? 1 : 0;
    if (lowLatency !== this.lowLatency) this.configureLatency(lowLatency);
    if (Math.abs(p.hpHz - this.hpHz) > this.hpHz * 0.005) {
      this.hpHz = p.hpHz;
      setBiquad(this.hpL, "hp", p.hpHz, 0.707, sr);
      setBiquad(this.hpR, "hp", p.hpHz, 0.707, sr);
    }
    if (Math.abs(p.lpHz - this.lpHz) > this.lpHz * 0.005) {
      this.lpHz = p.lpHz;
      setBiquad(this.lpL, "lp", p.lpHz, 0.707, sr);
      setBiquad(this.lpR, "lp", p.lpHz, 0.707, sr);
    }

    for (let s = 1; s < STREAMS; s++) {
      const on = p[`v${s - 1}Active`] >= 0.5 && p[`v${s - 1}Gain`] > 0.0001 ? 1 : 0;
      if (on && !this.streamOn[s]) {
        this.ola[s].fill(0);
        this.olaW[s].fill(0);
        this.nextMark[s] = this.n + this.hMax[s];
      }
      this.streamOn[s] = on;
    }
    this.streamOn[0] = 1;

    const panL = this.panL;
    const panR = this.panR;
    for (let v = 0; v < MAX_VOICES; v++) {
      this.vDetune[v] = p[`v${v}Detune`];
      this.vFormant[v] = p[`v${v}Formant`];
      this.vDelay[v] = p[`v${v}Delay`];
      const a = ((clamp(p[`v${v}Pan`], -1, 1) + 1) * Math.PI) / 4;
      panL[v] = Math.cos(a) * p[`v${v}Gain`];
      panR[v] = Math.sin(a) * p[`v${v}Gain`];
    }
    const center = Math.SQRT1_2;
    const useVoc = p.vocMix > 0.0001;
    const useWah = p.wahMix > 0.0001;
    const useCrush = p.crushMix > 0.0001;
    const useDrive = p.driveMix > 0.0001;
    const useComp = p.comp > 0.0001;
    const useChorus = p.chorusMix > 0.0001;
    const useHp = p.hpHz > 21;
    const useLp = p.lpHz < 19900;
    const driveK = 1 + 15 * p.driveAmt;
    const driveNorm = (1 + 0.5 * p.driveAmt) / driveK; // unity for quiet signal, peaks squashed
    const crushStep = 2 / Math.pow(2, Math.round(p.crushBits));
    const crushDown = Math.max(1, Math.round(p.crushDown));
    const compThr = -6 - 22 * p.comp;
    const compRatio = 1.5 + 6 * p.comp;
    const compMakeup = -compThr * (1 - 1 / compRatio) * 0.3;
    const gateA = 1 - Math.exp(-1 / (0.008 * sr));
    const vibInc = (TWO_PI * p.vibRate) / sr;
    const wahInc = (TWO_PI * p.wahRate) / sr;
    const chorusInc = (TWO_PI * p.chorusRate) / sr;
    const leadDelay = this.delay[0];

    for (let i = 0; i < blockLen; i++) {
      const x = input ? input[i] : 0;
      const n = this.n;
      this.ring[n & RING_MASK] = x;
      this.lpRing[n & RING_MASK] = runBiquad(this.lpFilter, x);
      this.n = n + 1;

      // decimate for analysis
      this.dSmooth += (x - this.dSmooth) * 0.45;
      if (++this.dCount >= DECIM) {
        this.dCount = 0;
        this.dRing[this.dPos] = this.dSmooth;
        this.dPos = (this.dPos + 1) % this.dRing.length;
      }
      if (--this.untilHop <= 0) {
        this.untilHop = HOP;
        if (n >= this.frameLen * DECIM) {
          this.analyze();
          if (useVoc) this.updateCarriers();
        }
      }

      this.trackEpochs(n);
      if (vibInc > 0) {
        this.vibPhase += vibInc;
        if (this.vibPhase > TWO_PI) this.vibPhase -= TWO_PI;
      }

      // schedule grains
      for (let s = 0; s < STREAMS; s++) {
        if (!this.streamOn[s]) continue;
        // One grain per hop in steady state; two when a hop behind. Further
        // behind (epochs stopped arriving, a numeric hiccup) is not caught
        // up grain by grain - that burned 8 syntheses per sample - but
        // re-synchronised in one step.
        let guard = 0;
        while (this.nextMark[s] - this.hMax[s] <= n && guard++ < 2) this.deposit(s, n);
        if (this.nextMark[s] - this.hMax[s] <= n) this.nextMark[s] = n + this.hMax[s];
      }

      // voicing crossfades
      const vTarget = this.voiced ? 1 : 0;
      this.voicedGain += (vTarget - this.voicedGain) * gateA;
      this.voiceGate += (vTarget - this.voiceGate) * gateA;

      // lead: tuned grains while voiced, the exactly-aligned dry signal otherwise
      const leadBuf = this.ola[0];
      const leadW = this.olaW[0];
      const idx = n & OLA_MASK;
      // Weighted average of the grains overlapping this sample (divided by
      // the REAL sum of their windows): the level is right whatever the
      // spacing, and can never exceed the input's own peak. Where grains
      // cover the sample thinly the original (aligned) voice fills in -
      // a gap becomes unprocessed audio, not a dropout.
      const wsum = leadW[idx];
      const tuned = wsum > 1e-4 ? leadBuf[idx] / (wsum > 0.35 ? wsum : 0.35) : 0;
      const cover = wsum >= 0.5 ? 1 : wsum * 2;
      leadBuf[idx] = 0;
      leadW[idx] = 0;
      const dry = n - leadDelay >= 0 ? this.ring[(n - leadDelay) & RING_MASK] : 0;
      const lead = (dry + (tuned - dry) * this.voicedGain * cover) * p.leadGain;

      let L = lead * center;
      let R = lead * center;
      for (let s = 1; s < STREAMS; s++) {
        if (!this.streamOn[s]) continue;
        const buf = this.ola[s];
        const wb = this.olaW[s];
        const ws = wb[idx];
        const y = ws > 1e-4 ? (buf[idx] / (ws > 0.35 ? ws : 0.35)) * this.voiceGate * (ws >= 0.5 ? 1 : ws * 2) : 0;
        buf[idx] = 0;
        wb[idx] = 0;
        L += y * panL[s - 1];
        R += y * panR[s - 1];
      }

      if (useVoc) {
        const voc = this.vocoder(dry) * p.vocMix * center;
        L += voc;
        R += voc;
      }

      if (useWah) {
        this.wahPhase += wahInc;
        if (this.wahPhase > TWO_PI) this.wahPhase -= TWO_PI;
        const fc = 350 * Math.pow(2, 2.6 * (0.5 + 0.5 * Math.sin(this.wahPhase)));
        const fco = 2 * Math.sin((Math.PI * Math.min(fc, sr / 6)) / sr);
        const q = 0.35;
        for (let c = 0; c < 2; c++) {
          const st = c === 0 ? this.wahL : this.wahR;
          const inp = c === 0 ? L : R;
          st.low += fco * st.band;
          const high = inp - st.low - q * st.band;
          st.band += fco * high;
          const wet = st.band * 2.2;
          if (c === 0) L = inp + (wet - inp) * p.wahMix;
          else R = inp + (wet - inp) * p.wahMix;
        }
      }

      if (useCrush) {
        if (this.crushHold <= 0) {
          this.crushHold = crushDown;
          this.crushL = Math.round(L / crushStep) * crushStep;
          this.crushR = Math.round(R / crushStep) * crushStep;
        }
        this.crushHold--;
        L += (this.crushL - L) * p.crushMix;
        R += (this.crushR - R) * p.crushMix;
      }

      if (useDrive) {
        L += (Math.tanh(driveK * L) * driveNorm - L) * p.driveMix;
        R += (Math.tanh(driveK * R) * driveNorm - R) * p.driveMix;
      }

      if (useHp) {
        L = runBiquad(this.hpL, L);
        R = runBiquad(this.hpR, R);
      }
      if (useLp) {
        L = runBiquad(this.lpL, L);
        R = runBiquad(this.lpR, R);
      }

      if (useComp) {
        const lvl = Math.max(L < 0 ? -L : L, R < 0 ? -R : R);
        this.compEnv += (lvl - this.compEnv) * (lvl > this.compEnv ? this.compAtk : this.compRel);
        const db = 20 * Math.log10(this.compEnv + 1e-9);
        const over = db - compThr;
        const gr = over > 0 ? over * (1 - 1 / compRatio) : 0;
        const g = Math.pow(10, (compMakeup - gr) / 20);
        L *= g;
        R *= g;
      }

      if (useChorus) {
        const cp = this.chorusPos;
        this.chorusL[cp] = L;
        this.chorusR[cp] = R;
        this.chorusPos = (cp + 1) & 4095;
        this.chorusPhase += chorusInc;
        if (this.chorusPhase > TWO_PI) this.chorusPhase -= TWO_PI;
        const depth = (p.chorusDepth * sr) / 1000;
        const base = 0.015 * sr;
        for (let c = 0; c < 2; c++) {
          const lfo = c === 0 ? Math.sin(this.chorusPhase) : Math.cos(this.chorusPhase);
          const dl = base + depth * (0.5 + 0.5 * lfo);
          const rp = cp - dl;
          const i0 = Math.floor(rp);
          const fr = rp - i0;
          const bufC = c === 0 ? this.chorusL : this.chorusR;
          const a = bufC[i0 & 4095];
          const b = bufC[(i0 + 1) & 4095];
          const wet = a + (b - a) * fr;
          if (c === 0) L += wet * p.chorusMix * 0.7;
          else R += wet * p.chorusMix * 0.7;
        }
      }

      L *= p.outGain;
      R *= p.outGain;
      if (!(L === L) || !(R === R) || L > 8 || L < -8 || R > 8 || R < -8) {
        // A numeric fault must never reach the speakers, and must not leave
        // the engine dead afterwards: wipe every buffer and start over.
        L = 0;
        R = 0;
        this.hardReset();
      }
      outL[i] = L;
      if (outR) outR[i] = R;
    }
    return true;
  }

  /** Back to a clean state (after a numeric fault): no stale grains, marks,
   * epochs or filter memory survive. */
  hardReset() {
    this.resetFilters();
    for (let s = 0; s < STREAMS; s++) {
      this.ola[s].fill(0);
      this.olaW[s].fill(0);
      this.nextMark[s] = this.n + this.hMax[s];
    }
    this.chorusL.fill(0);
    this.chorusR.fill(0);
    this.epochCount = 0;
    this.epochLocked = false;
    this.lastEpoch = this.n;
    this.period = this.sr / 200;
    this.correction = 0;
    this.histC0 = this.histC1 = 0;
    this.targetNote = null;
    this.prev1 = this.prev2 = null;
    this.avgA = null;
    this.voicedGain = 0;
    this.voiceGate = 0;
  }

  resetFilters() {
    for (const f of [this.hpL, this.hpR, this.lpL, this.lpR]) {
      f.x1 = f.x2 = f.y1 = f.y2 = 0;
    }
    this.vState.fill(0);
    this.vocEnv.fill(0);
    this.wahL.low = this.wahL.band = this.wahR.low = this.wahR.band = 0;
    this.compEnv = 0;
  }
}

registerProcessor("autopitch-processor", AutoPitchProcessor);

// Node test harness hook (vitest loads this file in a sandbox); harmless in a worklet.
if (typeof globalThis.__autopitchExports === "object") {
  globalThis.__autopitchExports.helpers = { nearestNote, diatonicShift, allowedPcs, harmonyPcs, VOICE_FIELDS };
}
