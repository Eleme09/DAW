import { beforeEach, describe, expect, it } from "vitest";
import { useProjectStore } from "./projectStore";
import type { AudioClip } from "@/types/project";

function resetStore() {
  useProjectStore.getState().newProject();
}

describe("splitClipAtPlayhead", () => {
  beforeEach(resetStore);

  it("splits a clip under the playhead into two contiguous clips", () => {
    const { addTrack, addClip, seek, selectTrack, splitClipAtPlayhead } = useProjectStore.getState();
    const track = addTrack("Vocal");
    selectTrack(track.id);
    const clip: AudioClip = {
      id: "clip-1",
      trackId: track.id,
      sampleId: "sample-1",
      name: "take",
      startTime: 0,
      duration: 10,
      sourceOffset: 0,
      gainDb: 0,
      fadeInSec: 0,
      fadeOutSec: 0,
      color: "#fff",
    };
    addClip(clip);
    seek(4);

    splitClipAtPlayhead();

    const clips = useProjectStore.getState().project.tracks[0].clips;
    expect(clips).toHaveLength(2);
    const [left, right] = clips;
    expect(left.startTime).toBe(0);
    expect(left.duration).toBeCloseTo(4);
    expect(right.startTime).toBeCloseTo(4);
    expect(right.duration).toBeCloseTo(6);
    expect(right.sourceOffset).toBeCloseTo(4);
    expect(right.id).not.toBe(left.id);
  });

  it("does nothing when the playhead is outside any clip", () => {
    const { addTrack, addClip, seek, selectTrack, splitClipAtPlayhead } = useProjectStore.getState();
    const track = addTrack("Vocal");
    selectTrack(track.id);
    addClip({
      id: "clip-1",
      trackId: track.id,
      sampleId: "sample-1",
      name: "take",
      startTime: 5,
      duration: 2,
      sourceOffset: 0,
      gainDb: 0,
      fadeInSec: 0,
      fadeOutSec: 0,
      color: "#fff",
    });
    seek(20);

    splitClipAtPlayhead();

    expect(useProjectStore.getState().project.tracks[0].clips).toHaveLength(1);
  });
});

describe("armTrack", () => {
  beforeEach(resetStore);

  it("keeps arming exclusive across tracks", () => {
    const { addTrack, armTrack } = useProjectStore.getState();
    const a = addTrack("A");
    const b = addTrack("B");

    armTrack(a.id);
    let tracks = useProjectStore.getState().project.tracks;
    expect(tracks.find((t) => t.id === a.id)?.armed).toBe(true);

    armTrack(b.id);
    tracks = useProjectStore.getState().project.tracks;
    expect(tracks.find((t) => t.id === a.id)?.armed).toBe(false);
    expect(tracks.find((t) => t.id === b.id)?.armed).toBe(true);
  });

  it("toggles off when arming an already-armed track", () => {
    const { addTrack, armTrack } = useProjectStore.getState();
    const a = addTrack("A");
    armTrack(a.id);
    armTrack(a.id);
    expect(useProjectStore.getState().project.tracks[0].armed).toBe(false);
  });
});
