import { describe, expect, it } from "vitest";
import { renderAutoPitch, loadAutoPitchHelpers } from "./workletHarness";
import { sungVowel } from "./testVoice";
import { resolveAutoPitch, AUTOPITCH_LATENCY_SEC } from "./resolveAutoPitch";
import { createAutoPitchSettings } from "@/types/autoPitch";

/**
 * How CLEAN a tuned voice sounds, measured. The user's complaint was a rough,
 * hoarse, robotic autotune; the engine's output period was irregular (cycle to
 * cycle jitter of 1-2 %, ten times what a voice has) because the pitch marks
 * followed the input's own period jitter and hopped between peaks of the
 * waveform. These tests pin the fixes: regular output periods, marks that sit
 * on the glottal pulse and stay there, no octave blips from tracking errors.
 */

const SR = 44100;
const A_MAJOR = 9;
const RATES = [44100, 48000] as const;

function classic() {
  return resolveAutoPitch({ ...createAutoPitchSettings(A_MAJOR, "major"), presetId: "classic", level: 1 }).worklet;
}

/** Nearest A-major note (Hz) to `hz`. */
function nearestNoteHz(hz: number): number {
  const midi = 69 + 12 * Math.log2(hz / 440);
  const pcs = [0, 2, 4, 5, 7, 9, 11];
  let best = Math.round(midi);
  for (let c = Math.round(midi) - 3; c <= Math.round(midi) + 3; c++) {
    if (pcs.includes(((c - 69) % 12 + 12) % 12) && Math.abs(c - midi) < Math.abs(best - midi)) best = c;
  }
  return 440 * Math.pow(2, (best - 69) / 12);
}

/** Cycle-to-cycle period variation (% of the period) of a signal that should
 * have a constant pitch `hz`: rising zero-crossings of its fundamental
 * (2-pole band-pass applied forward and backward, so no phase shift). */
function periodJitterPercent(x: Float32Array, hz: number, fromSec: number, toSec: number, rate = SR): number {
  const seg = x.subarray(Math.floor(fromSec * rate), Math.floor(toSec * rate));
  const band = (data: Float64Array) => {
    // RBJ band-pass, centre hz, Q ~ 1.4
    const w0 = (2 * Math.PI * hz) / rate;
    const alpha = Math.sin(w0) / (2 * 1.4);
    const a0 = 1 + alpha;
    const b0 = alpha / a0;
    const b2 = -alpha / a0;
    const a1 = (-2 * Math.cos(w0)) / a0;
    const a2 = (1 - alpha) / a0;
    const y = new Float64Array(data.length);
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < data.length; i++) {
      const v = b0 * data[i] + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = data[i];
      y2 = y1;
      y1 = v;
      y[i] = v;
    }
    return y;
  };
  // two cascaded passes each way: steep enough that a strong 2nd harmonic
  // can't add extra zero-crossings
  const pass = (data: Float64Array) => band(band(data));
  const forward = pass(Float64Array.from(seg));
  const back = pass(forward.reverse()).reverse();
  const crossings: number[] = [];
  for (let i = 1; i < back.length; i++) {
    if (back[i - 1] < 0 && back[i] >= 0) crossings.push(i - 1 + -back[i - 1] / (back[i] - back[i - 1]));
  }
  const periods: number[] = [];
  const P = rate / hz;
  for (let i = 3; i < crossings.length - 3; i++) {
    const p = crossings[i + 1] - crossings[i];
    if (p > 0.8 * P && p < 1.2 * P) periods.push(p);
  }
  expect(periods.length).toBeGreaterThan(20);
  const mean = periods.reduce((a, b) => a + b, 0) / periods.length;
  let sumDiff = 0;
  for (let i = 1; i < periods.length; i++) sumDiff += Math.abs(periods[i] - periods[i - 1]);
  return (100 * sumDiff) / (periods.length - 1) / mean;
}

const VOICES = [
  { name: "male a", hz: 110, cents: 30, formants: [[700, 90], [1100, 100], [2500, 150], [3300, 200]], vib: 20, jitter: 0.006 },
  { name: "male u", hz: 130, cents: -35, formants: [[320, 60], [800, 80], [2400, 150], [3200, 200]], vib: 30, jitter: 0.004 },
  { name: "female a", hz: 262, cents: 40, formants: [[900, 100], [1500, 120], [2900, 180], [3800, 250]], vib: 25, jitter: 0.004 },
  { name: "female i (near-sinusoidal)", hz: 330, cents: -30, formants: [[300, 50], [2600, 150], [3300, 200], [4300, 300]], vib: 35, jitter: 0.006 },
  { name: "mid e", hz: 200, cents: 25, formants: [[500, 70], [1800, 120], [2500, 150], [3500, 200]], vib: 15, jitter: 0.01 },
  { name: "mid a, strong 2nd peak", hz: 200, cents: 35, formants: [[830, 90], [1300, 110], [2500, 160], [3400, 200], [4400, 300]], vib: 25, jitter: 0.002 },
];

