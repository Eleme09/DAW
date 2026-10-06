import { describe, expect, it } from "vitest";
import { renderAutoPitch, loadAutoPitchHelpers } from "./workletHarness";
import { phoneVoice } from "./testVoice";
import { resolveAutoPitch, AUTOPITCH_LATENCY_SEC } from "./resolveAutoPitch";
import { detectPitchYin } from "../pitch/pitchDetection";
import { magnitudeSpectrum } from "../analysis/fft";
import { AUTOPITCH_RECIPES, createAutoPitchSettings, type AutoPitchSettings } from "@/types/autoPitch";

const SR = 44100;
const A_MAJOR = 9;

/** A sung "ah": harmonics of f0(t) under a fixed formant envelope (F1 700,
 * F2 1200, F3 2600 Hz) - the formants don't move with the pitch, like a voice. */
function vowel(f0: (t: number) => number, seconds: number, amp = 0.3): Float32Array {
  const n = Math.floor(seconds * SR);
  const out = new Float32Array(n);
  const harmonics = 30;
  const phase = new Float64Array(harmonics + 1);
  const formants = [
    [700, 130, 1],
    [1200, 150, 0.6],
    [2600, 250, 0.3],
  ];
  for (let i = 0; i < n; i++) {
    const f = f0(i / SR);
    let s = 0;
    for (let k = 1; k <= harmonics; k++) {
      const fk = f * k;
      if (fk > SR / 2 - 1000) break;
      phase[k] += (2 * Math.PI * fk) / SR;
      let env = 0.15;
      for (const [fc, bw, g] of formants) env += g / (1 + ((fk - fc) / bw) ** 2);
      s += (Math.sin(phase[k]) * env) / Math.sqrt(k);
    }
    out[i] = s * amp * 0.5;
  }
  return out;
}

function pitchTrack(data: Float32Array, from: number, to: number): number[] {
  const frame = 2048;
  const hz: number[] = [];
  for (let start = Math.floor(from * SR); start + frame <= Math.min(data.length, to * SR); start += 512) {
    const { frequencyHz } = detectPitchYin(data.subarray(start, start + frame), SR);
    if (frequencyHz !== null) hz.push(frequencyHz);
  }
  return hz;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function cents(a: number, b: number): number {
  return 1200 * Math.log2(a / b);
}

function rms(data: Float32Array, from = 0, to = data.length): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / Math.max(1, to - from));
}

/** Magnitude near `hz` (max over +-1 bin) of a 16384-point spectrum from `start`. */
function bandMagnitude(data: Float32Array, start: number, hz: number): number {
  const size = 16384;
  const spec = magnitudeSpectrum(data.subarray(start, start + size));
  const bin = Math.round((hz * size) / SR);
  return Math.max(spec[bin - 1], spec[bin], spec[bin + 1]);
}

function settings(patch: Partial<AutoPitchSettings>): AutoPitchSettings {
  return { ...createAutoPitchSettings(A_MAJOR, "major"), ...patch };
}

describe("autopitch-processor helpers", () => {
  const h = loadAutoPitchHelpers();
  const major = [0, 2, 4, 5, 7, 9, 11];

  it("moves a note along the key like a harmonizer (A major)", () => {
    expect(h.diatonicShift(57, 2, A_MAJOR, major)).toBe(61); // A3 -> C#4 (third up)
    expect(h.diatonicShift(57, -2, A_MAJOR, major)).toBe(54); // A3 -> F#3 (third down)
    expect(h.diatonicShift(61, 2, A_MAJOR, major)).toBe(64); // C#4 -> E4 (minor third)
    expect(h.diatonicShift(57, 3, A_MAJOR, major)).toBe(62); // fourth up -> D4
    expect(h.diatonicShift(57, -4, A_MAJOR, major)).toBe(50); // fifth down -> D3
  });

  it("snaps to the nearest note of the scale", () => {
    expect(h.nearestNote(58.4, A_MAJOR, major)).toBe(59); // A#3 (+40c) -> B3
    expect(h.nearestNote(57.3, A_MAJOR, major)).toBe(57);
    expect(h.allowedPcs(1, 0)).toHaveLength(12);
    expect(h.allowedPcs(4, 0)).toEqual([0, 2, 4, 7, 9]);
  });
});

