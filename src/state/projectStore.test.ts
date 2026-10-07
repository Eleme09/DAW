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
  engine.syncMastering = vi.fn();
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

function makeClip(overrides: Partial<AudioClip> & Pick<AudioClip, "id" | "trackId">): AudioClip {
  return {
    sampleId: "sample-1",
    name: "take",
    startTime: 0,
    duration: 5,
    sourceOffset: 0,
    gainDb: 0,
    fadeInSec: 0,
    fadeOutSec: 0,
    color: "#fff",
    ...overrides,
  };
}

describe("comping (overlapping re-recorded takes)", () => {
  beforeEach(resetStore);

  it("addClip groups an overlapping clip as an alternate take instead of stacking audio", () => {
    const { addTrack, addClip } = useProjectStore.getState();
    const track = addTrack("Vocal");
    addClip(makeClip({ id: "take-1", trackId: track.id, startTime: 0, duration: 5 }));
    addClip(makeClip({ id: "take-2", trackId: track.id, startTime: 1, duration: 5 })); // overlaps take-1

    const clips = useProjectStore.getState().project.tracks[0].clips;
    expect(clips).toHaveLength(2);
    const take1 = clips.find((c) => c.id === "take-1")!;
    const take2 = clips.find((c) => c.id === "take-2")!;
    expect(take1.takeGroupId).toBeDefined();
    expect(take2.takeGroupId).toBe(take1.takeGroupId);
    expect(take1.muted).toBe(true);
    expect(take2.muted).toBe(false);
  });

  it("does not group clips on the same track that don't overlap in time", () => {
    const { addTrack, addClip } = useProjectStore.getState();
    const track = addTrack("Vocal");
    addClip(makeClip({ id: "clip-1", trackId: track.id, startTime: 0, duration: 5 }));
    addClip(makeClip({ id: "clip-2", trackId: track.id, startTime: 10, duration: 5 }));

    const clips = useProjectStore.getState().project.tracks[0].clips;
    expect(clips.every((c) => !c.takeGroupId)).toBe(true);
    expect(clips.every((c) => !c.muted)).toBe(true);
  });

  it("selectTake switches which take is active", () => {
    const { addTrack, addClip, selectTake } = useProjectStore.getState();
    const track = addTrack("Vocal");
    addClip(makeClip({ id: "take-1", trackId: track.id, startTime: 0, duration: 5 }));
    addClip(makeClip({ id: "take-2", trackId: track.id, startTime: 0, duration: 5 }));
    const groupId = useProjectStore.getState().project.tracks[0].clips[0].takeGroupId!;

    selectTake(track.id, groupId, "take-1");

    const clips = useProjectStore.getState().project.tracks[0].clips;
    expect(clips.find((c) => c.id === "take-1")?.muted).toBe(false);
    expect(clips.find((c) => c.id === "take-2")?.muted).toBe(true);
  });

  it("removeClip promotes another take when the active one is deleted", () => {
    const { addTrack, addClip, removeClip } = useProjectStore.getState();
    const track = addTrack("Vocal");
    addClip(makeClip({ id: "take-1", trackId: track.id, startTime: 0, duration: 5 }));
    addClip(makeClip({ id: "take-2", trackId: track.id, startTime: 0, duration: 5 })); // take-2 is active

    removeClip(track.id, "take-2");

    const clips = useProjectStore.getState().project.tracks[0].clips;
    expect(clips).toHaveLength(1);
    expect(clips[0].id).toBe("take-1");
    expect(clips[0].muted).toBe(false); // promoted, not left silent
  });

  it("moveClipToTrack relocates the clip, drops its take group, and adopts the target track's color", () => {
    const { addTrack, addClip, moveClipToTrack } = useProjectStore.getState();
    const source = addTrack("Vocal");
    const target = addTrack("Doble");
    addClip(makeClip({ id: "take-1", trackId: source.id, startTime: 0, duration: 5, color: "#aaa" }));
    addClip(makeClip({ id: "take-2", trackId: source.id, startTime: 0, duration: 5, color: "#aaa" }));

    moveClipToTrack(source.id, "take-2", target.id);

    const tracks = useProjectStore.getState().project.tracks;
    const sourceClips = tracks.find((t) => t.id === source.id)!.clips;
    const targetClips = tracks.find((t) => t.id === target.id)!.clips;
    expect(sourceClips).toHaveLength(1);
    expect(sourceClips[0].id).toBe("take-1");
    expect(targetClips).toHaveLength(1);
    expect(targetClips[0].id).toBe("take-2");
    expect(targetClips[0].trackId).toBe(target.id);
    expect(targetClips[0].color).toBe(target.color);
    expect(targetClips[0].takeGroupId).toBeUndefined();
  });

  it("moveClipToTrack is a no-op moving to the same track or an unknown clip/track", () => {
    const { addTrack, addClip, moveClipToTrack } = useProjectStore.getState();
    const track = addTrack("Vocal");
    addClip(makeClip({ id: "clip-1", trackId: track.id, startTime: 0, duration: 5 }));

    moveClipToTrack(track.id, "clip-1", track.id);
    expect(useProjectStore.getState().project.tracks[0].clips).toHaveLength(1);

    moveClipToTrack(track.id, "not-a-real-id", track.id);
    expect(useProjectStore.getState().project.tracks[0].clips).toHaveLength(1);

    moveClipToTrack(track.id, "clip-1", "not-a-real-track");
    const tracks = useProjectStore.getState().project.tracks;
    expect(tracks.find((t) => t.id === track.id)?.clips).toHaveLength(1);
  });

  it("splitClipAtPlayhead cuts every take in a comp stack at once, and selectTake then picks per-fragment", () => {
    const { addTrack, addClip, seek, selectTrack, splitClipAtPlayhead, selectTake } = useProjectStore.getState();
    const track = addTrack("Vocal");
    addClip(makeClip({ id: "take-1", trackId: track.id, startTime: 0, duration: 10 }));
    addClip(makeClip({ id: "take-2", trackId: track.id, startTime: 0, duration: 10 })); // take-2 active
    const groupId = useProjectStore.getState().project.tracks[0].clips[0].takeGroupId!;

    // Cutting the comp at t=5 splits BOTH stacked takes at once, same as
    // cutting a comp lane in a real DAW - not just whichever is audible.
    selectTrack(track.id);
    seek(5);
    splitClipAtPlayhead();

    let clips = useProjectStore.getState().project.tracks[0].clips;
    expect(clips).toHaveLength(4); // take-1 left/right, take-2 left/right
    expect(clips.every((c) => c.takeGroupId === groupId)).toBe(true);
    const take1Left = clips.find((c) => c.id === "take-1")!; // split keeps left clip's id
    const take2Left = clips.find((c) => c.id === "take-2")!;
    const rightHalves = clips.filter((c) => c.startTime === 5);
    expect(rightHalves).toHaveLength(2);
    const take1Right = rightHalves.find((c) => c.muted)!; // take-1 was the muted take
    const take2Right = rightHalves.find((c) => !c.muted)!; // take-2 was the active take

    // Comp: keep take-2 for the LEFT half, switch to take-1 for the RIGHT half.
    selectTake(track.id, groupId, take2Left.id);
    selectTake(track.id, groupId, take1Right.id);

    clips = useProjectStore.getState().project.tracks[0].clips;
    const byId = Object.fromEntries(clips.map((c) => [c.id, c]));
    expect(byId[take2Left.id].muted).toBe(false); // left half: take-2 audible
    expect(byId[take1Right.id].muted).toBe(false); // right half: take-1 audible
    expect(byId[take2Right.id].muted).toBe(true); // right half: take-2's own fragment now silent
    // The right-half decision must not have touched the left-half fragments.
    expect(byId[take1Left.id].muted).toBe(true); // untouched, was already the inactive take on the left
  });

  it("a third overlapping recording joins the same existing take group", () => {
    const { addTrack, addClip } = useProjectStore.getState();
    const track = addTrack("Vocal");
    addClip(makeClip({ id: "take-1", trackId: track.id, startTime: 0, duration: 5 }));
    addClip(makeClip({ id: "take-2", trackId: track.id, startTime: 0, duration: 5 }));
    const groupId = useProjectStore.getState().project.tracks[0].clips[0].takeGroupId!;

    addClip(makeClip({ id: "take-3", trackId: track.id, startTime: 0, duration: 5 }));

    const clips = useProjectStore.getState().project.tracks[0].clips;
    expect(clips.every((c) => c.takeGroupId === groupId)).toBe(true);
    expect(clips.filter((c) => !c.muted)).toHaveLength(1);
    expect(clips.find((c) => c.id === "take-3")?.muted).toBe(false);
  });
});

