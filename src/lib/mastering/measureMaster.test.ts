import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyProject, createMasteringSettings, createTrack, type AudioClip } from "@/types/project";

const bounce = vi.fn();
const master = vi.fn();
vi.mock("@/audio-engine/bounce", () => ({ bounceProject: (...a: unknown[]) => bounce(...a) }));
vi.mock("@/audio-engine/mastering/renderMastering", () => ({ renderMastering: (...a: unknown[]) => master(...a) }));
vi.mock("@/lib/mix/measureMix", () => ({ stereoLufs: () => -18 }));

import { measureMaster, type DryMixCache } from "./measureMaster";

function session() {
  const p = createEmptyProject();
  const t = createTrack("Beat", 0);
  const clip: AudioClip = { id: "c", trackId: t.id, sampleId: "s", name: "b", startTime: 0, duration: 20, sourceOffset: 0, gainDb: 0, fadeInSec: 0, fadeOutSec: 0, color: t.color };
  p.tracks = [{ ...t, clips: [clip] }];
  return p;
}

/** A buffer stand-in with a flat signal (peakDb reads its channel data). */
const fakeBuffer = () =>
  ({ sampleRate: 8000, numberOfChannels: 1, length: 8, duration: 0.001, getChannelData: () => new Float32Array(8).fill(0.1) }) as unknown as AudioBuffer;
const getBuffer = () => fakeBuffer();

describe("measureMaster scheduling", () => {
  beforeEach(() => {
    bounce.mockReset();
    master.mockReset();
    bounce.mockImplementation(() => new Promise((r) => setTimeout(() => r(fakeBuffer()), 30)));
    master.mockImplementation(() => Promise.resolve(fakeBuffer()));
  });

  it("renders the session once however many measurements ask while it renders", async () => {
    const p = session();
    const s = createMasteringSettings();
    const cache = { current: null as DryMixCache | null };
    // six style taps in a row, each asking before the first render is done
    const runs = await Promise.all([1, 2, 3, 4, 5, 6].map(() => measureMaster(p, s, getBuffer, cache)));
    expect(bounce).toHaveBeenCalledTimes(1);
    expect(runs.every((r) => r !== null)).toBe(true);
  });

  it("reuses the cached render when only the mastering changes", async () => {
    const p = session();
    const cache = { current: null as DryMixCache | null };
    await measureMaster(p, createMasteringSettings(), getBuffer, cache);
    await measureMaster(p, { ...createMasteringSettings(), style: "peso" }, getBuffer, cache);
    expect(bounce).toHaveBeenCalledTimes(1);
  });

  it("two different session states never render side by side", async () => {
    const a = session();
    const b = { ...session(), bpm: 90, tracks: session().tracks.map((t) => ({ ...t, volumeDb: -5 })) };
    let running = 0;
    let maxRunning = 0;
    bounce.mockImplementation(async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 30));
      running--;
      return fakeBuffer();
    });
    await Promise.all([measureMaster(a, createMasteringSettings(), getBuffer), measureMaster(b, createMasteringSettings(), getBuffer)]);
    expect(bounce).toHaveBeenCalledTimes(2);
    expect(maxRunning).toBe(1);
  });

  it("stops before the next render once it is no longer wanted", async () => {
    const p = session();
    let wanted = true;
    master.mockImplementation(async () => {
      wanted = false; // the music starts during the first master render
      return fakeBuffer();
    });
    const r = await measureMaster(p, createMasteringSettings(), getBuffer, { current: null }, () => wanted);
    expect(r).toBeNull();
    expect(master).toHaveBeenCalledTimes(1);
  });
});
