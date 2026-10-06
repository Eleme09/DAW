/**
 * Tempo and key of a beat (an instrumental: drums, 808, chords, melody) -
 * what the first imported beat sets the whole project to.
 *
 * Pure math (no AudioContext): runs in the clip worker and in Node tests.
 *
 * Tempo: spectral-flux onset strength (log-compressed magnitudes, so a soft
 * hi-hat counts next to an 808), its autocorrelation scored over the beat
 * and its multiples (a comb), a mild prior for the 70-180 BPM range, then a
 * fine search (0.01 BPM) that lines a pulse train up with the onsets over
 * the whole file. Producer beats sit on whole BPM almost always, so a value
 * within 0.12 of an integer is snapped to it.
 *
 * Key: a harmonic pitch-class profile (HPCP-style: spectral peaks, tuned to
 * the beat's own reference pitch, each peak also voting for the notes it
 * could be a harmonic of), with the 808/bass band weighted on its own,
 * compared against two families of key profiles - one built for
 * electronic/urban music (Faraldo's "edma") and the classic Temperley/
 * Krumhansl ones. When both agree the answer is "seguro"; when they don't,
 * the result says so and offers the other key.
 */

import { fftInPlace, hannWindow } from "../analysis/fft";

export interface BeatKey {
  /** Pitch class of the tonic, 0 = C. */
  tonic: number;
  scale: "major" | "minor";
}

export interface BeatAnalysis {
  bpm: number;
  /** 0..1 - how clearly one tempo stands out. */
  bpmConfidence: number;
  key: BeatKey;
  /** 0..1 */
  keyConfidence: number;
  /** Both key models agree. */
  keyAgreed: boolean;
  /** The other model's key when they disagree (else the runner-up). */
  keyAlternative: BeatKey;
  /** Reference pitch of A the beat is tuned to (440 = standard). */
  tuningHz: number;
}

const NOTE = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

/** "8A" style Camelot code (A = minor, B = major). */
export function camelotCode(key: BeatKey): string {
  // C major = 8B, A minor = 8A; each fifth up is +1
  const ref = key.scale === "major" ? 0 : 9;
  const fifths = (((key.tonic - ref) * 7) % 12 + 12) % 12;
  const n = ((fifths + 7) % 12) + 1;
  return `${n}${key.scale === "major" ? "B" : "A"}`;
}

export function keyName(key: BeatKey): string {
  return `${NOTE[key.tonic]} ${key.scale === "major" ? "major" : "minor"}`;
}

// ------------------------------------------------------------------ helpers

/** Mono, decimated to ~11 kHz (enough for both analyses, 4x less work). */
function prepare(samples: Float32Array, sampleRate: number): { x: Float32Array; sr: number } {
  const factor = Math.max(1, Math.floor(sampleRate / 11025));
  if (factor === 1) return { x: samples, sr: sampleRate };
  // 2-pole lowpass at ~0.4 of the new Nyquist, run twice, then pick
  const sr = sampleRate / factor;
  const fc = 0.4 * (sr / 2);
  const w = Math.tan((Math.PI * fc) / sampleRate);
  const k = 1 / (1 + Math.SQRT2 * w + w * w);
  const b0 = w * w * k;
  const a1 = 2 * (w * w - 1) * k;
  const a2 = (1 - Math.SQRT2 * w + w * w) * k;
  let y = samples;
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float32Array(y.length);
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < y.length; i++) {
      const x0 = y[i];
      const v = b0 * (x0 + 2 * x1 + x2) - a1 * y1 - a2 * y2;
      out[i] = v;
      x2 = x1;
      x1 = x0;
      y2 = y1;
      y1 = v;
    }
    y = out;
  }
  const n = Math.floor(y.length / factor);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = y[i * factor];
  return { x, sr };
}

