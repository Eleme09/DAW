import { describe, expect, it } from "vitest";
import { computeChromagram, sumChroma } from "./chromagram";
import { detectKeyFromChroma } from "../pitch/keyDetection";
import { midiToFrequency } from "../pitch/noteUtils";

const SAMPLE_RATE = 44100;

function makeChord(midiNotes: number[], seconds: number, sampleRate = SAMPLE_RATE): Float32Array {
  const n = Math.floor(sampleRate * seconds);
  const data = new Float32Array(n);
  for (const midi of midiNotes) {
    const freq = midiToFrequency(midi);
    for (let i = 0; i < n; i++) data[i] += Math.sin((2 * Math.PI * freq * i) / sampleRate) / midiNotes.length;
  }
  return data;
}

describe("computeChromagram + sumChroma", () => {
  it("a C major triad (C3 E3 G3) reads C, E, G as the dominant pitch classes", () => {
    const chord = makeChord([48, 52, 55], 1); // C3 E3 G3
    const frames = computeChromagram(chord, SAMPLE_RATE);
    const chroma = sumChroma(frames);

    const top3 = chroma
      .map((energy, pc) => ({ pc, energy }))
      .sort((a, b) => b.energy - a.energy)
      .slice(0, 3)
      .map((x) => x.pc)
      .sort((a, b) => a - b);

    expect(top3).toEqual([0, 4, 7]); // C, E, G
  });

  it("feeds detectKeyFromChroma to identify the key of a I-IV-V-vi-ish progression", () => {
    // Concatenate several C-major-ish chords back to back.
    const segments = [
      makeChord([48, 52, 55], 0.5), // C
      makeChord([53, 57, 60], 0.5), // F
      makeChord([55, 59, 62], 0.5), // G
      makeChord([45, 48, 52], 0.5), // Am
    ];
    const totalLength = segments.reduce((s, seg) => s + seg.length, 0);
    const full = new Float32Array(totalLength);
    let offset = 0;
    for (const seg of segments) {
      full.set(seg, offset);
      offset += seg.length;
    }

    const frames = computeChromagram(full, SAMPLE_RATE);
    const chroma = sumChroma(frames);
    const result = detectKeyFromChroma(chroma);

    expect(result.key).toBe(0);
    expect(result.scale).toBe("major");
  });
});