describe("AutoPitch tuning (Classic, real worklet)", () => {
  it("pulls an off-key note onto the scale note", () => {
    const input = vowel(() => 226, 1.5); // A3 + 46 cents
    const { worklet } = resolveAutoPitch(settings({ presetId: "classic" }));
    const out = renderAutoPitch(input, worklet);
    const tuned = median(pitchTrack(out.left, 0.5, 1.4));
    expect(Math.abs(cents(tuned, 220))).toBeLessThan(6);
  });

  it("leaves an in-tune voice intact, delayed by its constant latency", () => {
    const input = vowel(() => 220, 1.2);
    const { worklet } = resolveAutoPitch(settings({ presetId: "classic" }));
    const out = renderAutoPitch(input, worklet);
    const lag = Math.round(AUTOPITCH_LATENCY_SEC * SR);
    let num = 0;
    let a = 0;
    let b = 0;
    for (let i = Math.floor(0.4 * SR); i < Math.floor(1.1 * SR); i++) {
      const y = out.left[i];
      const x = input[i - lag];
      num += x * y;
      a += x * x;
      b += y * y;
    }
    expect(num / Math.sqrt(a * b)).toBeGreaterThan(0.97);
  });

  it("doesn't flicker when a sharp singer's vibrato crosses toward the next note", () => {
    // A3 held 40 cents sharp with a 5.5 Hz, +-25 cent vibrato: the raw pitch
    // keeps crossing the A3/A#3 midpoint, the note never changes.
    const input = vowel((t) => 220 * Math.pow(2, (40 + 25 * Math.sin(2 * Math.PI * 5.5 * t)) / 1200), 2.5);
    const { worklet } = resolveAutoPitch(settings({ presetId: "classic", scale: "chromatic" }));
    const out = renderAutoPitch(input, worklet);
    const notes = pitchTrack(out.left, 0.4, 2.4).map((hz) => Math.round(69 + 12 * Math.log2(hz / 440)));
    let switches = 0;
    for (let i = 1; i < notes.length; i++) if (notes[i] !== notes[i - 1]) switches++;
    expect(switches).toBe(0);
    expect(median(notes)).toBe(57);
  });

  it("takes a semitone step sung 30 cents off without hanging on the old note", () => {
    // D4 -> C#4, both 30 cents sharp (the case that hung ~150 ms before).
    const input = vowel((t) => 440 * Math.pow(2, ((t < 0.7 ? 62 : 61) - 69 + 0.3) / 12), 1.4);
    const { worklet } = resolveAutoPitch(settings({ presetId: "classic" }));
    const out = renderAutoPitch(input, worklet);
    const lag = AUTOPITCH_LATENCY_SEC;
    // 120 ms after the sung change (+ the output latency) it is on C#4
    expect(Math.abs(cents(median(pitchTrack(out.left, 0.7 + lag + 0.12, 0.7 + lag + 0.3)), 277.18))).toBeLessThan(8);
  });

  it("follows a real note change quickly (A3 -> B3)", () => {
    const input = vowel((t) => (t < 0.7 ? 221 : 248), 1.4);
    const { worklet } = resolveAutoPitch(settings({ presetId: "classic" }));
    const out = renderAutoPitch(input, worklet);
    expect(Math.abs(cents(median(pitchTrack(out.left, 0.3, 0.65)), 220))).toBeLessThan(6);
    // 80 ms after the sung change, the output is already on B3
    expect(Math.abs(cents(median(pitchTrack(out.left, 0.78, 1.35)), 246.94))).toBeLessThan(6);
  });

  it("Classic flattens vibrato; Natural lets it through (Retune Speed 0 vs natural)", () => {
    const input = vowel((t) => 220 * Math.pow(2, (30 * Math.sin(2 * Math.PI * 5 * t)) / 1200), 2);
    const spread = (presetId: "classic" | "natural") => {
      const out = renderAutoPitch(input, resolveAutoPitch(settings({ presetId })).worklet);
      const c = pitchTrack(out.left, 0.5, 1.9).map((hz) => cents(hz, 220));
      const mean = c.reduce((a, b) => a + b, 0) / c.length;
      return Math.sqrt(c.reduce((a, b) => a + (b - mean) ** 2, 0) / c.length);
    };
    expect(spread("classic")).toBeLessThan(7);
    expect(spread("natural")).toBeGreaterThan(12);
  });

  it("passes consonants (noise) through clean, aligned with the tuned voice", () => {
    let seed = 1;
    const noise = new Float32Array(SR).map(() => {
      seed = (seed * 16807) % 2147483647;
      return (seed / 2147483647 - 0.5) * 0.2;
    });
    const { worklet } = resolveAutoPitch(settings({ presetId: "classic" }));
    const out = renderAutoPitch(noise, worklet);
    const lag = Math.round(AUTOPITCH_LATENCY_SEC * SR);
    let num = 0;
    let a = 0;
    let b = 0;
    for (let i = 0.3 * SR; i < 0.9 * SR; i++) {
      const y = out.left[i];
      num += noise[i - lag] * y;
      a += noise[i - lag] ** 2;
      b += y * y;
    }
    expect(num / Math.sqrt(a * b)).toBeGreaterThan(0.95);
  });
});

