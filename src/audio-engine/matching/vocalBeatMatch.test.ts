import { describe, expect, it } from "vitest";
import { detectBeatKey, matchVocalToBeat } from "./vocalBeatMatch";
import { midiToFrequency } from "../pitch/noteUtils";
import type { DetectedKeyResult, PitchFrame } from "@/types/pitch";

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

function frame(midi: number, confidence = 1): PitchFrame {
  return { timeSec: 0, frequencyHz: midiToFrequency(midi), confidence };
}

const C_MAJOR: DetectedKeyResult = { key: 0, scale: "major", confidence: 0.9 };
const A_MINOR: DetectedKeyResult = { key: 9, scale: "minor", confidence: 0.9 };
const F_SHARP_MAJOR: DetectedKeyResult = { key: 6, scale: "major", confidence: 0.9 };

describe("matchVocalToBeat", () => {
  it("reports compatible when vocal and beat share the exact same key", () => {
    const result = matchVocalToBeat([], C_MAJOR, C_MAJOR);
    expect(result.compatible).toBe(true);
    expect(result.message).toContain("matches");
  });

  it("reports compatible for relative major/minor pairs (C major <-> A minor)", () => {
    const result = matchVocalToBeat([], C_MAJOR, A_MINOR);
    expect(result.compatible).toBe(true);
  });

  it("reports incompatible for unrelated keys, in the brief's plain-language format", () => {
    const result = matchVocalToBeat([], C_MAJOR, F_SHARP_MAJOR);
    expect(result.compatible).toBe(false);
    expect(result.message).toBe("The beat appears to be F# major, while the vocal is centered around C major.");
  });

  it("flags a sung note that falls outside the beat's scale", () => {
    // Beat in C major; vocal sings C4 (in scale) and C#4 (not in C major).
    const vocalFrames = [frame(60), frame(61)]; // C4, C#4
    const result = matchVocalToBeat(vocalFrames, C_MAJOR, C_MAJOR);
    expect(result.notesOutsideScale).toEqual([1]); // C# = pitch class 1
  });

  it("reports no notes outside scale when the vocal stays fully in-key", () => {
    const vocalFrames = [frame(60), frame(64), frame(67)]; // C, E, G - all in C major
    const result = matchVocalToBeat(vocalFrames, C_MAJOR, C_MAJOR);
    expect(result.notesOutsideScale).toEqual([]);
  });

  it("ignores low-confidence frames when checking scale membership", () => {
    const vocalFrames = [frame(61, 0.1)]; // C#4, but low confidence
    const result = matchVocalToBeat(vocalFrames, C_MAJOR, C_MAJOR);
    expect(result.notesOutsideScale).toEqual([]);
  });
});

describe("detectBeatKey", () => {
  it("detects the key of a simple chord progression", () => {
    const cMajor = makeChord([48, 52, 55], 0.5);
    const gMajor = makeChord([43, 47, 50], 0.5);
    const full = new Float32Array(cMajor.length + gMajor.length);
    full.set(cMajor, 0);
    full.set(gMajor, cMajor.length);

    const result = detectBeatKey(full, SAMPLE_RATE);
    expect(result.key).toBe(0);
    expect(result.scale).toBe("major");
  });
});