/** Magnitude spectra of `frame`-long Hann windows every `hop` samples. */
function* spectra(x: Float32Array, frame: number, hop: number): Generator<Float32Array> {
  const win = hannWindow(frame);
  const re = new Float32Array(frame);
  const im = new Float32Array(frame);
  const mag = new Float32Array(frame / 2);
  for (let start = 0; start + frame <= x.length; start += hop) {
    for (let i = 0; i < frame; i++) {
      re[i] = x[start + i] * win[i];
      im[i] = 0;
    }
    fftInPlace(re, im);
    for (let k = 0; k < frame / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
    yield mag;
  }
}

// -------------------------------------------------------------------- tempo

function onsetStrength(x: Float32Array, sr: number): { odf: Float32Array; rate: number } {
  const frame = 1024;
  const hop = 128;
  const rate = sr / hop;
  const bins = frame / 2;
  const maxBin = Math.min(bins, Math.floor((8000 / sr) * frame));
  const prev = new Float32Array(bins);
  const values: number[] = [];
  let first = true;
  for (const mag of spectra(x, frame, hop)) {
    let flux = 0;
    for (let k = 1; k < maxBin; k++) {
      const v = Math.log1p(100 * mag[k]);
      if (!first) {
        const d = v - prev[k];
        if (d > 0) flux += d;
      }
      prev[k] = v;
    }
    first = false;
    values.push(flux);
  }
  const odf = Float32Array.from(values);
  // remove the slow trend (a local mean over ~1 s), keep what rises above it
  const half = Math.round(rate * 0.5);
  const out = new Float32Array(odf.length);
  let acc = 0;
  for (let i = 0; i < Math.min(odf.length, half); i++) acc += odf[i];
  for (let i = 0; i < odf.length; i++) {
    const add = i + half < odf.length ? odf[i + half] : 0;
    const drop = i - half - 1 >= 0 ? odf[i - half - 1] : 0;
    acc += add - drop;
    const count = Math.min(odf.length, i + half + 1) - Math.max(0, i - half);
    const v = odf[i] - acc / count;
    out[i] = v > 0 ? v : 0;
  }
  return { odf: out, rate };
}

function autocorr(x: Float32Array, maxLag: number): Float32Array {
  const n = x.length;
  const r = new Float32Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = lag; i < n; i++) s += x[i] * x[i - lag];
    r[lag] = s / (n - lag);
  }
  return r;
}

/** How well a pulse train at `bpm` (best phase) lines up with the onsets. */
function pulseScore(odf: Float32Array, rate: number, bpm: number): number {
  const period = (60 / bpm) * rate;
  const phases = Math.max(1, Math.ceil(period));
  let best = 0;
  for (let p = 0; p < phases; p += 1) {
    let s = 0;
    let n = 0;
    for (let t = p; t < odf.length - 1; t += period) {
      const i = Math.floor(t);
      const f = t - i;
      s += odf[i] * (1 - f) + odf[i + 1] * f;
      n++;
    }
    if (n > 0 && s / n > best) best = s / n;
  }
  return best;
}

export function estimateTempo(x: Float32Array, sr: number): { bpm: number; confidence: number } {
  const { odf, rate } = onsetStrength(x, sr);
  if (odf.length < rate * 4) return { bpm: 120, confidence: 0 };
  const minBpm = 55;
  const maxBpm = 215;
  const maxLag = Math.ceil((60 / minBpm) * rate * 4);
  const r = autocorr(odf, Math.min(maxLag, odf.length - 1));
  const at = (lag: number) => {
    const i = Math.floor(lag);
    if (i + 1 >= r.length) return 0;
    const f = lag - i;
    return r[i] * (1 - f) + r[i + 1] * f;
  };
  // comb score per candidate BPM (0.25 steps), with a soft prior around
  // 70-180 (log-Gaussian centred at 115)
  const scores: { bpm: number; s: number }[] = [];
  for (let bpm = minBpm; bpm <= maxBpm; bpm += 0.25) {
    const lag = (60 / bpm) * rate;
    let s = 0;
    for (let k = 1; k <= 4; k++) s += at(lag * k) / k;
    s += 0.5 * at(lag / 2);
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 115) / 0.9, 2));
    scores.push({ bpm, s: s * (0.6 + 0.4 * prior) });
  }
  scores.sort((a, b) => b.s - a.s);
  const top = scores[0];
  // consider the half/double of the winner and the next distinct peaks
  const cands = new Set<number>([top.bpm, top.bpm * 2, top.bpm / 2, top.bpm * 1.5, top.bpm / 1.5]);
  for (const c of scores.slice(1, 40)) if (Math.abs(Math.log2(c.bpm / top.bpm)) > 0.05) cands.add(c.bpm);
  let bestBpm = top.bpm;
  let bestScore = -1;
  const pulse: { bpm: number; s: number }[] = [];
  for (const c of cands) {
    if (c < 60 || c > 200) continue;
    // a full beat grid also predicts onsets on the off-beats: score both
    const s = pulseScore(odf, rate, c) + 0.5 * pulseScore(odf, rate, c * 2);
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(c / 115) / 0.9, 2));
    const v = s * (0.7 + 0.3 * prior);
    pulse.push({ bpm: c, s: v });
    if (v > bestScore) {
      bestScore = v;
      bestBpm = c;
    }
  }
  // Octave: a pulse at half (or double) the tempo fits the onsets almost as
  // well, so the choice is by convention. Beats are labelled 85-175 BPM
  // (trap 130-160, drill 140, reggaeton 90-100, boom bap 85-95): fold into
  // that range. Measured on GiantSteps: the raw pick was half-tempo on 17 of 19.
  while (bestBpm < 85) bestBpm *= 2;
  while (bestBpm >= 175) bestBpm /= 2;
  // fine search around the winner
  let fine = bestBpm;
  let fineScore = -1;
  for (let b = bestBpm - 1.5; b <= bestBpm + 1.5; b += 0.02) {
    const s = pulseScore(odf, rate, b);
    if (s > fineScore) {
      fineScore = s;
      fine = b;
    }
  }
  const nearest = Math.round(fine);
  const bpm = Math.abs(fine - nearest) <= 0.12 ? nearest : Math.round(fine * 10) / 10;
  pulse.sort((a, b) => b.s - a.s);
  const second = pulse.find((p) => Math.abs(Math.log2(p.bpm / bestBpm)) > 0.03);
  const confidence = second ? Math.max(0, Math.min(1, (pulse[0].s - second.s) / pulse[0].s / 0.25)) : 1;
  return { bpm, confidence };
}