describe("AutoPitch presets (real worklet)", () => {
  const input = vowel(() => 220, 1.6);
  const start = Math.floor(0.6 * SR);

  it("Duet adds a third above (A3 -> C#4) in key", () => {
    const { worklet } = resolveAutoPitch(settings({ presetId: "duet" }));
    const out = renderAutoPitch(input, worklet);
    const third = bandMagnitude(out.left, start, 277.18);
    const lead = bandMagnitude(out.left, start, 220);
    const offKey = bandMagnitude(out.left, start, 261.63); // C4: not a harmony here
    expect(third).toBeGreaterThan(lead * 0.25);
    expect(third).toBeGreaterThan(offKey * 4);
  });

  it("Modern Rap adds the octave below", () => {
    const { worklet } = resolveAutoPitch(settings({ presetId: "modernRap" }));
    const out = renderAutoPitch(input, worklet);
    const dry = renderAutoPitch(input, resolveAutoPitch(settings({ presetId: "classic" })).worklet);
    expect(bandMagnitude(out.left, start, 110)).toBeGreaterThan(bandMagnitude(dry.left, start, 110) * 5);
  });

  it("Ultrashift adds a perfect fifth up and a perfect fourth down", () => {
    const { worklet } = resolveAutoPitch(settings({ presetId: "ultrashift" }));
    const out = renderAutoPitch(input, worklet);
    expect(bandMagnitude(out.left, start, 329.63)).toBeGreaterThan(bandMagnitude(out.left, start, 311.13) * 4); // E4 vs Eb4
    expect(bandMagnitude(out.right, start, 164.81)).toBeGreaterThan(bandMagnitude(out.right, start, 155.56) * 4); // E3 vs Eb3
  });

  it("Robot's vocoder sings on the tuned pitch", () => {
    const off = vowel(() => 226, 1.6);
    const { worklet } = resolveAutoPitch(settings({ presetId: "robot" }));
    const out = renderAutoPitch(off, worklet);
    const tuned = median(pitchTrack(out.left, 0.6, 1.5));
    expect(Math.abs(cents(tuned, 220))).toBeLessThan(15);
  });

  it.each(AUTOPITCH_RECIPES.map((r) => r.id))("%s stays finite and near the input loudness", (presetId) => {
    const sliding = vowel((t) => 196 * Math.pow(2, (t * 7) / 12), 1.2); // G3 sliding up
    const { worklet } = resolveAutoPitch(settings({ presetId }));
    const out = renderAutoPitch(sliding, worklet);
    let peak = 0;
    for (let i = 0; i < out.left.length; i++) {
      expect(Number.isFinite(out.left[i]) && Number.isFinite(out.right[i])).toBe(true);
      peak = Math.max(peak, Math.abs(out.left[i]), Math.abs(out.right[i]));
    }
    expect(peak).toBeLessThan(2);
    const from = Math.floor(0.3 * SR);
    const outRms = Math.sqrt((rms(out.left, from) ** 2 + rms(out.right, from) ** 2) / 2);
    const db = 20 * Math.log10(outRms / rms(sliding, from));
    expect(db).toBeGreaterThan(-3);
    expect(db).toBeLessThan(3);
  });
});

