import { describe, expect, it } from "vitest";
import { reconstructBassEvents, reconstructChordEvents, reconstructDrumEvents } from "./reconstructBeat";
import type { BassNote, ChordSegment, DrumHit } from "@/types/beat";

describe("reconstructDrumEvents", () => {
  it("converts seconds to beats using the detected BPM", () => {
    const hits: DrumHit[] = [{ timeSec: 1, type: "kick", confidence: 0.9 }];
    const [event] = reconstructDrumEvents(hits, 120); // 120 BPM = 2 beats/sec
    expect(event.startBeat).toBeCloseTo(2, 5);
  });

  it("drops 'other' hits — only kick/snare/hihat are reconstructable", () => {
    const hits: DrumHit[] = [
      { timeSec: 0, type: "kick", confidence: 0.9 },
      { timeSec: 0.5, type: "other", confidence: 0.9 },
    ];
    const events = reconstructDrumEvents(hits, 120);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("kick");
  });

  it("carries detection confidence through as velocity, floored at 0.3", () => {
    const hits: DrumHit[] = [
      { timeSec: 0, type: "snare", confidence: 0.95 },
      { timeSec: 1, type: "snare", confidence: 0.05 },
    ];
    const events = reconstructDrumEvents(hits, 120);
    expect(events[0].velocity).toBeCloseTo(0.95, 5);
    expect(events[1].velocity).toBe(0.3);
  });
});

describe("reconstructChordEvents", () => {
  it("builds a major triad for a major-quality segment", () => {
    const segments: ChordSegment[] = [{ startSec: 0, endSec: 1, root: 0, quality: "major", confidence: 0.8 }];
    const [chord] = reconstructChordEvents(segments, 120, 48);
    expect(chord.notesMidi).toEqual([48, 52, 55]); // C-E-G
    expect(chord.quality).toBe("major");
  });

  it("builds a minor triad for a minor-quality segment", () => {
    const segments: ChordSegment[] = [{ startSec: 0, endSec: 1, root: 9, quality: "minor", confidence: 0.8 }];
    const [chord] = reconstructChordEvents(segments, 120, 48);
    expect(chord.notesMidi).toEqual([57, 60, 64]); // A-C-E
    expect(chord.quality).toBe("minor");
  });

  it("converts segment start/end seconds into startBeat/lengthBeats", () => {
    const segments: ChordSegment[] = [{ startSec: 2, endSec: 4, root: 0, quality: "major", confidence: 0.8 }];
    const [chord] = reconstructChordEvents(segments, 60, 48); // 60 BPM = 1 beat/sec
    expect(chord.startBeat).toBeCloseTo(2, 5);
    expect(chord.lengthBeats).toBeCloseTo(2, 5);
  });
});

describe("reconstructBassEvents", () => {
  function frame(timeSec: number, freqHz: number | null): BassNote {
    return { timeSec, frequencyHz: freqHz };
  }

  it("groups consecutive frames at the same pitch into one held note", () => {
    const freq = 440; // A4
    const frames = [frame(0, freq), frame(0.05, freq), frame(0.1, freq), frame(0.15, freq)];
    const events = reconstructBassEvents(frames, 120);
    expect(events).toHaveLength(1);
    expect(events[0].midi).toBe(69); // A4 = MIDI 69
    expect(events[0].startBeat).toBeCloseTo(0, 5);
  });

  it("splits into separate notes when the pitch jumps by more than the tolerance", () => {
    const frames = [
      frame(0, 440), // A4, midi 69
      frame(0.05, 440),
      frame(0.1, 493.88), // B4, midi 71 — more than a whole tone above the tolerance
      frame(0.15, 493.88),
    ];
    const events = reconstructBassEvents(frames, 120);
    expect(events).toHaveLength(2);
    expect(events[0].midi).toBe(69);
    expect(events[1].midi).toBe(71);
  });

  it("ends a note on a long unvoiced gap but not on a brief tracking dropout", () => {
    const frames = [
      frame(0, 440),
      frame(0.05, null), // brief dropout — should not split
      frame(0.1, 440),
      frame(0.5, null), // long gap — should end the note here
      frame(1.0, 440), // a new note starts later
    ];
    const events = reconstructBassEvents(frames, 120);
    expect(events).toHaveLength(2);
  });

  it("returns nothing for a fully unvoiced bass line", () => {
    const frames = [frame(0, null), frame(0.1, null)];
    expect(reconstructBassEvents(frames, 120)).toHaveLength(0);
  });

  it("returns nothing for an empty bass line", () => {
    expect(reconstructBassEvents([], 120)).toHaveLength(0);
  });
});
