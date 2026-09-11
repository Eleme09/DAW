import { describe, expect, it } from "vitest";
import { generateMelodyEvents } from "./melodyGenerator";
import type { ChordEvent } from "@/types/beatGen";

describe("generateMelodyEvents", () => {
  it("fills a chord's full duration with 8th-note arpeggio notes", () => {
    const chord: ChordEvent = { notesMidi: [60, 64, 67], quality: "major", startBeat: 0, lengthBeats: 4 };
    const notes = generateMelodyEvents([chord]);
    expect(notes).toHaveLength(8); // 4 beats / 0.5 beat notes
    expect(notes[0].startBeat).toBe(0);
    expect(notes[notes.length - 1].startBeat + notes[notes.length - 1].lengthBeats).toBe(4);
  });

  it("only uses the chord's own tones (root/third/fifth), shifted up an octave", () => {
    const chord: ChordEvent = { notesMidi: [48, 52, 55], quality: "major", startBeat: 0, lengthBeats: 2 };
    const notes = generateMelodyEvents([chord]);
    const allowed = new Set([48 + 12, 52 + 12, 55 + 12]);
    for (const n of notes) expect(allowed.has(n.midi)).toBe(true);
  });

  it("handles multiple chords back to back without gaps or overlaps", () => {
    const chords: ChordEvent[] = [
      { notesMidi: [60, 64, 67], quality: "major", startBeat: 0, lengthBeats: 2 },
      { notesMidi: [57, 60, 64], quality: "minor", startBeat: 2, lengthBeats: 2 },
    ];
    const notes = generateMelodyEvents(chords);
    for (let i = 1; i < notes.length; i++) {
      expect(notes[i].startBeat).toBeCloseTo(notes[i - 1].startBeat + notes[i - 1].lengthBeats, 5);
    }
    expect(notes[notes.length - 1].startBeat + notes[notes.length - 1].lengthBeats).toBe(4);
  });

  it("truncates the final note to fit an odd-length chord exactly", () => {
    const chord: ChordEvent = { notesMidi: [60, 64, 67], quality: "major", startBeat: 0, lengthBeats: 1.25 };
    const notes = generateMelodyEvents([chord]);
    const lastNote = notes[notes.length - 1];
    expect(lastNote.startBeat + lastNote.lengthBeats).toBeCloseTo(1.25, 5);
  });
});