describe("AutoPitch preset loudness vs recording level (regression 2026-10-06)", () => {
  // A fixed compressor makeup only fits one input level: with the user's hot
  // phone takes (-8 LUFS) Play Card came out 9 LU quieter than the voice,
  // Telephone 6.5, Gorgon 6. The colour stage now matches its own loudness.
  const sliding = vowel((t) => 196 * Math.pow(2, (t * 5) / 12), 2);
  const from = Math.floor(0.8 * SR);
  const gainDb = (input: Float32Array, presetId: AutoPitchSettings["presetId"]) => {
    const out = renderAutoPitch(input, resolveAutoPitch(settings({ presetId })).worklet);
    const outRms = Math.sqrt((rms(out.left, from) ** 2 + rms(out.right, from) ** 2) / 2);
    return 20 * Math.log10(outRms / rms(input, from));
  };
  it.each(["playCard", "telephone", "gorgon", "modernRap", "yummy", "natural", "hyper"] as const)("%s: same gain for a hot take and one 18 dB quieter", (presetId) => {
    const hot = sliding.map((v) => v * 3); // peaks near 0 dBFS
    const quiet = sliding.map((v) => v * 3 * 10 ** (-18 / 20));
    const a = gainDb(hot, presetId);
    const b = gainDb(quiet, presetId);
    expect(Math.abs(a - b)).toBeLessThan(1.5);
    expect(a).toBeGreaterThan(-3);
  });
});

describe("resolveAutoPitch Level knob", () => {
  it("full Level = the preset's own speed; lower Level glides slower and stops correcting fully below 50%", () => {
    const full = resolveAutoPitch(settings({ presetId: "classic", level: 1 })).worklet;
    const mid = resolveAutoPitch(settings({ presetId: "classic", level: 0.6 })).worklet;
    const low = resolveAutoPitch(settings({ presetId: "classic", level: 0.2 })).worklet;
    expect(full.speedMs).toBe(0);
    expect(mid.speedMs).toBeGreaterThan(full.speedMs);
    expect(mid.amount).toBe(1);
    expect(low.amount).toBeCloseTo(0.4);
  });

  it("Harmony Mix turns harmonies down but not Gorgon's main voice", () => {
    const duet = resolveAutoPitch(settings({ presetId: "duet", harmonyMix: 0 })).worklet;
    const gorgon = resolveAutoPitch(settings({ presetId: "gorgon", harmonyMix: 0 })).worklet;
    expect(duet.v0Gain).toBe(0);
    expect(gorgon.v0Gain).toBeGreaterThan(0.9);
  });

  it("Formant-Preserving stops harmony timbre from following pitch", () => {
    expect(resolveAutoPitch(settings({ algorithm: "formant" })).worklet.formantFollow).toBe(0);
    expect(resolveAutoPitch(settings({ algorithm: "original" })).worklet.formantFollow).toBe(1);
    expect(resolveAutoPitch(settings({ algorithm: "lowLatency" })).worklet.lowLatency).toBe(1);
  });
});