describe("AutoPitch output is a clean, regular tone (hard-tuned sustained vowels)", () => {
  it.each(VOICES)("$name: cycle-to-cycle period variation stays under 0.35 %", (v) => {
    const { data } = sungVowel({ seconds: 3, hz: v.hz, cents: v.cents, vibratoCents: v.vib, jitter: v.jitter, formants: v.formants });
    const out = renderAutoPitch(data, classic());
    const target = nearestNoteHz(v.hz * Math.pow(2, v.cents / 1200));
    // The old engine measured 0.6-2.2 % on these (period noise inherited from
    // the input's jitter plus pitch marks hopping between waveform peaks).
    expect(periodJitterPercent(out.left, target, 0.8, 2.7)).toBeLessThan(0.35);
  });

  it.each(RATES)("is just as clean at %i Hz (an iPhone runs its audio at 48 kHz)", (rate) => {
    const v = VOICES[5];
    const { data } = sungVowel({ seconds: 3, hz: v.hz, cents: v.cents, vibratoCents: v.vib, jitter: v.jitter, formants: v.formants, sampleRate: rate });
    const out = renderAutoPitch(data, classic(), rate);
    const target = nearestNoteHz(v.hz * Math.pow(2, v.cents / 1200));
    expect(periodJitterPercent(out.left, target, 0.8, 2.7, rate)).toBeLessThan(0.35);
  });
});

describe("AutoPitch pitch marks (epochs)", () => {
  it("sit on the glottal pulse and stay there instead of drifting across the period", () => {
    const { data, pulses } = sungVowel({ seconds: 3, hz: 200, cents: 35, vibratoCents: 25, jitter: 0.002 });
    const epochs: number[] = [];
    let seen = 0;
    renderAutoPitch(data, classic(), SR, (node) => {
      const n = node as unknown as { epochCount: number; epochPos: Float64Array };
      while (seen < n.epochCount) epochs.push(n.epochPos[seen++ & 511]);
    });
    const P = SR / 204;
    const offsets: number[] = [];
    for (const e of epochs) {
      if (e < 1 * SR || e > 2.7 * SR) continue;
      let nearest = pulses[0];
      for (const p of pulses) if (Math.abs(p - e) < Math.abs(nearest - e)) nearest = p;
      offsets.push(e - nearest);
    }
    expect(offsets.length).toBeGreaterThan(200);
    const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length;
    const sd = Math.sqrt(offsets.reduce((a, b) => a + (b - mean) ** 2, 0) / offsets.length);
    // Close to the pulse (grains are weighted to zero one period away, so an
    // epoch half a period off double-counts a pulse; within a fifth of a
    // period the neighbour's weight is under 10 %) ...
    expect(Math.abs(mean)).toBeLessThan(P / 5);
    // ... and steady (the old picker's offset wandered over a whole period).
    expect(sd).toBeLessThan(P / 20);
  });
});

