import { describe, expect, it } from "vitest";
import { renderAutoPitch } from "./workletHarness";
import { sungVowel } from "./testVoice";
import { resolveAutoPitch } from "./resolveAutoPitch";
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
      data[i] = y * 0.12;
    }
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
