import { describe, expect, it } from "vitest";
import { createEmptyProject, createTrack, nextTrackColor } from "./project";

describe("createEmptyProject", () => {
  it("has sane musical defaults", () => {
    const project = createEmptyProject();
    expect(project.bpm).toBeGreaterThan(0);
    expect(project.timeSignature).toEqual([4, 4]);
    expect(project.tracks).toEqual([]);
    expect(project.loop.enabled).toBe(false);
  });

  it("assigns a unique id per project", () => {
    const a = createEmptyProject();
    const b = createEmptyProject();
    expect(a.id).not.toBe(b.id);
  });
});

describe("createTrack", () => {
  it("creates an audio track with no clips", () => {
    const track = createTrack("Vocal", 0);
    expect(track.type).toBe("audio");
    expect(track.clips).toEqual([]);
    expect(track.muted).toBe(false);
    expect(track.volumeDb).toBe(0);
  });
});

describe("nextTrackColor", () => {
  it("cycles deterministically", () => {
    const first = nextTrackColor(0);
    const eighth = nextTrackColor(8); // palette has 8 entries
    expect(first).toBe(eighth);
  });
});