describe("track automation", () => {
  beforeEach(resetStore);

  it("addAutomationPoint appends a point to the given lane", () => {
    const { addTrack, addAutomationPoint } = useProjectStore.getState();
    const track = addTrack("Beat");

    addAutomationPoint(track.id, "volume", { time: 0, value: -60 });
    addAutomationPoint(track.id, "volume", { time: 4, value: 0 });

    const lane = useProjectStore.getState().project.tracks[0].automation.volume;
    expect(lane.points).toHaveLength(2);
    expect(lane.points.map((p) => p.value)).toEqual([-60, 0]);
    // the other lane is untouched
    expect(useProjectStore.getState().project.tracks[0].automation.pan.points).toHaveLength(0);
  });

  it("setAutomationLaneEnabled toggles only the targeted parameter", () => {
    const { addTrack, setAutomationLaneEnabled } = useProjectStore.getState();
    const track = addTrack("Beat");

    setAutomationLaneEnabled(track.id, "pan", true);

    const automation = useProjectStore.getState().project.tracks[0].automation;
    expect(automation.pan.enabled).toBe(true);
    expect(automation.volume.enabled).toBe(false);
  });

  it("updateAutomationPoint coalesces consecutive drags into one undo step", () => {
    const { addTrack, addAutomationPoint, updateAutomationPoint, undo } = useProjectStore.getState();
    const track = addTrack("Beat");
    addAutomationPoint(track.id, "volume", { time: 0, value: 0 });
    const pointId = useProjectStore.getState().project.tracks[0].automation.volume.points[0].id;
    const pastAfterAdd = useProjectStore.getState().past.length;

    updateAutomationPoint(track.id, "volume", pointId, { value: -10 });
    updateAutomationPoint(track.id, "volume", pointId, { value: -20 });

    expect(useProjectStore.getState().past.length).toBe(pastAfterAdd + 1);
    expect(useProjectStore.getState().project.tracks[0].automation.volume.points[0].value).toBe(-20);

    undo();
    expect(useProjectStore.getState().project.tracks[0].automation.volume.points[0].value).toBe(0);
  });

  it("removeAutomationPoint removes only the targeted point", () => {
    const { addTrack, addAutomationPoint, removeAutomationPoint } = useProjectStore.getState();
    const track = addTrack("Beat");
    addAutomationPoint(track.id, "volume", { time: 0, value: 0 });
    addAutomationPoint(track.id, "volume", { time: 4, value: -20 });
    const [first] = useProjectStore.getState().project.tracks[0].automation.volume.points;

    removeAutomationPoint(track.id, "volume", first.id);

    const remaining = useProjectStore.getState().project.tracks[0].automation.volume.points;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].value).toBe(-20);
  });
});

