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
 *    gate, voicing hysteresis, a centred median of three (one analysis of
 *    lookahead), and octave-jump
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
 *    marks one LOCAL input period / ratio apart and, for each mark m, takes
 *    the input grain whose epoch is nearest to m - D (so with no correction
 *    the output IS the input, delayed by D). Grains are Hann-windowed, one
 *    input period per side, optionally resampled to move the formants
 *    (Chip, Gorgon, the "Original" algorithm's harmony voices), and the
 *    overlap-add is divided by the sum of the windows (constant level).
 *  - Because D is constant, the dry input delayed by D lines up sample-exact
 *    with the tuned voice: unvoiced sounds (s, sh, t, breaths) crossfade to
 *    that clean dry signal instead of going through the grain machinery.
 *  - D = 26 ms + 2 analysis hops (37.6 ms at 44.1 kHz) for the lead, 14 ms
 *    with "Low-Latency" - grains can be up to D/2 per side, so a voice down
 *    to ~53 Hz (14 ms: ~143 Hz) keeps full grains; lower ones get shorter
 *    grains (the documented Low-Latency trade-off). The two hops pay for a
 *    one-analysis lookahead in the pitch decision (configureLatency).
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
// Nothing playing on the track (exact digital silence at the input) for this
// long: everything inside has rung out (lead D + grains + voice delays +
// chorus < 0.15 s), so the node sleeps - zeros out, no analysis, no
// synthesis - until sound comes back. A phone runs out of audio-thread time
// with a few tuned tracks; a track is silent most of the song when parts
// alternate between tracks.
const SLEEP_AFTER_SEC = 0.4;
const MAX_VOICES = 4;
const STREAMS = MAX_VOICES + 1; // stream 0 = lead
const VOC_BANDS = 16;
const WIN_SIZE = 2048;
// Grains are read at fractional input positions. Linear interpolation there is
// a low-pass whose depth changes with every grain's fraction: on a real vocal
// it took 1.3-2.2 dB off 5-16 kHz and made the top end flutter grain to grain.
// A 16-tap Lanczos (a = 8) fractional-delay kernel is flat to ~17 kHz.
const FD_HALF = 8;
const FD_TAPS = 2 * FD_HALF;
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

/** Sub-sample lag of the YIN dip at integer lag `tau` (parabola through
 * d[tau-1..tau+1]), only around a real minimum and by at most half a lag.
 * The subharmonic guard can pick a lag that is NOT a local minimum; the
 * unguarded formula then divided by ~0 - on a real 82 s vocal it returned a
 * lag of -38 (-1.15 Hz) at 72.03 s, a NaN pitch got into the smoothed period
 * and the tuner stayed broken for the rest of the song. */
function refineLag(d, tau) {
  const s0 = d[tau - 1];
  const s1 = d[tau];
  const s2 = d[tau + 1];
  const curv = s0 - 2 * s1 + s2;
  if (!(curv > 1e-9)) return tau;
  return tau + clamp((s0 - s2) / (2 * curv), -0.5, 0.5);
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
  // Hard Tune: output pitch locked to the note (see deposit) and note
  // switching with a narrow tolerance (see decide).
  ["hard", 0, 0, 1],
  // Pitch shifter (the Fx chain's "pitchShift" uses this node with no tuning):
  // a fixed shift of the lead in semitones, the lead's formant factor (1 =
  // the voice keeps its own timbre) and the shifted/dry balance.
  ["shift", 0, -24, 24],
  ["leadFormant", 1, 0.5, 2],
  ["shiftMix", 1, 0, 1],
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
// The voices' parameter names, built once: building them per block made
// new strings on the audio thread ~28 times every 3 ms.
const voiceParam = (field) => Array.from({ length: MAX_VOICES }, (_, v) => `v${v}${field}`);
const V_ACTIVE = voiceParam("Active");
const V_INTERVAL = voiceParam("Interval");
const V_DIATONIC = voiceParam("Diatonic");
const V_GAIN = voiceParam("Gain");
const V_PAN = voiceParam("Pan");
const V_FORMANT = voiceParam("Formant");
const V_DETUNE = voiceParam("Detune");
const V_DELAY = voiceParam("Delay");

class AutoPitchProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return PARAMS.map(([name, defaultValue, minValue, maxValue]) => ({ name, defaultValue, minValue, maxValue, automationRate: "k-rate" }));
  }

  constructor() {
    super();
    const sr = sampleRate;
    this.sr = sr;
    this.p = {};
    this.silentSamples = 0;
    this.asleep = false;

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
    this.det = { hz: 0, confidence: 0, rms: 0 }; // see detection()
    this.semisOut = 0; // see streamSemis()
    this.extraOut = 0;
    this.untilHop = HOP;
    // correction at the centre of the last two analysis frames, so each grain
    // gets the correction for ITS input instant (interpolated), not the
    // newest frame's (which lags a vibrato by ~15 ms)
    this.histT0 = 0;
    this.histC0 = 0;
    this.histT1 = 0;
    this.histC1 = 0;
    // detected pitch and "how much of a pitch deviation the correction follows"
    // at the same two frame centres (see deposit: local period following)
    this.histD0 = 0;
    this.histD1 = 0;
    // pitch the lead should sing (detected + correction), 0 = none (Hard Tune)
    this.histO0 = 0;
    this.histO1 = 0;
    this.histG0 = 0;
    this.histG1 = 0;
    this.followGain = 0;

    // detection state
    this.voiced = false;
    this.voicedAt = 0; // input sample where the current voiced stretch began
    this.voicedHops = 0;
    this.unvoicedHops = 10;
    this.detMidi = null; // accepted detected pitch (MIDI, float)
    this.prev1 = null;
    this.prev2 = null;
    this.suspect = null;
    this.suspectHops = 0;
    this.holdHops = 0;
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
    this.epochVoiced = new Uint8Array(512); // tracked on a real waveform (not the unvoiced grid)
    this.epochCount = 0;
    this.lastEpoch = 0;
    this.epochLocked = false;
    this.alignScores = new Float64Array(2048);
    // per stream: marks already put in phase with the input for this voiced
    // stretch (see deposit)
    this.aligned = new Uint8Array(STREAMS);
    this.fdTaps = new Float64Array(FD_TAPS);

    // synthesis streams
    this.ola = [];
    this.nextMark = new Float64Array(STREAMS);
    this.streamOn = new Uint8Array(STREAMS);
    this.olaW = []; // per stream: sum of the grain windows written to each slot
    for (let s = 0; s < STREAMS; s++) {
      this.ola.push(new Float32Array(OLA));
      this.olaW.push(new Float32Array(OLA));
    }
    // the last 3 detector readings, for the one-analysis lookahead (analyze)
    this.lookHz = new Float64Array(3);
    this.lookConf = new Float64Array(3);
    this.lookRms = new Float64Array(3);
    this.lookAt = new Float64Array(3);
    this.lookLog = new Float64Array(3);
    this.lookCount = 0;
    this.lookAhead = 1;
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
    // Loudness compensation of the colour stage (drive, filters, compressor):
    // slow mean squares of the signal going in and coming out, and the gain
    // that makes them match - so a squashed or band-limited preset is as loud
    // as the voice whatever level it was recorded at (a fixed makeup only fits
    // one input level: a hot phone take came out 5-9 dB quieter).
    this.colPre = 0;
    this.colPost = 0;
    this.colGain = 1;
    this.colA = 1 - Math.exp(-1 / (0.4 * sr));
    this.colGainA = 1 - Math.exp(-1 / (0.25 * sr));
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
    // Pitch telemetry for the panel's live view (only while it is open, for
    // the track it shows): every ~17 ms the detected pitch, the note it is
    // pulled to and the pitch that comes out.
    this.telemetry = false;
    this.telemetryBlocks = 0;
    this.port.onmessage = (e) => {
      if (e.data && e.data.type === "telemetry") this.telemetry = !!e.data.on;
    };
  }

  configureLatency(lowLatency) {
    this.lowLatency = lowLatency;
    const sr = this.sr;
    this.delay = new Float64Array(STREAMS);
    this.hMax = new Float64Array(STREAMS);
    // D = 26 ms + 2 analysis hops (37.6 ms at 44.1 kHz): one hop pays for the
    // one-analysis lookahead (see analyze), the other is synthesis margin - a
    // grain for output instant t is read around input t - D/2, and with the
    // lookahead's later decisions and no extra margin it ran ~8 ms past the
    // newest decided frame (worse attacks than without lookahead). Measured
    // with both hops (VozAudio_3, 6 runs with the input shifted 0-300
    // samples, Classic): output frames with no readable pitch in the first
    // 50 ms of notes 14.9 % -> 9.6 %. Low-Latency keeps its 14 ms and decides
    // without lookahead (its trade-off; not re-measured).
    this.lookAhead = lowLatency ? 0 : 1;
    this.lookCount = 0;
    const leadD = lowLatency ? Math.round(sr * 0.014) : Math.round(sr * 0.026) + 2 * HOP;
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
    // too quiet to be voiced (decide/analyze reject it on rms alone): skip the
    // difference function, the costliest part of the whole node
    if (rms < GATE_RMS) return this.detection(0, 0, rms);
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
    // The opposite error, typical of earbud and phone mics: they cut the
    // lows, the fundamental arrives 9-14 dB under the 2nd harmonic, and the
    // half (or third) of the real period already dips under the threshold.
    // When three or two times the lag repeats clearly better, that longer
    // lag is the period. (A voice that really is at the shorter lag repeats
    // as well or worse at its multiples - cycle-to-cycle variation adds up.)
    // Twice the lag needs a much clearer win than three times: a creaky,
    // period-doubled stretch also repeats better at twice its period, and
    // reading it an octave low is worse than an octave high (the corrected
    // note is the same either way, but the grains then hold two glottal
    // pulses). Three times is never that: a third-harmonic reading is a
    // fifth off - the tuner pulls toward the wrong note.
    // Frame by frame on a real earbud take, against frames where CREPE and
    // Praat agree: right period 86.0 -> 96.3 %; 7 of 4756 frames read an
    // octave low that weren't.
    {
      const base = d[tauEstimate];
      const best = (k) => {
        const c = Math.round(tauEstimate * k);
        let bt = -1;
        if (c + k > maxTau) return bt;
        for (let t = c - k; t <= c + k; t++) if (bt < 0 || d[t] < d[bt]) bt = t;
        return bt;
      };
      const t3 = best(3);
      const t2 = best(2);
      const d2 = t2 > 0 ? d[t2] : Infinity;
      if (t3 > 0 && d[t3] < base - 0.03 && d[t3] < 0.75 * base && d[t3] <= d2 + 0.02) tauEstimate = t3;
      else if (t2 > 0 && d2 < base - 0.1 && d2 < 0.3 * base) tauEstimate = t2;
    }
    const confidence = clamp(1 - d[tauEstimate], 0, 1);
    const better = tauEstimate > minTau && tauEstimate < maxTau ? refineLag(d, tauEstimate) : tauEstimate;
    return this.detection(sr / better, confidence, rms);
  }

  /** One reading, in an object reused every hop (read at once by
   * analyze/decide, never kept): no allocation on the audio thread. */
  detection(hz, confidence, rms) {
    const d = this.det;
    d.hz = hz;
    d.confidence = confidence;
    d.rms = rms;
    return d;
  }

  analyze() {
    // One analysis of lookahead: the reading of the frame one hop back is
    // decided on the median of it and its two neighbours (the lower one when
    // only two are usable), so a one-frame misreading - the 2nd/3rd harmonic
    // for a frame, common at note starts - doesn't reach the tuner and its
    // grains. Measured on the real vocal (6 runs, input shifted 0-300
    // samples): detector wrong vs Praat+Harvest 11.0 % -> 8.2 % of frames,
    // harmonic misreadings 260 -> 144 frames, output distance to the note
    // 9.8 -> 9.2 cents.
    const m = this.yin();
    const H = this.lookHz;
    const C = this.lookConf;
    const R = this.lookRms;
    const A = this.lookAt;
    H[0] = H[1];
    H[1] = H[2];
    H[2] = m.hz;
    C[0] = C[1];
    C[1] = C[2];
    C[2] = m.confidence;
    R[0] = R[1];
    R[1] = R[2];
    R[2] = m.rms;
    A[0] = A[1];
    A[1] = A[2];
    A[2] = this.n;
    this.lookCount++;
    if (this.lookAhead === 0) {
      this.decide(m, this.n);
      return;
    }
    if (this.lookCount < 2) return;
    const L = this.lookLog;
    let count = 0;
    for (let i = this.lookCount >= 3 ? 0 : 1; i < 3; i++) {
      if (R[i] >= GATE_RMS && C[i] >= MIN_CONFIDENCE && H[i] > 0 && H[i] < Infinity) {
        // insertion into the sorted list of usable log-pitches
        const v = Math.log(H[i]);
        let j = count++;
        while (j > 0 && L[j - 1] > v) {
          L[j] = L[j - 1];
          j--;
        }
        L[j] = v;
      }
    }
    let hz = H[1];
    if (count >= 2 && hz > 0) hz = Math.exp(L[(count - 1) >> 1]);
    this.decide(this.detection(hz, C[1], R[1]), A[1]);
  }

  /** Voicing, pitch and correction for the analysis frame read at input
   * sample `at` (one hop behind the newest analysis, see analyze). */
  decide(det, at) {
    const p = this.p;
    const ref = p.referenceHz;
    const dt = HOP / this.sr;
    const goodFrame = det.rms >= GATE_RMS && det.confidence >= MIN_CONFIDENCE && det.hz > 0 && det.hz < Infinity;

    // voicing with hysteresis: on after 1 good frame, off after 2 bad ones
    if (goodFrame) {
      this.voicedHops++;
      this.unvoicedHops = 0;
    } else {
      this.unvoicedHops++;
      this.voicedHops = 0;
    }
    const wasVoiced = this.voiced;
    if (!this.voiced && this.voicedHops >= 1) {
      this.voiced = true;
      this.voicedAt = at;
    }
    if (this.voiced && this.unvoicedHops >= 2) this.voiced = false;

    if (goodFrame) {
      let raw = hzToMidi(det.hz, ref);
      let jumped = false;
      // octave-jump confirmation: a jump of more than 7 semitones must repeat
      if (this.detMidi !== null && wasVoiced && Math.abs(raw - this.detMidi) > 7) {
        if (this.pendingJump !== null && Math.abs(raw - this.pendingJump) < 1) {
          this.pendingJump = null;
          jumped = true;
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
      // Each reading is compared with the one before it (not with the first
      // suspect), and a hold never lasts more than 4 hops (~23 ms): a glide
      // moves ~0.5 st per hop, never "agreed" with its first reading, and kept
      // a stale pitch for 75 ms on a real vocal (the voice sat on a wrong note).
      // A jump the confirmation above has just accepted skips this hold: the
      // two used to take turns - the hold sent the reading back to the old
      // pitch, the confirmation then saw a "new" jump and started over - and
      // a pitch read an octave (or an octave and a fifth) too high at the
      // start of a phrase stayed there for up to 0.9 s on a real earbud
      // take (12-23 % of its voiced frames), tuning toward the wrong note.
      let m = raw;
      const steady = this.prev1 !== null && this.prev2 !== null && Math.abs(this.prev1 - this.prev2) < 0.25;
      if (jumped) {
        this.suspect = null;
        this.suspectHops = 0;
        this.holdHops = 0;
        this.prev1 = raw;
      } else if (steady && Math.abs(raw - this.prev1) > 0.5 && this.suspectHops < 3 && this.holdHops < 4) {
        if (this.suspect !== null && Math.abs(raw - this.suspect) < 0.5) this.suspectHops++;
        else this.suspectHops = 1;
        this.suspect = raw;
        this.holdHops++;
        if (this.suspectHops >= 3) {
          this.suspect = null; // it persisted: a real change
        } else {
          m = this.prev1;
        }
      } else {
        this.suspect = null;
        this.suspectHops = 0;
        this.holdHops = 0;
      }
      this.prev2 = this.prev1;
      this.prev1 = m;
      this.detMidi = m;
      if (this.avgA === null) {
        this.avgA = m;
        this.avgMidi = m;
      } else if (Math.abs(m - this.avgMidi) > 1) {
        // a real jump (new note, end of a held-back run): restart the average
        // there instead of letting it crawl across the gap for ~100 ms
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
      this.followGain = 0;
      this.pushHistory(at);
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
      // The average only CONFIRMS the note the voice is nearest to now; it
      // never proposes a different one. It lags a fast move, and when it was
      // allowed to pick its own note the target alternated every 5.8 ms
      // between the note being sung and the one the lagging average was
      // passing (2-6 semitones apart): 37 note changes a second on a real
      // vocal, heard as a broken, robotic voice.
      const avgNearest = nearestNote(this.avgMidi, key, pcs);
      const rawMargin = Math.abs(d - this.targetNote) - Math.abs(d - nearest);
      const avgMargin = Math.abs(this.avgMidi - this.targetNote) - Math.abs(this.avgMidi - avgNearest);
      let next = null;
      if (p.hard >= 0.5) {
        // Hard Tune: the note flips as soon as the voice is 0.1 st past the
        // midpoint, so a slide comes out as a staircase of scale notes (the
        // effect people hear as "autotune"). A note is held at least 30 ms,
        // so a vibrato riding the midpoint can't chatter between two notes.
        if (nearest !== this.targetNote && rawMargin > 0.2 && this.heldSec >= 0.03) next = nearest;
      } else if (nearest !== this.targetNote && rawMargin > 0.5) next = nearest;
      else if (nearest !== this.targetNote && avgNearest === nearest && avgMargin > 0.1) next = nearest;
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
    // An instant correction (hard tune) follows every deviation of the voice
    // from the note, so it can be refined per grain from the local period
    // (deposit). A slow one (Retune speed, Humanize) or Flex-Tune must not.
    this.followGain = tauSec <= 0.0005 && !(p.flex > 0) ? p.amount : 0;
    this.correction += (wanted - this.correction) * alpha;
    if (this.transitioning && Math.abs(wanted - this.correction) < 0.05) this.transitioning = false;
    this.heldSec += dt;
    this.outMidi = d + this.correction;
    this.pushHistory(at);

    // per-voice drift: two copies of a voice must not move identically
    for (let v = 0; v < MAX_VOICES; v++) {
      const step = (Math.random() * 2 - 1) * 0.25;
      this.voiceDrift[v] = clamp(this.voiceDrift[v] * 0.97 + step * 0.1, -1, 1);
    }
  }

  pushHistory(at) {
    // centre of the frame just decided, in input samples
    const center = at - (this.frameLen * DECIM) / 2;
    this.histT0 = this.histT1;
    this.histC0 = this.histC1;
    this.histT1 = center;
    this.histC1 = this.correction;
    this.histD0 = this.histD1;
    this.histG0 = this.histG1;
    this.histD1 = this.detMidi === null ? 0 : this.detMidi;
    this.histO0 = this.histO1;
    this.histO1 = this.voiced && this.targetNote !== null && this.detMidi !== null ? this.detMidi + this.correction : 0;
    this.histG1 = this.followGain;
  }

  /** Detected pitch (MIDI) at input instant `t`, interpolated between the
   * last two frame centres. */
  detectedAt(t) {
    const span = this.histT1 - this.histT0;
    if (span <= 0) return this.histD1;
    const a = clamp((t - this.histT0) / span, 0, 1);
    return this.histD0 + (this.histD1 - this.histD0) * a;
  }

  /** Pitch the lead should sing at input instant `t` (MIDI), interpolated
   * between the last two frames and never extrapolated; 0 when there is no
   * note. With an instant correction it is the note itself. */
  wantedAt(t) {
    if (this.histO0 <= 0 || this.histO1 <= 0) return 0;
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
      const interval = Math.round(p[V_INTERVAL[v]]);
      if (p[V_DIATONIC[v]] >= 0.5) {
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
      this.epochVoiced[k] = this.voiced ? 1 : 0;
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
    // And it is gentle: every sample it moves an epoch is a sample of period
    // error, and Hard Tune places the grains on a perfectly even grid, so the
    // error comes out as pitch. At 0.2 per period, a vowel whose energy peak
    // jumped 18 samples (real take, 81.04 s) pulled the epochs 3-4 samples a
    // cycle and the hard-tuned note sat 29 cents flat for ~50 ms. Measured
    // on two real earbud takes, steady hard-tuned notes within 10 cents of
    // the target: 84 / 90 % -> 99 / 99.7 % (Classic 75 / 82 % -> 85 / 90 %).
    const peak = this.energyPeak(aligned, Math.max(3, P / 8), P);
    const dev = peak - aligned;
    const dead = P / 24;
    if (dev > dead) return aligned + 0.04 * (dev - dead);
    if (dev < -dead) return aligned + 0.04 * (dev + dead);
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
      if (e + grainHalfWidth(per, ratio, f, hMax) * f + FD_HALF + 1 > now) continue; // + interpolation taps
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
    // results in fields, not a new object per grain (audio thread)
    if (s === 0) {
      this.semisOut = c + p.shift;
      this.extraOut = p.shift;
      return;
    }
    const v = s - 1;
    const vib = p.vibCents > 0 ? (p.vibCents / 100) * Math.sin(this.vibPhase) : 0;
    const extra = this.voiceOffset[v] + this.vDetune[v] / 100 + this.voiceDrift[v] * 0.06 + vib;
    this.semisOut = c + extra;
    this.extraOut = extra;
  }

  streamRatio(s, t) {
    this.streamSemis(s, t);
    const semis = this.semisOut;
    return s === 0 ? clamp(Math.pow(2, semis / 12), 0.5, 2) : clamp(Math.pow(2, semis / 12), 0.25, 4);
  }

  streamFormant(s, ratio) {
    const p = this.p;
    if (s === 0) return p.leadFormant;
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
    const per = this.epochPer[k];
    // At the start of each voiced stretch the lead's marks are put in phase
    // with the input (mark = epoch + D), so the tuned voice takes over from
    // the dry signal without a jump - on the first epoch tracked on the real
    // waveform (the unvoiced grid before it is not the voice's), and again
    // during the first 100 ms if there is nothing to correct, while the
    // detector settles (an onset octave error tracks epochs at the wrong rate
    // for a few periods). Otherwise a mark is never moved: snapping it
    // mid-note (the old 1:1 lock, whenever the correction passed through zero
    // - constantly, with hard tune) shifted the output by up to half a period
    // in one go - a glitch every time the singer crossed the note's centre.
    // (Only when the epoch is the one expected here: a stale fallback epoch
    // would drag the mark into the past.)
    if (!this.voiced) this.aligned[s] = 0;
    else if (s === 0 && this.epochVoiced[k] && Math.abs(e - (mark - this.delay[s])) < 0.5 * per) {
      const settling = this.n - this.voicedAt < 0.1 * this.sr && Math.abs(ratio - 1) < 0.0006;
      if (!this.aligned[s] || settling) {
        mark = e + this.delay[s];
        this.aligned[s] = 1;
      }
    }
    // TD-PSOLA spacing: the next mark is one LOCAL input period (this epoch to
    // the next one) divided by the ratio. With nothing to correct the marks
    // then walk the input's epochs one by one and the output is the input
    // itself; with a shift they drift against the epochs exactly as fast as
    // the pitch change asks. The output keeps the voice's own cycle-to-cycle
    // variation, as BandLab's does (~1 % on a real vocal). The old spacing
    // (one period of the TARGET pitch, and before that the period BEFORE the
    // epoch) did not follow the input: even with zero correction the marks
    // slid against the epochs, repeating or dropping a period every ~25
    // cycles and overlapping neighbouring grains out of phase - measured on a
    // real vocal: 2 % repeated + 2.3 % skipped periods, grain misalignment
    // > 18 samples in 10 % of grains, spectral distance 6-8 dB, at ZERO shift.
    let after = per;
    // (bounded by the detector's period, not by the spacing before this epoch:
    // at an onset that one runs from the unvoiced grid to the first real
    // epoch and is meaningless)
    if (k !== ((this.epochCount - 1) & 511)) after = clamp(this.epochPos[(k + 1) & 511] - e, 0.5 * this.period, 2 * this.period);
    // Local period following (hard tune): the correction was computed from a
    // ~30 ms YIN frame centred ~15 ms away from this grain, so a vibrato or a
    // slide had moved on - the tuned note wobbled by what the frame missed
    // (steady notes: median 6.7, p90 32 cents off on a real vocal; BandLab's
    // Classic is much flatter). The epochs around THIS grain give the period
    // right here: shift by the difference, scaled by how much the correction
    // follows deviations (all of it at speed 0, none for a slow retune).
    let r = ratio;
    const g = Math.min(this.histG0, this.histG1);
    if (g > 0 && this.epochCount > 4 && this.epochVoiced[k] && this.epochVoiced[(k - 3) & 511]) {
      const latest = (this.epochCount - 1) & 511;
      const pref = k !== latest ? (this.epochPos[(k + 1) & 511] - this.epochPos[(k - 2) & 511]) / 3 : (e - this.epochPos[(k - 3) & 511]) / 3;
      if (pref > 0.8 * this.period && pref < 1.25 * this.period) {
        const diff = this.detectedAt(mark - this.delay[s]) - hzToMidi(this.sr / pref, this.p.referenceHz);
        if (Math.abs(diff) < 0.5) r = ratio * Math.pow(2, (g * diff) / 12);
      }
    }
    let hop = Math.max(8, after / r);
    // Hard Tune: one period of the pitch the stream should sing (detected +
    // correction + interval), not the input's local period - the voice's own
    // cycle-to-cycle wobble, drift and vibrato are gone and the note is
    // dead flat. That perfectly steady pitch is the hard-tune sound; the
    // normal path keeps the wobble on purpose (a natural tuned voice).
    let hardHop = false;
    const lead = this.p.hard >= 0.5 && this.voiced ? this.wantedAt(mark - this.delay[s]) : 0;
    if (lead > 0) {
      let extra = 0;
      if (s !== 0) {
        this.streamSemis(s, mark - this.delay[s]);
        extra = this.extraOut;
      }
      const want = lead + extra;
      const outPer = this.sr / midiToHz(want, this.p.referenceHz);
      if (outPer > 0.4 * after && outPer < 2.5 * after) {
        hop = Math.max(8, outPer);
        hardHop = true;
      }
    }
    // Nothing to correct (within a cent - the detector's own noise): steer the
    // marks back onto the epochs, so an in-tune voice comes out as the input
    // delayed by exactly D - in phase with the dry path it hands over to at
    // consonants - instead of drifting away from it. At most 2 % of a period
    // per cycle (a voice's own cycle-to-cycle jitter is ~1.5 %): after a
    // detector jump (a creaky, period-doubled stretch) the marks can be a
    // third of a period off, and half a sample per cycle took ~0.5 s to
    // catch up. Real takes with correction 0, output vs input: 10.8 ->
    // 18.0 dB (null test, whole file).
    if (s === 0 && !hardHop && Math.abs(r - 1) < 0.0006) {
      const most = Math.max(0.5, 0.02 * per);
      hop += clamp(0.25 * (e - (mark - this.delay[s])), -most, most);
    }
    this.nextMark[s] = mark + hop;
    // Shifting the lead down (pitch shifter): grains of one input period each
    // side, as in classic TD-PSOLA - the 0.7-hop minimum overlap pulls the
    // neighbouring glottal pulses into each grain when the output hop is
    // much longer than the input period (an octave down: two periods), and
    // the voice kept sounding at its original pitch.
    const hOut =
      s === 0 && this.p.shift !== 0 && ratio < 1 ? Math.min(Math.max(per / f, Math.min(0.7 * Math.max(8, per / ratio), 1.15 * (per / f))), this.hMax[s]) : grainHalfWidth(per, ratio, f, this.hMax[s]);
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
    const ring = this.ring;
    if (f === 1) {
      // Unresampled grain (the lead, most voices): ONE fractional offset for
      // the whole grain - build its windowed-sinc kernel once.
      const pos0 = e + (j0 - center);
      const base = Math.floor(pos0);
      const frac = pos0 - base;
      const h = this.fdTaps;
      let sum = 0;
      for (let k = 0; k < FD_TAPS; k++) {
        const t = k - FD_HALF + 1 - frac;
        const v = t === 0 ? 1 : Math.abs(t) >= FD_HALF ? 0 : (FD_HALF * Math.sin(Math.PI * t) * Math.sin((Math.PI * t) / FD_HALF)) / (Math.PI * Math.PI * t * t);
        h[k] = v;
        sum += v;
      }
      for (let k = 0; k < FD_TAPS; k++) h[k] /= sum;
      for (let j = j0; j <= j1; j++) {
        const x = j - center;
        const wi = (x < 0 ? -x : x) * winScale;
        const w0 = wi | 0;
        const w = HANN[w0] + (HANN[w0 + 1] - HANN[w0]) * (wi - w0);
        const i0 = base + (j - j0) - FD_HALF + 1;
        let y = 0;
        for (let k = 0; k < FD_TAPS; k++) y += ring[(i0 + k) & RING_MASK] * h[k];
        buf[j & OLA_MASK] += y * w;
        wbuf[j & OLA_MASK] += w;
      }
    } else {
      // Resampled grain (formant shift): the fraction moves sample by sample -
      // 4-point cubic (Catmull-Rom), far flatter than linear.
      for (let j = j0; j <= j1; j++) {
        const x = j - center;
        const wi = (x < 0 ? -x : x) * winScale;
        const w0 = wi | 0;
        const w = HANN[w0] + (HANN[w0 + 1] - HANN[w0]) * (wi - w0);
        const pos = e + x * f;
        const i0 = Math.floor(pos);
        const t = pos - i0;
        const a = ring[(i0 - 1) & RING_MASK];
        const b = ring[i0 & RING_MASK];
        const c = ring[(i0 + 1) & RING_MASK];
        const d = ring[(i0 + 2) & RING_MASK];
        buf[j & OLA_MASK] += (b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)))) * w;
        wbuf[j & OLA_MASK] += w;
      }
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
    let silent = true;
    if (input) {
      for (let i = 0; i < input.length; i++) {
        if (input[i] !== 0) {
          silent = false;
          break;
        }
      }
    }
    if (silent) {
      this.silentSamples += blockLen;
      if (this.silentSamples >= SLEEP_AFTER_SEC * this.sr) {
        if (!this.asleep) this.asleep = true;
        outL.fill(0);
        if (outR) outR.fill(0);
        return true;
      }
    } else {
      this.silentSamples = 0;
      if (this.asleep) {
        // waking: start clean, like a new phrase (the ring holds the
        // silence that came before, so the delayed dry path is silent too)
        this.asleep = false;
        this.hardReset();
      }
    }
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
      const on = p[V_ACTIVE[s - 1]] >= 0.5 && p[V_GAIN[s - 1]] > 0.0001 ? 1 : 0;
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
      this.vDetune[v] = p[V_DETUNE[v]];
      this.vFormant[v] = p[V_FORMANT[v]];
      this.vDelay[v] = p[V_DELAY[v]];
      const a = ((clamp(p[V_PAN[v]], -1, 1) + 1) * Math.PI) / 4;
      panL[v] = Math.cos(a) * p[V_GAIN[v]];
      panR[v] = Math.sin(a) * p[V_GAIN[v]];
    }
    const center = Math.SQRT1_2;
    // Panning inside the node is equal-power (a centred voice gets 0.707 per
    // side); the track without AutoPitch plays the same mono/dual-mono clip at
    // 1.0 per side. Lift the whole output by sqrt(2) so switching AutoPitch on
    // keeps the level (it used to drop 3 dB) and the preset balances stay.
    const outGain = p.outGain * Math.SQRT2;
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
    const useColour = useDrive || useHp || useLp || useComp;
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

      // (epochs follow the decided pitch, so they run the same hop behind)
      this.trackEpochs(n - this.lookAhead * HOP);
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
      // (a pitch shift never fills thin coverage with the dry voice: between
      // the pulses of a voice shifted down, silence IS the waveform)
      const cover = wsum >= 0.5 || p.shift !== 0 ? 1 : wsum * 2;
      leadBuf[idx] = 0;
      leadW[idx] = 0;
      const dry = n - leadDelay >= 0 ? this.ring[(n - leadDelay) & RING_MASK] : 0;
      const wet = dry + (tuned - dry) * this.voicedGain * cover;
      const lead = (p.shiftMix >= 1 ? wet : dry + (wet - dry) * p.shiftMix) * p.leadGain;

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

      const preMs = (L * L + R * R) * 0.5;

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
        const g = Math.pow(10, -gr / 20);
        L *= g;
        R *= g;
      }

      if (useColour) {
        // only while there is signal: silence must not wind the gain up
        if (preMs > 1e-7) {
          this.colPre += (preMs - this.colPre) * this.colA;
          this.colPost += ((L * L + R * R) * 0.5 - this.colPost) * this.colA;
          if (this.colPre > 1e-6) {
            const want = Math.sqrt(this.colPre / (this.colPost + 1e-12));
            const target = want < 0.25 ? 0.25 : want > 8 ? 8 : want;
            this.colGain += (target - this.colGain) * this.colGainA;
          }
        }
        L *= this.colGain;
        R *= this.colGain;
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

      L *= outGain;
      R *= outGain;
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
    if (this.telemetry && ++this.telemetryBlocks >= 6) {
      this.telemetryBlocks = 0;
      this.port.postMessage({ d: this.detMidi, t: this.targetNote, o: this.outMidi, v: this.voiced ? 1 : 0 });
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
    this.colPre = this.colPost = 0;
    this.colGain = 1;
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
  globalThis.__autopitchExports.helpers = { nearestNote, diatonicShift, allowedPcs, harmonyPcs, refineLag, VOICE_FIELDS };
}