describe("AutoPitch on a phone-recorded voice (regression)", () => {
  const voice = phoneVoice(6);
  let inPeak = 0;
  for (const v of voice) inPeak = Math.max(inPeak, Math.abs(v));

  it.each([0, 0.1, 0.25, 0.5, 1])("Level %s: same loudness as the input, never louder than its peak", (level) => {
    const { worklet } = resolveAutoPitch(settings({ presetId: "classic", level }));
    const out = renderAutoPitch(voice, worklet);
    let peak = 0;
    for (let i = 0; i < out.left.length; i++) peak = Math.max(peak, Math.abs(out.left[i]), Math.abs(out.right[i]));
    expect(peak).toBeLessThan(inPeak * 1.3);
    const from = Math.floor(0.3 * SR);
    const outRms = Math.sqrt((rms(out.left, from) ** 2 + rms(out.right, from) ** 2) / 2);
    const db = 20 * Math.log10(outRms / rms(voice, from));
    expect(db).toBeGreaterThan(-4);
    expect(db).toBeLessThan(3);
  });

  it.each([0, 1])("Level %s: the voice never drops out while the input is loud", (level) => {
    const { worklet } = resolveAutoPitch(settings({ presetId: "classic", level }));
    const out = renderAutoPitch(voice, worklet);
    const win = Math.floor(0.1 * SR);
    let dead = 0;
    let loud = 0;
    for (let a = Math.floor(0.3 * SR); a + win < voice.length; a += win) {
      const ri = rms(voice, a, a + win);
      if (ri < 0.04) continue;
      loud++;
      const ro = Math.sqrt((rms(out.left, a, a + win) ** 2 + rms(out.right, a, a + win) ** 2) / 2);
      if (ro < ri * 0.25) dead++;
    }
    expect(loud).toBeGreaterThan(10);
    expect(dead).toBeLessThanOrEqual(Math.ceil(loud * 0.05));
  });

  it.each(["classic", "duet", "bigHarmony", "robot"] as const)("%s: the synthesis work stays bounded (no catch-up loops)", (presetId) => {
    const { worklet } = resolveAutoPitch(settings({ presetId, level: 0 }));
    let calls = 0;
    renderAutoPitch(voice, worklet, SR, (node) => {
      calls = node.depositCalls as number;
    });
    // At most ~one grain per pitch period per voice: <= 1000/s x 5 streams.
    expect(calls / 6).toBeLessThan(5000);
  });

  it("recovers by itself after garbage input (NaN/huge) instead of staying silent", () => {
    const bad = voice.slice();
    for (let i = Math.floor(1.5 * SR); i < Math.floor(1.5 * SR) + 200; i++) bad[i] = i % 2 ? NaN : 1e6;
    const { worklet } = resolveAutoPitch(settings({ presetId: "classic", level: 1 }));
    const out = renderAutoPitch(bad, worklet);
    for (const v of out.left) expect(Number.isFinite(v)).toBe(true);
    const a = Math.floor(3.5 * SR);
    expect(rms(out.left, a, voice.length)).toBeGreaterThan(rms(voice, a, voice.length) * 0.2);
  });
});

