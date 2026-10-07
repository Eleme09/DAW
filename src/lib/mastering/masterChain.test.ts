import { describe, expect, it } from "vitest";
import { MASTER_STYLE_ORDER, masteringChain, targetLufsOf } from "./masterChain";
import { cropProject, loudestWindow } from "./measureMaster";
import { createEmptyProject, createMasteringSettings, createTrack, type AudioClip } from "@/types/project";

const base = createMasteringSettings();

describe("mastering chain", () => {
  it("is the same chain (ids, order, types) for every style, so switching glides", () => {
    const shape = (style: (typeof MASTER_STYLE_ORDER)[number]) => masteringChain({ ...base, style }).map((e) => `${e.id}:${e.type}`);
    const first = shape("equilibrio");
    for (const s of MASTER_STYLE_ORDER) expect(shape(s)).toEqual(first);
    expect(first[first.length - 1]).toBe("m-lim:limiter");
  });

  it("scales the style with the intensity and adds the user's tone on top", () => {
    const eqOf = (patch: Partial<typeof base>) => {
      const eq = masteringChain({ ...base, style: "peso", ...patch })[0];
      if (eq.type !== "eq") throw new Error("eq first");
      return Object.fromEntries(eq.params.bands.map((b) => [b.id, b.gainDb]));
    };
    expect(eqOf({ intensity: 0 })["m-lo"]).toBeLessThan(eqOf({ intensity: 0.5 })["m-lo"]);
    expect(eqOf({ intensity: 1 })["m-lo"]).toBeGreaterThan(eqOf({ intensity: 0.5 })["m-lo"]);
    expect(eqOf({ lowDb: 2 })["m-lo"] - eqOf({})["m-lo"]).toBeCloseTo(2, 5);
    expect(eqOf({ midDb: -3 })["m-mid"]).toBe(-3);
  });

  it("pushes the limiter by the measured drive, under a -1 dB ceiling", () => {
    const lim = masteringChain({ ...base, driveDb: 7.5 }).at(-1)!;
    expect(lim.type === "limiter" && lim.params).toEqual({ thresholdDb: -7.5, releaseMs: 60, ceilingDb: -1 });
  });

  it("lands open styles a little under the target", () => {
    expect(targetLufsOf({ target: "fuerte", style: "equilibrio" })).toBe(-10);
    expect(targetLufsOf({ target: "fuerte", style: "abierto" })).toBe(-12);
    expect(targetLufsOf({ target: "plataformas", style: "peso" })).toBe(-14);
  });
});

describe("measuring window", () => {
  /** A fake buffer: silence with a loud stretch [loudFrom, loudTo) seconds. */
  function buffer(seconds: number, loudFrom: number, loudTo: number): AudioBuffer {
    const sr = 8000;
    const data = new Float32Array(seconds * sr);
    for (let i = loudFrom * sr; i < loudTo * sr; i++) data[i] = 0.5 * Math.sin(i / 3);
    return { sampleRate: sr, numberOfChannels: 1, length: data.length, duration: seconds, getChannelData: () => data } as unknown as AudioBuffer;
  }

  it("finds the loudest part of the song and crops the session to it", () => {
    const p = createEmptyProject();
    const t = createTrack("Beat", 0);
    const clip: AudioClip = { id: "c", trackId: t.id, sampleId: "s", name: "b", startTime: 10, duration: 60, sourceOffset: 0, gainDb: 0, fadeInSec: 0, fadeOutSec: 0, color: t.color };
    p.tracks = [{ ...t, clips: [clip] }];
    const buf = buffer(60, 30, 42); // loud from 40 s to 52 s on the timeline
    const [w0, w1] = loudestWindow(p, () => buf);
    expect(w0).toBeGreaterThanOrEqual(39);
    expect(w0).toBeLessThanOrEqual(41);
    expect(w1 - w0).toBe(12);
    const crop = cropProject(p, w0, w1);
    const c = crop.tracks[0].clips[0];
    expect(c.startTime).toBe(0);
    expect(c.duration).toBe(12);
    expect(c.sourceOffset).toBeCloseTo(w0 - 10, 5);
  });
});
