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

    // detection state
    this.voiced = false;
    this.voicedHops = 0;
    this.unvoicedHops = 10;
    this.detMidi = null; // accepted detected pitch (MIDI, float)
    this.prev1 = null;
    this.prev2 = null;
    this.heldOnce = false;
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

    // synthesis streams
    this.ola = [];
    this.nextMark = new Float64Array(STREAMS);
    this.streamOn = new Uint8Array(STREAMS);
    for (let s = 0; s < STREAMS; s++) this.ola.push(new Float32Array(OLA));
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
      // outlier rejection without the lag of a median filter: a reading that
      // leaves two agreeing previous readings by more than half a semitone in
      // one hop is held for one hop (real motion that fast keeps going and
      // is accepted on the next one)
      let m = raw;
      if (this.prev1 !== null && this.prev2 !== null && Math.abs(this.prev1 - this.prev2) < 0.2 && Math.abs(raw - this.prev1) > 0.5 && !this.heldOnce) {
        m = this.prev1;
        this.heldOnce = true;
      } else {
        this.heldOnce = false;
      }
      this.prev2 = this.prev1;
      this.prev1 = raw;
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
        this.avgA = null;
      }
      this.pushHistory();
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
    this.pushHistory();

    // per-voice drift: two copies of a voice must not move identically
    for (let v = 0; v < MAX_VOICES; v++) {
      const step = (Math.random() * 2 - 1) * 0.25;
      this.voiceDrift[v] = clamp(this.voiceDrift[v] * 0.97 + step * 0.1, -1, 1);
    }
  }

  pushHistory() {
    // centre of the frame just analysed, in input samples
    const center = this.n - (this.frameLen * DECIM) / 2;
    this.histT0 = this.histT1;
    this.histC0 = this.histC1;
    this.histT1 = center;
    this.histC1 = this.correction;
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
      const reach = Math.ceil(cand + P / 4);
      if (reach > now) return;
      let e = Math.round(cand);
      if (this.voiced) {
        const lo = Math.max(Math.ceil(cand - P / 4), Math.floor(this.lastEpoch + P * 0.5));
        let best = -Infinity;
        for (let i = lo; i <= reach; i++) {
          const v = this.lpRing[i & RING_MASK];
          if (v > best) {
            best = v;
            e = i;
          }
        }
      }
      if (now - e > RING / 2) e = now - Math.round(P); // resync after a long gap
      const k = this.epochCount & 511;
      this.epochPos[k] = e;
      this.epochPer[k] = clamp(e - this.lastEpoch, this.sr / MAX_HZ, this.sr / MIN_HZ);
      this.epochCount++;
      this.lastEpoch = e;
    }
  }

  /** Latest stored epoch nearest to `u` whose grain (half length `hIn`) is
   * already fully in the input history. */
  findEpoch(u, now, hIn) {
    const count = Math.min(this.epochCount, 512);
    let bestK = -1;
    let bestDist = Infinity;
    for (let i = 1; i <= count; i++) {
      const k = (this.epochCount - i) & 511;
      const e = this.epochPos[k];
      if (e + hIn > now) continue;
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

  streamRatio(s, t) {
    const p = this.p;
    const c = this.correctionAt(t);
    if (s === 0) return clamp(Math.pow(2, c / 12), 0.5, 2);
    const v = s - 1;
    const vib = p.vibCents > 0 ? (p.vibCents / 100) * Math.sin(this.vibPhase) : 0;
    const semis = c + this.voiceOffset[v] + this.vDetune[v] / 100 + this.voiceDrift[v] * 0.06 + vib;
    return clamp(Math.pow(2, semis / 12), 0.25, 4);
  }

  streamFormant(s, ratio) {
    const p = this.p;
    if (s === 0) return 1;
    const fixed = this.vFormant[s - 1];
    if (fixed > 0) return fixed;
    return p.formantFollow > 0 ? Math.pow(ratio, p.formantFollow) : 1;
  }

  deposit(s, now) {
    let mark = this.nextMark[s];
    let ratio = this.streamRatio(s, mark - this.delay[s]);
    let f = clamp(this.streamFormant(s, ratio), 0.5, 2.5);
    const hOutEst = Math.min(Math.max(this.period / f, (0.7 * this.period) / ratio), this.hMax[s]);
    const k = this.findEpoch(mark - this.delay[s], now, hOutEst * f);
    if (k < 0) {
      this.nextMark[s] = mark + Math.max(8, this.period / ratio);
      return;
    }
    const e = this.epochPos[k];
    ratio = this.streamRatio(s, e);
    f = clamp(this.streamFormant(s, ratio), 0.5, 2.5);
    // With no shift to apply, lock the mark onto the epoch: the output is
    // then the input delayed by exactly D, in phase with the dry path the
    // consonants use. (While shifting, marks must drift against epochs -
    // that drift IS the pitch change - so the lock only engages at 1:1.)
    if (Math.abs(ratio - 1) < 0.0006 && s === 0) mark = e + this.delay[s];
    const per = this.epochPer[k];
    const hop = Math.max(8, per / ratio);
    this.nextMark[s] = mark + hop;
    let hOut = Math.max(per / f, 0.7 * hop);
    hOut = Math.min(hOut, this.hMax[s]);
    let hIn = hOut * f;
    if (e + hIn > now) {
      hIn = now - e;
      hOut = hIn / f;
    }
    if (hOut < 4) return;
    const gain = hop / hOut;
    const delaySamples = s === 0 ? 0 : (this.vDelay[s - 1] * this.sr) / 1000;
    const center = mark + delaySamples;
    const buf = this.ola[s];
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
      buf[j & OLA_MASK] += (a + (b - a) * frac) * w * gain;
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
        let guard = 0;
        while (this.nextMark[s] - this.hMax[s] <= n && guard++ < 8) this.deposit(s, n);
      }

      // voicing crossfades
      const vTarget = this.voiced ? 1 : 0;
      this.voicedGain += (vTarget - this.voicedGain) * gateA;
      this.voiceGate += (vTarget - this.voiceGate) * gateA;

      // lead: tuned grains while voiced, the exactly-aligned dry signal otherwise
      const leadBuf = this.ola[0];
      const idx = n & OLA_MASK;
      const tuned = leadBuf[idx];
      leadBuf[idx] = 0;
      const dry = n - leadDelay >= 0 ? this.ring[(n - leadDelay) & RING_MASK] : 0;
      const lead = (dry + (tuned - dry) * this.voicedGain) * p.leadGain;

      let L = lead * center;
      let R = lead * center;
      for (let s = 1; s < STREAMS; s++) {
        if (!this.streamOn[s]) continue;
        const buf = this.ola[s];
        const y = buf[idx] * this.voiceGate;
        buf[idx] = 0;
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
      if (!(L === L) || !(R === R) || L > 50 || L < -50 || R > 50 || R < -50) {
        // never let a numeric fault reach the speakers
        L = 0;
        R = 0;
        this.resetFilters();
      }
      outL[i] = L;
      if (outR) outR[i] = R;
    }
    return true;
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