describe("AutoPitch tracking errors", () => {
  it("a few-hop pitch-detector error doesn't flip the target note (no blip in a held note)", () => {
    // 'i' vowel sung 30 cents flat of E4: the old tracker briefly read ~1.5
    // semitones high twice a second and jumped to F#4 for a few ms each time.
    const { data } = sungVowel({ seconds: 3, hz: 330, cents: -30, vibratoCents: 35, jitter: 0.006, formants: [[300, 50], [2600, 150], [3300, 200], [4300, 300]] });
    const targets: number[] = [];
    renderAutoPitch(data, classic(), SR, (node, start) => {
      const n = node as unknown as { targetNote: number | null };
      if (start > 1 * SR && start < 2.7 * SR && n.targetNote !== null) targets.push(n.targetNote);
    });
    const changes = targets.filter((t, i) => i > 0 && t !== targets[i - 1]).length;
    expect(changes).toBeLessThanOrEqual(1);
  });

  it("alternating loud/soft cycles (period doubling) isn't heard as an octave lower", () => {
    // Every other glottal pulse is 45 % weaker: the waveform repeats exactly
    // only every TWO periods, so a detector that takes the first lag under its
    // threshold reports half the pitch.
    const n = 3 * SR;
    const data = new Float32Array(n);
    const hz = 220;
    let next = 0;
    let k = 0;
    const filters = [[800, 90], [1250, 110], [2500, 160]].map(([f, bw]) => {
      const rr = Math.exp((-Math.PI * bw) / SR);
      return { a1: 2 * rr * Math.cos((2 * Math.PI * f) / SR), a2: -rr * rr, y1: 0, y2: 0 };
    });
    for (let i = 0; i < n; i++) {
      let y = 0;
      if (i >= next) {
        y = k++ % 2 === 0 ? 1 : 0.55;
        next += SR / hz;
      }
      for (const f of filters) {
        const v = y + f.a1 * f.y1 + f.a2 * f.y2;
        f.y2 = f.y1;
        f.y1 = v;
        y = v;
      }
      data[i] = y;
    }
    // (the resonators have a large gain: normalise to a realistic level - the
    // raw pulse train peaked at ~650 and only exercised the overflow reset)
    let peak = 0;
    for (const v of data) peak = Math.max(peak, Math.abs(v));
    for (let i = 0; i < n; i++) data[i] *= 0.5 / peak;
    const out = renderAutoPitch(data, classic());
    // Output pulses in a steady second: about 220, not about 110. A pulse is a
    // peak of the energy smoothed over ~1 ms (one per period, however many
    // times the formants ring inside it), at least 0.7 period from the last.
    const seg = out.left.subarray(Math.floor(1.2 * SR), Math.floor(2.2 * SR));
    const w = 22;
    const energy = new Float64Array(seg.length);
    let acc = 0;
    for (let i = 0; i < seg.length; i++) {
      acc += seg[i] * seg[i];
      if (i >= 2 * w) acc -= seg[i - 2 * w] * seg[i - 2 * w];
      energy[i] = acc;
    }
    let top = 0;
    for (const e of energy) top = Math.max(top, e);
    let peaks = 0;
    let lastPeak = -1e9;
    for (let i = 1; i < energy.length - 1; i++) {
      if (energy[i] > 0.1 * top && energy[i] >= energy[i - 1] && energy[i] > energy[i + 1] && i - lastPeak > 0.7 * (SR / hz)) {
        peaks++;
        lastPeak = i;
      }
    }
    expect(peaks).toBeGreaterThan(200);
    expect(peaks).toBeLessThan(240);
  });
});

/** A sung line with instant (legato) note changes: harmonic tone at `notes`
 * (MIDI), each held `holdSec`, with a light vibrato. */
function legato(notes: number[], holdSec: number): Float32Array {
  const n = Math.floor(notes.length * holdSec * SR);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const midi = notes[Math.min(notes.length - 1, Math.floor(t / holdSec))] + 0.15 * Math.sin(2 * Math.PI * 5.5 * t);
    phase += (440 * Math.pow(2, (midi - 69) / 12)) / SR;
    let s = 0;
    for (let k = 1; k <= 12; k++) s += Math.sin(2 * Math.PI * k * phase) / k;
    out[i] = 0.25 * s;
  }
  return out;
}