// ---------------------------------------------------------------------- key

// Major/minor profiles, index 0 = tonic.
const PROFILES = {
  // Faraldo et al. 2016, for electronic dance music (Essentia "edma")
  edma: {
    major: [0.16519551, 0.04749026, 0.08293076, 0.06687112, 0.09994645, 0.09274123, 0.05294487, 0.13159476, 0.05218986, 0.07443653, 0.06940723, 0.0642515],
    minor: [0.17235348, 0.04, 0.0761009, 0.12102668, 0.05568245, 0.08390766, 0.04944446, 0.14402702, 0.0960458, 0.04801957, 0.07073063, 0.05128264],
  },
  // Temperley 1999 (Kostka-Payne corpus)
  temperley: {
    major: [5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0],
    minor: [5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0],
  },
  // Krumhansl-Kessler 1982
  krumhansl: {
    major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    minor: [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
  },
};

function correlation(a: ArrayLike<number>, b: ArrayLike<number>, shift: number): number {
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < 12; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= 12;
  mb /= 12;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < 12; i++) {
    const x = a[(i + shift) % 12] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

function rankKeys(chroma: ArrayLike<number>, profile: { major: number[]; minor: number[] }): { key: BeatKey; r: number }[] {
  const out: { key: BeatKey; r: number }[] = [];
  for (let t = 0; t < 12; t++) {
    out.push({ key: { tonic: t, scale: "major" }, r: correlation(chroma, profile.major, t) });
    out.push({ key: { tonic: t, scale: "minor" }, r: correlation(chroma, profile.minor, t) });
  }
  return out.sort((a, b) => b.r - a.r);
}

/** Reference A (Hz) the beat is tuned to, from where its spectral peaks
 * fall between semitones (circular mean of the deviation). */
function estimateTuning(peaks: { f: number; m: number }[]): number {
  let c = 0;
  let s = 0;
  for (const p of peaks) {
    const semis = 12 * Math.log2(p.f / 440);
    const dev = semis - Math.round(semis); // -0.5..0.5
    const a = 2 * Math.PI * dev;
    c += p.m * Math.cos(a);
    s += p.m * Math.sin(a);
  }
  const dev = Math.atan2(s, c) / (2 * Math.PI);
  return 440 * Math.pow(2, dev / 12);
}

/** Tuning knobs of the key analysis (exported for the evaluation script). */
export const KEY_OPTS = { bassPick: 0, ensemble: false, bassTonic: 0.3, method: "peaks" as "hpss" | "peaks", logGamma: 100, minBinWeight: 0.5, hpssLen: 17, power: 2, frameNorm: true, harmonics: 4, harmDecay: 0.6, bassSplit: 180, bassWeight: 0.8, minHz: 40, maxHz: 4000, whiten: false, floorDb: -40, profileA: "krumhansl" as "edma" | "temperley" | "krumhansl" };

function hpcp(x: Float32Array, sr: number): { treble: Float64Array; bass: Float64Array; tuningHz: number } {
  const frame = 8192;
  const hop = 4096;
  const df = sr / frame;
  const all: { f: number; m: number }[][] = [];
  for (const mag of spectra(x, frame, hop)) {
    const peaks: { f: number; m: number }[] = [];
    const lo = Math.ceil(KEY_OPTS.minHz / df);
    const hi = Math.min(mag.length - 2, Math.floor(KEY_OPTS.maxHz / df));
    if (KEY_OPTS.whiten) {
      // divide by a smoothed spectral envelope (~1/3 octave), so a loud low
      // end doesn't drown the chords
      const env = new Float32Array(mag.length);
      for (let k = lo; k <= hi; k++) {
        const w = Math.max(2, Math.round(k * 0.12));
        let acc = 0;
        let n = 0;
        for (let j = Math.max(1, k - w); j <= Math.min(mag.length - 1, k + w); j++) {
          acc += mag[j];
          n++;
        }
        env[k] = acc / n;
      }
      for (let k = lo; k <= hi; k++) mag[k] = mag[k] / (env[k] + 1e-9);
    }
    let max = 0;
    for (let k = lo; k <= hi; k++) if (mag[k] > max) max = mag[k];
    if (max <= 0) continue;
    if (KEY_OPTS.whiten) {
      max = 0;
      for (let k = lo; k <= hi; k++) if (mag[k] > max) max = mag[k];
    }
    const floor = max * Math.pow(10, KEY_OPTS.floorDb / 20);
    for (let k = lo; k <= hi; k++) {
      const m = mag[k];
      if (m < floor || m <= mag[k - 1] || m < mag[k + 1]) continue;
      // parabolic interpolation (log magnitude) for the true peak frequency
      const a = Math.log(mag[k - 1] + 1e-12);
      const b = Math.log(m + 1e-12);
      const c = Math.log(mag[k + 1] + 1e-12);
      const d = (0.5 * (a - c)) / (a - 2 * b + c);
      peaks.push({ f: (k + (Number.isFinite(d) ? d : 0)) * df, m });
    }
    peaks.sort((p, q) => q.m - p.m);
    all.push(peaks.slice(0, 60));
  }
  const tuningHz = estimateTuning(all.flat());
  const treble = new Float64Array(12);
  const bass = new Float64Array(12);
  for (const peaks of all) {
    const ft = new Float64Array(12);
    const fb = new Float64Array(12);
    for (const p of peaks) {
      const w2 = Math.pow(p.m, KEY_OPTS.power);
      // the peak itself and the notes it may be a harmonic of
      for (let h = 1; h <= KEY_OPTS.harmonics; h++) {
        const f = p.f / h;
        if (f < 40) break;
        const semis = 12 * Math.log2(f / tuningHz) + 9; // 0 = C
        const nearest = Math.round(semis);
        const dist = Math.abs(semis - nearest); // 0..0.5
        if (dist > 0.5) continue;
        const shape = Math.cos((Math.PI / 2) * (dist / 0.5)) ** 2;
        const pc = ((nearest % 12) + 12) % 12;
        const w = w2 * shape * Math.pow(KEY_OPTS.harmDecay, h - 1);
        if (f < KEY_OPTS.bassSplit) fb[pc] += w;
        else ft[pc] += w;
      }
    }
    // each frame normalised, so a loud drop doesn't outvote the whole song
    const nt = KEY_OPTS.frameNorm ? Math.max(...ft) : 1;
    const nb = KEY_OPTS.frameNorm ? Math.max(...fb) : 1;
    if (nt > 0) for (let i = 0; i < 12; i++) treble[i] += ft[i] / nt;
    if (nb > 0) for (let i = 0; i < 12; i++) bass[i] += fb[i] / nb;
  }
  return { treble, bass, tuningHz };
}

function quickMedian(a: Float32Array, n: number): number {
  // insertion sort is fine for the 17-value windows used here
  for (let i = 1; i < n; i++) {
    const v = a[i];
    let j = i - 1;
    while (j >= 0 && a[j] > v) {
      a[j + 1] = a[j];
      j--;
    }
    a[j + 1] = v;
  }
  return a[n >> 1];
}

/** Chroma of the harmonic part only: the drums are removed first by
 * median-filter harmonic/percussive separation (Fitzgerald 2010) - a
 * sustained note is a horizontal line in the spectrogram, a hit a vertical
 * one - so a loud hi-hat or kick no longer smears every pitch class. */
function hpssChroma(x: Float32Array, sr: number): { treble: Float64Array; bass: Float64Array; tuningHz: number } {
  const frame = 4096;
  const hop = 1024;
  const df = sr / frame;
  const lo = Math.max(1, Math.ceil(KEY_OPTS.minHz / df));
  const hi = Math.min(frame / 2 - 2, Math.floor(KEY_OPTS.maxHz / df));
  const width = hi - lo + 1;
  const frames: Float32Array[] = [];
  for (const mag of spectra(x, frame, hop)) frames.push(Float32Array.from(mag.subarray(lo, hi + 1)));
  const T = frames.length;
  const L = KEY_OPTS.hpssLen;
  const h = L >> 1;
  const win = new Float32Array(L);
  // tuning from the strongest peaks of a few frames
  const peaks: { f: number; m: number }[] = [];
  for (let t = 0; t < T; t += 4) {
    const m = frames[t];
    for (let k = 1; k < width - 1; k++) {
      if (m[k] > m[k - 1] && m[k] >= m[k + 1] && m[k] > 1e-4) {
        const a = Math.log(m[k - 1] + 1e-12);
        const b = Math.log(m[k] + 1e-12);
        const c = Math.log(m[k + 1] + 1e-12);
        const d = (0.5 * (a - c)) / (a - 2 * b + c);
        peaks.push({ f: (lo + k + (Number.isFinite(d) ? d : 0)) * df, m: m[k] });
      }
    }
  }
  peaks.sort((p, q) => q.m - p.m);
  const tuningHz = estimateTuning(peaks.slice(0, 4000));
  // bin -> (pitch class, weight) map, shared by every frame
  const pcOf = new Int8Array(width);
  const wOf = new Float32Array(width);
  const isBass = new Uint8Array(width);
  for (let k = 0; k < width; k++) {
    const f = (lo + k) * df;
    const semis = 12 * Math.log2(f / tuningHz) + 9;
    const nearest = Math.round(semis);
    const dist = Math.abs(semis - nearest);
    pcOf[k] = ((nearest % 12) + 12) % 12;
    wOf[k] = Math.cos((Math.PI / 2) * Math.min(1, dist / 0.5)) ** 2;
    isBass[k] = f < KEY_OPTS.bassSplit ? 1 : 0;
  }
  const treble = new Float64Array(12);
  const bass = new Float64Array(12);
  const ft = new Float64Array(12);
  const fb = new Float64Array(12);
  for (let t = 0; t < T; t++) {
    ft.fill(0);
    fb.fill(0);
    const cur = frames[t];
    let fmax = 0;
    for (let k = 0; k < width; k++) if (cur[k] > fmax) fmax = cur[k];
    if (fmax <= 0) continue;
    const inv = 1 / fmax;
    for (let k = 0; k < width; k++) {
      // harmonic estimate: median across time; percussive: across frequency
      let n = 0;
      for (let j = Math.max(0, t - h); j <= Math.min(T - 1, t + h); j++) win[n++] = frames[j][k];
      const H = quickMedian(win, n);
      n = 0;
      for (let j = Math.max(0, k - h); j <= Math.min(width - 1, k + h); j++) win[n++] = cur[j];
      const P = quickMedian(win, n);
      const mask = (H * H) / (H * H + P * P + 1e-12);
      if (wOf[k] < KEY_OPTS.minBinWeight) continue;
      const v = Math.log1p(KEY_OPTS.logGamma * cur[k] * inv * mask) * wOf[k];
      if (isBass[k]) fb[pcOf[k]] += v;
      else ft[pcOf[k]] += v;
    }
    for (let i = 0; i < 12; i++) {
      treble[i] += ft[i];
      bass[i] += fb[i];
    }
  }
  return { treble, bass, tuningHz };
}

export function estimateKey(x: Float32Array, sr: number): { key: BeatKey; confidence: number; agreed: boolean; alternative: BeatKey; tuningHz: number } {
  const { treble, bass, tuningHz } = KEY_OPTS.method === "hpss" ? hpssChroma(x, sr) : hpcp(x, sr);
  const norm = (v: Float64Array) => {
    const m = Math.max(...v);
    return m > 0 ? Array.from(v, (a) => a / m) : Array.from(v);
  };
  const t = norm(treble);
  const b = norm(bass);
  // the 808/bass line is where the tonic is said loudest in urban beats
  const chroma = t.map((v, i) => v + KEY_OPTS.bassWeight * b[i]);

  if (KEY_OPTS.ensemble) {
    // three profile families averaged, plus how much the bass sits on the
    // tonic (the 808 plays the root most of the time in urban beats)
    const fams = [PROFILES.edma, PROFILES.temperley, PROFILES.krumhansl];
    const scored: { key: BeatKey; r: number; votes: number }[] = [];
    const bestOf = fams.map((f) => rankKeys(chroma, f)[0].key);
    for (let tonic = 0; tonic < 12; tonic++) {
      for (const scale of ["major", "minor"] as const) {
        let r = 0;
        for (const f of fams) r += correlation(chroma, f[scale], tonic) / fams.length;
        r += KEY_OPTS.bassTonic * (b[tonic] - 0.5);
        const votes = bestOf.filter((k) => k.tonic === tonic && k.scale === scale).length;
        scored.push({ key: { tonic, scale }, r, votes });
      }
    }
    scored.sort((p, q) => q.r - p.r);
    const top = scored[0];
    const agreed = top.votes >= 2;
    const margin = top.r - scored[1].r;
    const confidence = Math.max(0, Math.min(1, (agreed ? 0.5 : 0.1) + (margin / 0.08) * 0.5));
    return { key: top.key, confidence, agreed, alternative: scored[1].key, tuningHz };
  }

  const byEdma = rankKeys(chroma, PROFILES[KEY_OPTS.profileA]);
  if (KEY_OPTS.bassPick > 0) {
    // among the closest few keys, the one whose tonic the bass plays most
    const pool = byEdma.slice(0, KEY_OPTS.bassPick).filter((k) => k.r > byEdma[0].r - 0.12);
    pool.sort((p, q) => b[q.key.tonic] - b[p.key.tonic] || q.r - p.r);
    const i = byEdma.indexOf(pool[0]);
    if (i > 0) [byEdma[0], byEdma[i]] = [byEdma[i], byEdma[0]];
  }
  const byTemp = rankKeys(chroma, PROFILES.temperley);
  const byKk = rankKeys(chroma, PROFILES.krumhansl);
  // model B: Temperley + Krumhansl summed
  const scoreB = new Map<string, number>();
  for (const r of [...byTemp, ...byKk]) {
    const k = `${r.key.tonic}${r.key.scale}`;
    scoreB.set(k, (scoreB.get(k) ?? 0) + r.r);
  }
  const bestB = [...scoreB.entries()].sort((p, q) => q[1] - p[1])[0][0];
  const a = byEdma[0];
  const agreed = `${a.key.tonic}${a.key.scale}` === bestB;
  const parse = (s: string): BeatKey => ({ tonic: parseInt(s, 10), scale: s.endsWith("minor") ? "minor" : "major" });
  const alternative = agreed ? byEdma[1].key : parse(bestB);
  const margin = a.r - byEdma[1].r;
  const confidence = Math.max(0, Math.min(1, (agreed ? 0.5 : 0) + margin / 0.1 * 0.5));
  return { key: a.key, confidence, agreed, alternative, tuningHz };
}

/** Whole analysis. Uses up to the first `maxSeconds` (default 120). */
export function analyzeBeat(samples: Float32Array, sampleRate: number, maxSeconds = 120): BeatAnalysis {
  const n = Math.min(samples.length, Math.floor(maxSeconds * sampleRate));
  const { x, sr } = prepare(samples.subarray(0, n), sampleRate);
  const tempo = estimateTempo(x, sr);
  const key = estimateKey(x, sr);
  return {
    bpm: tempo.bpm,
    bpmConfidence: tempo.confidence,
    key: key.key,
    keyConfidence: key.confidence,
    keyAgreed: key.agreed,
    keyAlternative: key.alternative,
    tuningHz: key.tuningHz,
  };
}
