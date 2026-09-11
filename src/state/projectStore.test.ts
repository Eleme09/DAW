import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectStore } from "./projectStore";
import type { AudioClip } from "@/types/project";

// The Vitest environment is plain Node (no DOM/Web Audio globals — see
// ARCHITECTURE.md), so AudioEngine's real syncTracks/syncMasterInserts
// (which lazily construct a real AudioContext) can't run here. undo/redo
// call them to keep the live audio graph in sync after a history jump,
// which is real, necessary behavior in the browser — just not exercisable
// in this environment. Patch only those two on the real singleton so
// everything else (onTimeUpdate, seek, etc., already exercised by the
// existing tests below) keeps its real implementation. vi.mock is hoisted
// above the imports above, so useProjectStore already sees this mock.
vi.mock("@/audio-engine/AudioEngine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/audio-engine/AudioEngine")>();
  const engine = actual.getAudioEngine();
  engine.syncTracks = vi.fn();
  engine.syncMasterInserts = vi.fn();
  return { ...actual, getAudioEngine: () => engine };
});

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

describe("undo/redo", () => {
  beforeEach(resetStore);

  it("undoes and redoes a discrete action", () => {
    const { addTrack, undo, redo } = useProjectStore.getState();
    addTrack("A");
    expect(useProjectStore.getState().project.tracks).toHaveLength(1);

    undo();
    expect(useProjectStore.getState().project.tracks).toHaveLength(0);

    redo();
    expect(useProjectStore.getState().project.tracks).toHaveLength(1);
    expect(useProjectStore.getState().project.tracks[0].name).toBe("A");
  });

  it("undo/redo are no-ops at the ends of history", () => {
    const { undo, redo, addTrack } = useProjectStore.getState();
    undo(); // nothing to undo yet
    expect(useProjectStore.getState().project.tracks).toHaveLength(0);

    addTrack("A");
    redo(); // nothing to redo yet
    expect(useProjectStore.getState().project.tracks).toHaveLength(1);
  });

  it("a new action clears redo history", () => {
    const { addTrack, undo, redo } = useProjectStore.getState();
    addTrack("A");
    undo();
    addTrack("B");

    expect(useProjectStore.getState().future).toHaveLength(0);
    redo();
    expect(useProjectStore.getState().project.tracks).toHaveLength(1);
    expect(useProjectStore.getState().project.tracks[0].name).toBe("B");
  });

  it("coalesces consecutive fader drags into a single undo step", () => {
    const { addTrack, updateTrack, undo } = useProjectStore.getState();
    const track = addTrack("A");
    const pastAfterAdd = useProjectStore.getState().past.length;

    updateTrack(track.id, { volumeDb: -10 });
    updateTrack(track.id, { volumeDb: -20 });
    updateTrack(track.id, { volumeDb: -30 });

    expect(useProjectStore.getState().past.length).toBe(pastAfterAdd + 1);
    expect(useProjectStore.getState().project.tracks[0].volumeDb).toBe(-30);

    undo();
    expect(useProjectStore.getState().project.tracks[0].volumeDb).toBe(0);
  });

  it("does not coalesce a discrete action into a preceding continuous one", () => {
    const { addTrack, updateTrack, removeTrack, undo } = useProjectStore.getState();
    const track = addTrack("A");
    updateTrack(track.id, { volumeDb: -10 });
    removeTrack(track.id);

    expect(useProjectStore.getState().project.tracks).toHaveLength(0);
    undo();
    expect(useProjectStore.getState().project.tracks).toHaveLength(1);
    expect(useProjectStore.getState().project.tracks[0].volumeDb).toBe(-10);
  });

  it("does not coalesce a discrete mute toggle with an unrelated patch shape", () => {
    const { addTrack, updateTrack, undo } = useProjectStore.getState();
    const track = addTrack("A");
    updateTrack(track.id, { muted: true });
    updateTrack(track.id, { muted: false });

    undo();
    expect(useProjectStore.getState().project.tracks[0].muted).toBe(true);
  });

  it("newProject clears undo/redo history", () => {
    const { addTrack, newProject } = useProjectStore.getState();
    addTrack("A");
    expect(useProjectStore.getState().past.length).toBeGreaterThan(0);

    newProject();
    expect(useProjectStore.getState().past).toHaveLength(0);
    expect(useProjectStore.getState().future).toHaveLength(0);
  });
});
