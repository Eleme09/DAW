import { describe, expect, it } from "vitest";
import { buildChordEvents, diatonicTriad, pickProgression, triadQuality } from "./progressions";

describe("pickProgression", () => {
  it("is deterministic for the same scale and seed", () => {
    expect(pickProgression("major", 7)).toEqual(pickProgression("major", 7));
    expect(pickProgression("naturalMinor", 99)).toEqual(pickProgression("naturalMinor", 99));
  });

  it("only ever returns degree indices within the 7-note scale", () => {
    for (let seed = 0; seed < 10; seed++) {
      for (const degree of pickProgression("major", seed)) {
        expect(degree).toBeGreaterThanOrEqual(0);
        expect(degree).toBeLessThan(7);
      }
      for (const degree of pickProgression("naturalMinor", seed)) {
        expect(degree).toBeGreaterThanOrEqual(0);
        expect(degree).toBeLessThan(7);
      }
    }
  });
});

describe("diatonicTriad + triadQuality", () => {
  it("builds a C major triad (C-E-G) as degree 0 of C major", () => {
    const notes = diatonicTriad(0, 0, "major", 60); // key=0 (C), octaveMidi=60 (C4)
    expect(notes).toEqual([60, 64, 67]);
    expect(triadQuality(notes)).toBe("major");
  });

  it("builds a D minor triad (D-F-A) as degree 1 of C major (ii)", () => {
    const notes = diatonicTriad(1, 0, "major", 60);
    expect(notes).toEqual([62, 65, 69]);
    expect(triadQuality(notes)).toBe("minor");
  });

  it("builds a B diminished triad (B-D-F) as degree 6 of C major (vii°)", () => {
    const notes = diatonicTriad(6, 0, "major", 60);
    expect(notes).toEqual([71, 74, 77]);
    expect(triadQuality(notes)).toBe("diminished");
  });

  it("builds an A minor triad (A-C-E) as degree 0 of A natural minor", () => {
    // octaveMidi anchors pitch class 0 (C); key=9 (A) is added on top to reach the tonic.
    const notes = diatonicTriad(0, 9, "naturalMinor", 48); // C3=48 anchor -> root A3=57
    expect(notes).toEqual([57, 60, 64]);
    expect(triadQuality(notes)).toBe("minor");
  });

  it("transposes correctly to a different key (E major, degree 0)", () => {
    const notes = diatonicTriad(0, 4, "major", 60); // key=4 (E)
    expect(notes).toEqual([64, 68, 71]);
    expect(triadQuality(notes)).toBe("major");
  });
});

describe("buildChordEvents", () => {
  it("spaces chords evenly across the given bars and covers the whole length", () => {
    const events = buildChordEvents([0, 5, 2, 6], 0, "naturalMinor", 8);
    expect(events).toHaveLength(4);
    expect(events[0].startBeat).toBe(0);
    expect(events[0].lengthBeats).toBe(8); // 8 bars / 4 chords = 2 bars = 8 beats each
    expect(events[1].startBeat).toBe(8);
    expect(events[3].startBeat + events[3].lengthBeats).toBe(32); // 8 bars * 4 beats/bar
  });

  it("assigns a quality to every generated chord", () => {
    const events = buildChordEvents([0, 3, 4, 0], 2, "major", 8);
    for (const e of events) {
      expect(["major", "minor", "diminished", "augmented"]).toContain(e.quality);
    }
  });
});