describe("buses and sends", () => {
  beforeEach(resetStore);

  it("addBus creates a bus and selects it", () => {
    const { addBus } = useProjectStore.getState();
    const bus = addBus("Reverb bus");

    expect(useProjectStore.getState().project.buses).toHaveLength(1);
    expect(useProjectStore.getState().project.buses[0].name).toBe("Reverb bus");
    expect(useProjectStore.getState().selectedBusId).toBe(bus.id);
  });

  it("setTrackSend creates a send on first call, updates level in place on the next", () => {
    const { addTrack, addBus, setTrackSend } = useProjectStore.getState();
    const track = addTrack("Vocal");
    const bus = addBus("Reverb bus");

    setTrackSend(track.id, bus.id, -12);
    let sends = useProjectStore.getState().project.tracks[0].sends;
    expect(sends).toHaveLength(1);
    expect(sends[0]).toMatchObject({ busId: bus.id, levelDb: -12 });

    setTrackSend(track.id, bus.id, -6);
    sends = useProjectStore.getState().project.tracks[0].sends;
    expect(sends).toHaveLength(1); // same send updated, not a second one
    expect(sends[0].levelDb).toBe(-6);
  });

  it("a track can hold sends to two different buses at once", () => {
    const { addTrack, addBus, setTrackSend } = useProjectStore.getState();
    const track = addTrack("Vocal");
    const busA = addBus("Reverb");
    const busB = addBus("Delay");

    setTrackSend(track.id, busA.id, -10);
    setTrackSend(track.id, busB.id, -20);

    const sends = useProjectStore.getState().project.tracks[0].sends;
    expect(sends).toHaveLength(2);
    expect(sends.map((s) => s.busId).sort()).toEqual([busA.id, busB.id].sort());
  });

  it("removeTrackSend removes only the targeted bus's send", () => {
    const { addTrack, addBus, setTrackSend, removeTrackSend } = useProjectStore.getState();
    const track = addTrack("Vocal");
    const busA = addBus("Reverb");
    const busB = addBus("Delay");
    setTrackSend(track.id, busA.id, -10);
    setTrackSend(track.id, busB.id, -20);

    removeTrackSend(track.id, busA.id);

    const sends = useProjectStore.getState().project.tracks[0].sends;
    expect(sends).toHaveLength(1);
    expect(sends[0].busId).toBe(busB.id);
  });

  it("removeBus cleans up every track's send pointing at it - no dangling references", () => {
    const { addTrack, addBus, setTrackSend, removeBus } = useProjectStore.getState();
    const trackA = addTrack("Vocal");
    const trackB = addTrack("Adlib");
    const bus = addBus("Reverb");
    setTrackSend(trackA.id, bus.id, -10);
    setTrackSend(trackB.id, bus.id, -8);

    removeBus(bus.id);

    const project = useProjectStore.getState().project;
    expect(project.buses).toHaveLength(0);
    expect(project.tracks.every((t) => t.sends.length === 0)).toBe(true);
  });

  it("removeBus clears selectedBusId only when the removed bus was selected", () => {
    const { addBus, removeBus, selectBus } = useProjectStore.getState();
    const busA = addBus("A");
    const busB = addBus("B");
    selectBus(busA.id);

    removeBus(busB.id);
    expect(useProjectStore.getState().selectedBusId).toBe(busA.id); // untouched

    removeBus(busA.id);
    expect(useProjectStore.getState().selectedBusId).toBeNull();
  });

  it("moveBus swaps order with its neighbor, a no-op past either end", () => {
    const { addBus, moveBus } = useProjectStore.getState();
    const busA = addBus("A");
    const busB = addBus("B");

    moveBus(busA.id, 1);
    let buses = useProjectStore.getState().project.buses;
    expect(buses.map((b) => b.id)).toEqual([busB.id, busA.id]);
    expect(buses.map((b) => b.order)).toEqual([0, 1]);

    moveBus(busB.id, -1); // already leftmost - no-op
    buses = useProjectStore.getState().project.buses;
    expect(buses.map((b) => b.id)).toEqual([busB.id, busA.id]);
  });
});