// Octave locks found on a real vocal (scripts/autopitch-audit/EXPERIMENTOS-2026-10-06.md, "F").
// Fixed 2026-10-07 together with what had kept them as known bugs: a period
// twice the reading must now win clearly before it is taken (a creaky,
// period-doubled onset no longer reads an octave low), and the synthesis
// marks steer back onto the epochs at up to 2 % of a period per cycle
// instead of half a sample (after a detector jump they took ~0.5 s).
describe("AutoPitch detector: octave locks (regression, real vocal 2026-10-06)", () => {
  /** Steady 220 Hz tone with the given harmonic amplitudes (k = 1, 2, 3...). */
  function tone(amps: number[], seconds: number, phase0 = 0): Float32Array {
    const n = Math.floor(seconds * SR);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < amps.length; k++) s += amps[k] * Math.sin((2 * Math.PI * 220 * (k + 1) * (i + phase0)) / SR + k);
      out[i] = 0.2 * s;
    }
    return out;
  }

  /** The detector's pitch (Hz) every 10 blocks from `from` seconds on. */
  function detected(input: Float32Array, from: number): number[] {
    const { worklet } = resolveAutoPitch(settings({ presetId: "classic" }));
    const hz: number[] = [];
    renderAutoPitch(input, worklet, SR, (node, start) => {
      if (start >= from * SR && start % (128 * 10) === 0) {
        const d = node.detMidi as number | null;
        hz.push(d === null ? 0 : 440 * Math.pow(2, (d - 69) / 12));
      }
    });
    return hz;
  }

  it("reads a voice whose 3rd harmonic dominates at its real pitch, not 3x higher", () => {
    // F1 on the 3rd harmonic (an "ah" at A3): YIN's first dip under its
    // threshold is a third of the period, the true period's dip is far deeper.
    // The detector used to read 663 Hz for the whole note.
    const hz = detected(tone([0.3, 0.15, 1], 0.6), 0.05);
    for (const v of hz) expect(Math.abs(cents(v, 220))).toBeLessThan(30);
  });

  it("reads an earbud/phone voice (fundamental far under the 2nd harmonic) at its real pitch", () => {
    // Real earbud take (2.9 s): fundamental 14 dB under the 2nd harmonic.
    // YIN's first dip is half the period and the tuner used to work an
    // octave up for whole phrases.
    const hz = detected(tone([0.15, 1, 0.2, 0.05], 0.6), 0.05);
    expect(hz.length).toBeGreaterThan(10);
    for (const v of hz) expect(Math.abs(cents(v, 220))).toBeLessThan(30);
  });

  it("does not read a slightly creaky voice (alternating cycles) an octave low", () => {
    // Every other cycle 15 % louder: the signal repeats better at twice the
    // period, but the pitch heard is still 220 Hz.
    const base = tone([1, 0.5, 0.3], 0.6);
    const period = SR / 220;
    for (let i = 0; i < base.length; i++) base[i] *= Math.floor(i / period) % 2 ? 1.15 : 1;
    const hz = detected(base, 0.05);
    expect(hz.length).toBeGreaterThan(10);
    for (const v of hz) expect(Math.abs(cents(v, 220))).toBeLessThan(30);
  });

  it("lets go of a wrong octave lock as soon as the readings agree", () => {
    // 100 ms of a hard-to-read voice, then a plain A3: every reading says
    // 220 Hz, but the octave-jump confirmation and the outlier hold used to
    // take turns rejecting them and a wrong lock stuck for the rest of the
    // note (604 ms on the real vocal, 58.8 s).
    const a = tone([0.2, 0.1, 1], 0.1);
    const b = tone([1, 0.5, 0.3], 0.5, a.length);
    const input = new Float32Array(a.length + b.length);
    input.set(a);
    input.set(b, a.length);
    const hz = detected(input, 0.14);
    expect(hz.length).toBeGreaterThan(10);
    for (const v of hz) expect(Math.abs(cents(v, 220))).toBeLessThan(30);
  });
});

describe("AutoPitch lookahead (regression, real vocal 2026-10-06)", () => {
  /** detMidi (as Hz) after each scripted detector reading, on a fresh node. */
  function decisions(readings: number[]): number[] {
    let node: (Record<string, unknown> & { analyze(): void; yin(): unknown }) | null = null;
    const { worklet } = resolveAutoPitch(settings({ presetId: "classic" }));
    renderAutoPitch(new Float32Array(SR / 10), worklet, SR, (n) => {
      node = n as typeof node;
    });
    const n = node!;
    let k = 0;
    n.yin = () => ({ hz: readings[Math.min(k++, readings.length - 1)], confidence: 0.9, rms: 0.1 });
    const out: number[] = [];
    for (let i = 0; i < readings.length + 1; i++) {
      n.analyze();
      const d = n.detMidi as number | null;
      out.push(d === null ? 0 : 440 * Math.pow(2, (d - 69) / 12));
    }
    return out;
  }

  it("a harmonic misreading on the first frame of a note never reaches the tuner", () => {
    // The first voiced frame of a note read on the 3rd harmonic: with nothing
    // before it to compare against, the old detector took it and the octave
    // confirmation then held it for two more frames.
    const hz = decisions([663, 221, 220, 221, 220, 221, 220]);
    for (const v of hz) if (v > 0) expect(Math.abs(cents(v, 220))).toBeLessThan(30);
  });

  it("a real note change still gets through, one analysis later", () => {
    const hz = decisions([220, 220, 220, 220, 247, 247, 247, 247, 247]);
    expect(Math.abs(cents(hz[hz.length - 1], 247))).toBeLessThan(10);
  });
});
