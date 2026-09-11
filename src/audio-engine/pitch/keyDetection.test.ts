import { describe, expect, it } from "vitest";
import { detectKey, detectKeyFromChroma } from "./keyDetection";
import type { PitchFrame } from "@/types/pitch";

describe("detectKeyFromChroma", () => {
  it("detects C major from a C-major-weighted chroma vector", () => {
    // Tonic/dominant/mediant emphasized, matching how real melodies behave.
    const chroma = [10, 0, 3, 0, 5, 2, 0, 7, 0, 2, 0, 3]; // C D E F G A B weighted, C/G strongest
    const result = detectKeyFromChroma(chroma);
    expect(result.key).toBe(0);
    expect(result.scale).toBe("major");
  });

  it("detects a transposed key (G major) from a rotated chroma vector", () => {
    const cMajorChroma = [10, 0, 3, 0, 5, 2, 0, 7, 0, 2, 0, 3];
    // Rotate up by 7 semitones (C -> G): pitch class i moves to (i+7)%12.
    const gMajorChroma = new Array(12).fill(0);
    for (let i = 0; i < 12; i++) gMajorChroma[(i + 7) % 12] = cMajorChroma[i];
    const result = detectKeyFromChroma(gMajorChroma);
    expect(result.key).toBe(7);
    expect(result.scale).toBe("major");
  });

  it("returns a confidence score, not a boolean", () => {
    const chroma = [10, 0, 3, 0, 5, 2, 0, 7, 0, 2, 0, 3];
    const result = detectKeyFromChroma(chroma);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});

describe("detectKey (from pitch frames)", () => {
  it("detects C major from frames concentrated on C major pitch classes", () => {
    const notesHz = [261.63, 261.63, 329.63, 392.0, 261.63, 392.0]; // C4 C4 E4 G4 C4 G4
    const frames: PitchFrame[] = notesHz.map((hz, i) => ({ timeSec: i * 0.1, frequencyHz: hz, confidence: 1 }));
    const result = detectKey(frames);
    expect(result.key).toBe(0);
    expect(result.scale).toBe("major");
  });
});
