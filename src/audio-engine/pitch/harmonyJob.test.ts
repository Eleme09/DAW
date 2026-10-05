import { describe, expect, it } from "vitest";
import { trackPitch } from "./pitchDetection";
import { trackPitchFast } from "./fastPitchTrack";
import { analyzeMelody, renderHarmonyChannels } from "./harmonyJob";
import { buildHarmonyCurve } from "./harmonize";
import { frequencyToMidi } from "./noteUtils";

const SR = 44100;

/** A sung melody in A major (A3 B3 C#4 E4 D4 C#4 B3 A3), 5 Hz vibrato, silence between notes. */
function melody(secs: number): Float32Array {
  const n = Math.floor(secs * SR);
  const out = new Float32Array(n);
  const ph = new Float64Array(21);
  const notes = [57, 59, 61, 64, 62, 61, 59, 57];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const note = notes[Math.floor(t / 0.4) % notes.length];
    const f0 = 440 * Math.pow(2, (note - 69 + 0.2 * Math.sin(2 * Math.PI * 5 * t)) / 12);
    let s = 0;
    for (let k = 1; k <= 20; k++) {
      ph[k] += (2 * Math.PI * f0 * k) / SR;
      s += Math.sin(ph[k]) / k;
    }
    const local = t % 0.4;
    out[i] = s * 0.2 * Math.min(1, local / 0.02, (0.4 - local) / 0.03);
  }
  return out;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

describe("trackPitchFast", () => {
  const x = melody(6);
  const slow = trackPitch(x, SR);
  const fast = trackPitchFast(x, SR);

  it("returns the same frames as plain YIN", () => {
    expect(fast).toHaveLength(slow.length);
    expect(fast.map((f) => f.timeSec)).toEqual(slow.map((f) => f.timeSec));
  });

  it("agrees on voiced/unvoiced for almost every frame", () => {
    let same = 0;
    for (let i = 0; i < slow.length; i++) if ((slow[i].frequencyHz === null) === (fast[i].frequencyHz === null)) same++;
    expect(same / slow.length).toBeGreaterThan(0.97);
  });

  it("finds the same pitch within 3 cents (median) and never an octave off", () => {
    const diffs: number[] = [];
    for (let i = 0; i < slow.length; i++) {
      const a = slow[i].frequencyHz;
      const b = fast[i].frequencyHz;
      if (a === null || b === null || slow[i].confidence < 0.8) continue;
      diffs.push(Math.abs(1200 * Math.log2(b / a)));
    }
    expect(diffs.length).toBeGreaterThan(100);
    expect(median(diffs)).toBeLessThan(3);
    expect(Math.max(...diffs)).toBeLessThan(100);
  });

  it("reports progress and stops when cancelled", () => {
    const seen: number[] = [];
    trackPitchFast(melody(20), SR, { onProgress: (f) => seen.push(f) });
    expect(seen[seen.length - 1]).toBe(1);
    let calls = 0;
    const partial = trackPitchFast(melody(20), SR, { shouldCancel: () => ++calls > 1 });
    expect(partial.length).toBeLessThan(500);
  });
});

describe("analyzeMelody + renderHarmonyChannels", () => {
  const x = melody(6.4);
  const analysis = analyzeMelody(x, SR);

  it("finds the key of the melody (A major)", () => {
    expect(analysis.detected).toBe(true);
    expect(analysis.key).toBe(9);
    expect(analysis.scale).toBe("major");
  });

  it("reports no key for silence", () => {
    expect(analyzeMelody(new Float32Array(SR * 2), SR).detected).toBe(false);
  });

  it("renders one voice per interval, same length as the melody", () => {
    const voices = renderHarmonyChannels(x, SR, analysis.key, analysis.scale, analysis.frames, [2, -2], false);
    expect(voices).toHaveLength(2);
    for (const v of voices) expect(v.length).toBe(x.length);
  });

  it("the third-up voice sits a diatonic third above the melody", () => {
    const [third] = renderHarmonyChannels(x, SR, analysis.key, analysis.scale, analysis.frames, [2], false);
    // Note 4 (E4, midi 64, at 1.2-1.6 s) -> G#4 (68); note 1 (A3 at 0-0.4 s) -> C#4 (61).
    const pitchAt = (from: number, to: number) => {
      const hz = trackPitch(third.subarray(Math.floor(from * SR), Math.floor(to * SR)), SR)
        .filter((f) => f.frequencyHz !== null && f.confidence > 0.7)
        .map((f) => f.frequencyHz as number);
      return Math.round(frequencyToMidi(median(hz)));
    };
    expect(pitchAt(0.1, 0.35)).toBe(61);
    expect(pitchAt(1.3, 1.55)).toBe(68);
  });

  it("humanize detunes the voice by the per-voice cents, inside the curve", () => {
    const frames = [{ timeSec: 0, frequencyHz: 220, confidence: 1 }];
    const plain = buildHarmonyCurve(frames, 9, "major", 2)[0].targetFrequencyHz!;
    const detuned = buildHarmonyCurve(frames, 9, "major", 2, 6)[0].targetFrequencyHz!;
    expect(1200 * Math.log2(detuned / plain)).toBeCloseTo(6, 3);
  });

  it("stops between voices when cancelled", () => {
    let n = 0;
    const voices = renderHarmonyChannels(x, SR, analysis.key, analysis.scale, analysis.frames, [2, -2, 4], false, { shouldCancel: () => ++n > 1 });
    expect(voices).toHaveLength(1);
  });
});
