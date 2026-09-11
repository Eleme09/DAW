import { describe, expect, it } from "vitest";
import { matchChord, detectChordSegments } from "./chordDetection";
import { computeChromagram } from "./chromagram";
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

describe("matchChord", () => {
  it("identifies a C major chroma vector as C major", () => {
    const chroma = [10, 0, 0, 0, 8, 0, 0, 9, 0, 0, 0, 0]; // C, E, G strong
    const result = matchChord(chroma);
    expect(result.root).toBe(0);
    expect(result.quality).toBe("major");
  });

  it("identifies an A minor chroma vector as A minor", () => {
    const chroma = new Array(12).fill(0);
    chroma[9] = 10; // A
    chroma[0] = 8; // C
    chroma[4] = 9; // E
    const result = matchChord(chroma);
    expect(result.root).toBe(9);
    expect(result.quality).toBe("minor");
  });
});

describe("detectChordSegments", () => {
  it("detects a C major chord then an A minor chord in two consecutive segments", () => {
    const cMajor = makeChord([48, 52, 55], 1); // C3 E3 G3
    const aMinor = makeChord([45, 48, 52], 1); // A2 C3 E3
    const full = new Float32Array(cMajor.length + aMinor.length);
    full.set(cMajor, 0);
    full.set(aMinor, cMajor.length);

    const frames = computeChromagram(full, SAMPLE_RATE);
    const segments = detectChordSegments(frames, full.length / SAMPLE_RATE, 1);

    expect(segments.length).toBeGreaterThanOrEqual(2);
    expect(segments[0].root).toBe(0);
    expect(segments[0].quality).toBe("major");

    const secondSegment = segments.find((s) => s.startSec >= 1);
    expect(secondSegment?.root).toBe(9);
    expect(secondSegment?.quality).toBe("minor");
  });
});
