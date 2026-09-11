import { describe, expect, it } from "vitest";
import { generateBassEvents } from "./bassGenerator";
import type { ChordEvent, DrumHitEvent } from "@/types/beatGen";

function chord(startBeat: number, lengthBeats: number, root = 60): ChordEvent {
  return { notesMidi: [root, root + 4, root + 7], quality: "major", startBeat, lengthBeats };
}

describe("generateBassEvents", () => {
  it("fires a bass note on every kick within a chord's span, two octaves below the root", () => {
    const chords = [chord(0, 8, 60)];
    const drums: DrumHitEvent[] = [
      { type: "kick", startBeat: 0, velocity: 1 },
      { type: "kick", startBeat: 3, velocity: 0.8 },
      { type: "snare", startBeat: 4, velocity: 0.9 }, // not a kick, should be ignored
    ];
    const bass = generateBassEvents(chords, drums);
    expect(bass).toHaveLength(2);
    expect(bass[0].midi).toBe(36); // 60 - 24
    expect(bass[0].startBeat).toBe(0);
    expect(bass[0].lengthBeats).toBe(3); // sustains until the next kick
    expect(bass[1].startBeat).toBe(3);
    expect(bass[1].lengthBeats).toBe(5); // sustains to the chord's end (8)
  });

  it("holds one sustained note when no kick falls within the chord", () => {
    const chords = [chord(0, 4, 48)];
    const bass = generateBassEvents(chords, []);
    expect(bass).toHaveLength(1);
    expect(bass[0].midi).toBe(24);
    expect(bass[0].startBeat).toBe(0);
    expect(bass[0].lengthBeats).toBe(4);
  });

  it("only counts kicks that fall inside each chord's own span", () => {
    const chords = [chord(0, 4, 60), chord(4, 4, 48)];
    const drums: DrumHitEvent[] = [
      { type: "kick", startBeat: 0, velocity: 1 },
      { type: "kick", startBeat: 4, velocity: 1 },
      { type: "kick", startBeat: 6, velocity: 1 },
    ];
    const bass = generateBassEvents(chords, drums);
    expect(bass).toHaveLength(3);
    expect(bass[0].midi).toBe(36); // from the first chord (root 60)
    expect(bass[1].midi).toBe(24); // from the second chord (root 48)
    expect(bass[2].midi).toBe(24);
  });
});
