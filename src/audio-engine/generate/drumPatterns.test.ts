import { describe, expect, it } from "vitest";
import { generateDrumEvents } from "./drumPatterns";

describe("generateDrumEvents", () => {
  it("is deterministic for the same seed", () => {
    const a = generateDrumEvents("trap", "aggressive", 4, 7);
    const b = generateDrumEvents("trap", "aggressive", 4, 7);
    expect(a).toEqual(b);
  });

  it("places at least one kick per bar for every genre", () => {
    for (const genre of ["trap", "boomBap", "dance", "halfTime"] as const) {
      const events = generateDrumEvents(genre, "chill", 4, 1);
      const kicksByBar = new Set(events.filter((e) => e.type === "kick").map((e) => Math.floor(e.startBeat / 4)));
      expect(kicksByBar.size).toBe(4);
    }
  });

  it("repeats the same one-bar pattern across bars when there's no roll variation", () => {
    // chill mood has a low roll probability; use a seed that produces no rolls for boomBap (no rolls ever, any genre besides trap).
    const events = generateDrumEvents("boomBap", "chill", 3, 5);
    const barsSeen = new Set(events.map((e) => Math.floor(e.startBeat / 4)));
    expect(barsSeen.size).toBe(3);
    // Same number of hits in every bar for a non-trap genre (no roll logic applies).
    const countsPerBar = [0, 1, 2].map(
      (bar) => events.filter((e) => Math.floor(e.startBeat / 4) === bar).length
    );
    expect(countsPerBar[0]).toBe(countsPerBar[1]);
    expect(countsPerBar[1]).toBe(countsPerBar[2]);
  });

  it("never generates snare hits for the four-on-the-floor dance pattern", () => {
    const events = generateDrumEvents("dance", "bright", 4, 3);
    expect(events.some((e) => e.type === "snare")).toBe(false);
  });

  it("only trap ever produces roll-extension hihat hits at half-step positions", () => {
    for (const genre of ["boomBap", "dance", "halfTime"] as const) {
      const events = generateDrumEvents(genre, "aggressive", 8, 42);
      expect(events.every((e) => Number.isInteger(e.startBeat * 4))).toBe(true); // no fractional 32nd-note steps
    }
  });

  it("returns events sorted by startBeat", () => {
    const events = generateDrumEvents("trap", "aggressive", 4, 99);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].startBeat).toBeGreaterThanOrEqual(events[i - 1].startBeat);
    }
  });
});
