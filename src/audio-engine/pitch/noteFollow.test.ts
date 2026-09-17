import { describe, expect, it } from "vitest";
import { buildNoteFollowCurve } from "./noteFollow";
import { frequencyToMidi, midiToFrequency } from "./noteUtils";
import type { PitchFrame } from "@/types/pitch";
import type { Note } from "@/types/project";

function frameAt(midi: number, timeSec: number, confidence = 1): PitchFrame {
  return { timeSec, frequencyHz: midiToFrequency(midi), confidence };
}

function note(pitch: number, startTime: number, duration: number): Note {
  return { id: `n-${pitch}-${startTime}`, pitch, startTime, duration, velocity: 0.8 };
}

describe("buildNoteFollowCurve", () => {
  it("corrects toward the pitch of the note active at each frame's time, ignoring what was actually detected", () => {
    const notes = [note(60, 0, 0.5), note(64, 0.5, 0.5)]; // C4 then E4
    const frames = [frameAt(61, 0.1), frameAt(63, 0.6)]; // sung slightly off both times
    const curve = buildNoteFollowCurve(frames, notes);
    expect(frequencyToMidi(curve[0].targetFrequencyHz!)).toBeCloseTo(60, 3);
    expect(frequencyToMidi(curve[1].targetFrequencyHz!)).toBeCloseTo(64, 3);
  });

  it("leaves frames with no active note uncorrected (a gap in the pattern), not held on the previous note", () => {
    const notes = [note(60, 0, 0.3)]; // only covers 0..0.3
    const frames = [frameAt(60, 0.1), frameAt(60, 0.5)]; // second frame is past the note
    const curve = buildNoteFollowCurve(frames, notes);
    expect(curve[0].targetFrequencyHz).not.toBeNull();
    expect(curve[1].targetFrequencyHz).toBeNull();
  });

  it("leaves unvoiced frames uncorrected regardless of the piano-roll pattern", () => {
    const notes = [note(60, 0, 1)];
    const frames: PitchFrame[] = [{ timeSec: 0.1, frequencyHz: null, confidence: 0 }];
    const curve = buildNoteFollowCurve(frames, notes);
    expect(curve[0].targetFrequencyHz).toBeNull();
  });

  it("with no notes at all, every voiced frame is left uncorrected", () => {
    const curve = buildNoteFollowCurve([frameAt(60, 0), frameAt(62, 0.5)], []);
    expect(curve.every((f) => f.targetFrequencyHz === null)).toBe(true);
  });

  it("works with unsorted note input (sorts internally)", () => {
    const notes = [note(64, 0.5, 0.5), note(60, 0, 0.5)];
    const curve = buildNoteFollowCurve([frameAt(61, 0.1)], notes);
    expect(frequencyToMidi(curve[0].targetFrequencyHz!)).toBeCloseTo(60, 3);
  });
});