describe("AutoPitch on the failures measured on a real vocal (82 s, user's take)", () => {
  it("with nothing to correct the output IS the input, delayed by D (grains follow the input's epochs)", () => {
    // amount 0 keeps the whole grain engine running with a ratio of exactly 1.
    // The old mark spacing (one TARGET period) slid against the epochs and only
    // a snap-to-epoch rescued it; on the real vocal 4 % of 50 ms windows still
    // fell under 20 dB SNR, and with the snap removed the spectral distance
    // was 6-8 dB at ZERO shift.
    const { data } = sungVowel({ seconds: 3, hz: 200, cents: 35, vibratoCents: 25, jitter: 0.004 });
    const out = renderAutoPitch(data, { ...classic(), amount: 0 });
    const D = Math.round(AUTOPITCH_LATENCY_SEC * SR);
    let err = 0;
    let sig = 0;
    for (let i = Math.floor(0.5 * SR); i < Math.floor(2.8 * SR); i++) {
      const e = out.left[i] - data[i - D];
      err += e * e;
      sig += data[i - D] * data[i - D];
    }
    expect(10 * Math.log10(sig / err)).toBeGreaterThan(60);
  });

  it("a small shift repeats/skips input periods only as often as the shift needs", () => {
    // 20 cents sharp with vibrato, hard-tuned: output runs 20 cents slower than
    // the input, so about one period every 1/(1 - 2^(-20/1200)) ~ 87 cycles
    // has to be repeated (~2.3 per second at 200 Hz). The old scheduler
    // repeated or dropped one every ~25 cycles even at zero shift.
    const { data } = sungVowel({ seconds: 3, hz: 200, cents: 20, vibratoCents: 20, jitter: 0.004 });
    let events = 0;
    let lastE: number | null = null;
    let wrapped = false;
    renderAutoPitch(data, classic(), SR, (node) => {
      if (wrapped) return;
      wrapped = true;
      const n = node as unknown as Record<string, unknown> & { epochPos: Float64Array; epochPer: Float32Array; n: number };
      const find = (n.findEpoch as (...a: unknown[]) => number).bind(n);
      n.findEpoch = (...a: unknown[]) => {
        const k = find(...a);
        if (k >= 0 && n.n > 0.6 * SR && n.n < 2.8 * SR && (a[0] as number) >= 0) {
          const e = n.epochPos[k];
          if (lastE !== null && (Math.abs(e - lastE) < 1 || e - lastE > 1.5 * n.epochPer[k])) events++;
          lastE = e;
        }
        return k;
      };
    });
    // ~2.2 s of steady voice -> ~5 needed; allow some slack for vibrato
    expect(events).toBeLessThanOrEqual(12);
  });

  it("legato note changes don't make the target flip back and forth", () => {
    // The ~60 ms pitch average lags a jump. It used to be allowed to choose its
    // own note, so right after a jump the target alternated every 5.8 ms
    // between the note being sung and the ones the average was crawling past
    // (2-6 semitones away) - 37 note changes a second on the real vocal.
    const input = legato([50, 56, 52, 57, 54], 0.4);
    const targets: number[] = [];
    renderAutoPitch(input, { ...classic(), key: 9, scaleIndex: 1 }, SR, (node) => {
      const t = (node as unknown as { targetNote: number | null }).targetNote;
      if (t !== null) targets.push(t);
    });
    let changes = 0;
    let flipBacks = 0;
    for (let i = 1; i < targets.length; i++) {
      if (targets[i] === targets[i - 1]) continue;
      changes++;
      const before = targets.slice(Math.max(0, i - 30), i);
      if (before.includes(targets[i]) && targets[i] !== before[0]) flipBacks++;
    }
    expect(flipBacks).toBe(0);
    expect(changes).toBeLessThanOrEqual(6);
  });

  it("the pitch detector's sub-sample refinement can't produce a negative or runaway lag", () => {
    // On the real vocal the dip picked at 72.03 s had almost no curvature: the
    // old refinement returned a lag of -38 (-1.15 Hz), the pitch became NaN and
    // the tuner stayed broken for the rest of the song.
    const { refineLag } = loadAutoPitchHelpers();
    const cases: [number[], number][] = [
      [[0.5, 0.30001, 0.1], 1], // nearly straight slope: the old formula gave ~ -10000
      [[0.1, 0.3, 0.5], 1], // rising, not a minimum
      [[0.2, 0.3, 0.6], 1], // convex but the minimum is outside
      [[0.4, 0.4, 0.4], 1], // flat
    ];
    for (const [d, tau] of cases) {
      const lag = refineLag(d, tau);
      expect(Number.isFinite(lag)).toBe(true);
      expect(Math.abs(lag - tau)).toBeLessThanOrEqual(0.5);
    }
    // a real dip is still refined towards its true minimum
    expect(refineLag([0.4, 0.1, 0.2], 1)).toBeGreaterThan(1);
    expect(refineLag([0.4, 0.1, 0.2], 1)).toBeLessThan(1.5);
  });

  it("switching AutoPitch on keeps the track's level (it used to drop 3 dB)", () => {
    const { data } = sungVowel({ seconds: 2, hz: 220, cents: 0, vibratoCents: 10, jitter: 0.003 });
    const out = renderAutoPitch(data, classic());
    const rms = (x: Float32Array, a: number, b: number) => {
      let s = 0;
      for (let i = a; i < b; i++) s += x[i] * x[i];
      return Math.sqrt(s / (b - a));
    };
    const D = Math.round(AUTOPITCH_LATENCY_SEC * SR);
    const a = Math.floor(0.5 * SR);
    const b = Math.floor(1.9 * SR);
    const db = 20 * Math.log10(rms(out.left, a + D, b + D) / rms(data, a, b));
    expect(Math.abs(db)).toBeLessThan(0.5);
  });
});