describe("placeClip (dragging a region)", () => {
  beforeEach(resetStore);

  function setup() {
    const s = useProjectStore.getState();
    const a = s.addTrack("A");
    const b = s.addTrack("B");
    const clip: AudioClip = {
      id: "c1", trackId: a.id, sampleId: "s1", name: "toma", startTime: 2, duration: 3, sourceOffset: 0,
      gainDb: 0, fadeInSec: 0, fadeOutSec: 0, color: a.color, takeGroupId: "g1",
    };
    useProjectStore.getState().addClip(clip);
    return { a, b };
  }
  const tracks = () => useProjectStore.getState().project.tracks;

  it("moves in time on the same track", () => {
    const { a } = setup();
    useProjectStore.getState().placeClip(a.id, "c1", 5.5);
    expect(tracks()[0].clips.find((c) => c.id === "c1")?.startTime).toBe(5.5);
  });

  it("moves to another track, takes its color, stays selected, and undoes in one step", () => {
    const { a, b } = setup();
    useProjectStore.getState().placeClip(a.id, "c1", 4, b.id);
    const moved = tracks()[1].clips.find((c) => c.id === "c1");
    expect(tracks()[0].clips.some((c) => c.id === "c1")).toBe(false);
    expect(moved).toMatchObject({ trackId: b.id, startTime: 4, color: b.color });
    expect(moved?.takeGroupId).toBeUndefined();
    expect(useProjectStore.getState().selectedClip).toEqual({ trackId: b.id, clipId: "c1" });
    useProjectStore.getState().undo();
    expect(tracks()[0].clips.find((c) => c.id === "c1")?.startTime).toBe(2);
    expect(tracks()[1].clips).toHaveLength(0);
  });

  it("below the last track makes a new track", () => {
    const { a } = setup();
    useProjectStore.getState().placeClip(a.id, "c1", 1, "new");
    expect(tracks()).toHaveLength(3);
    expect(tracks()[2].clips[0]).toMatchObject({ id: "c1", trackId: tracks()[2].id, startTime: 1 });
  });

  it("never goes before time 0", () => {
    const { a } = setup();
    useProjectStore.getState().placeClip(a.id, "c1", -3);
    expect(tracks()[0].clips[0].startTime).toBe(0);
  });
});
