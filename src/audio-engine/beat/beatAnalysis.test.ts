import { describe, expect, it } from "vitest";
import { analyzeBeat, camelotCode } from "./beatAnalysis";

/** A tiny trap-like loop: kick on 1 and 3, hats on eighths, an 808 on the
 * root and chords of a minor key (i - VI - iv - V). */
function beat(bpm: number, tonic: number, seconds = 24, sr = 22050): Float32Array {
  const x = new Float32Array(seconds * sr);
  const beatSec = 60 / bpm;
  const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
  const root = 45 + tonic - 9; // tonic near A2
  const prog = [
    [0, 3, 7],
    [8, 12, 15],
    [5, 8, 12],
    [7, 11, 14],
  ];
  for (let i = 0; i < x.length; i++) {
    const t = i / sr;
    const b = t / beatSec;
    const bar = Math.floor(b / 4) % 4;
    const inBeat = (b % 1) * beatSec;
    const inEighth = ((b * 2) % 1) * (beatSec / 2);
    let s = 0;
    if (Math.floor(b) % 2 === 0) s += Math.sin(2 * Math.PI * 55 * inBeat) * Math.exp(-inBeat * 18) * 0.8;
    s += (Math.random() * 2 - 1) * Math.exp(-inEighth * 90) * 0.15;
    s += Math.sin(2 * Math.PI * midi(root + prog[bar][0] - 12) * t) * 0.25;
    for (const n of prog[bar]) s += Math.sin(2 * Math.PI * midi(root + 12 + n) * t) * 0.06 + Math.sin(4 * Math.PI * midi(root + 12 + n) * t) * 0.02;
    x[i] = s * 0.5;
  }
  return x;
}

describe("beat analysis", () => {
  it.each([
    [140, 9],
    [95, 2],
    [150, 6],
  ])("%s BPM, tonic %s minor", (bpm, tonic) => {
    const a = analyzeBeat(beat(bpm, tonic), 22050);
    expect(a.bpm).toBeCloseTo(bpm, 0);
    expect(a.key).toEqual({ tonic, scale: "minor" });
  });

  it("names keys in Camelot", () => {
    expect(camelotCode({ tonic: 9, scale: "minor" })).toBe("8A");
    expect(camelotCode({ tonic: 0, scale: "major" })).toBe("8B");
    expect(camelotCode({ tonic: 7, scale: "major" })).toBe("9B");
    expect(camelotCode({ tonic: 4, scale: "minor" })).toBe("9A");
  });
});
