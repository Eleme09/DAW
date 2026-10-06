import { describe, expect, it } from "vitest";
import { createTrack, type AudioClip, type Track } from "@/types/project";
import { applyMixPlan, guessRoles, planMix, SHARED_REVERB_BUS, type TrackFacts } from "./autoMix";
import { createEmptyProject } from "@/types/project";

function clip(track: Track, start: number, duration: number): AudioClip {
  return { id: crypto.randomUUID(), trackId: track.id, sampleId: "s", name: "c", startTime: start, duration, sourceOffset: 0, gainDb: 0, fadeInSec: 0, fadeOutSec: 0, color: track.color };
}

function setup() {
  const beat = createTrack("Mi beat", 0);
  beat.clips = [clip(beat, 0, 150)];
  const v1 = createTrack("Voz 1", 1);
  v1.clips = [clip(v1, 10, 40), clip(v1, 70, 40)];
  const v2 = createTrack("Voz 2", 2);
  v2.clips = [clip(v2, 50, 20)]; // a verse between v1's parts
  const ad = createTrack("Adlibs", 3);
  ad.clips = [clip(ad, 20, 5), clip(ad, 80, 5)];
  const facts = new Map<string, TrackFacts>([
    [beat.id, { trackId: beat.id, lufs: -8, stereo: true, seconds: 150, recorded: false, lowRatio: 0.79, silentRatio: 0.01 }],
    [v1.id, { trackId: v1.id, lufs: -11, stereo: false, seconds: 80, recorded: true, lowRatio: 0.02, silentRatio: 0.5 }],
    [v2.id, { trackId: v2.id, lufs: -15, stereo: false, seconds: 20, recorded: true, lowRatio: 0.02, silentRatio: 0.6 }],
    [ad.id, { trackId: ad.id, lufs: -12, stereo: false, seconds: 10, recorded: true, lowRatio: 0.03, silentRatio: 0.8 }],
  ]);
  return { tracks: [beat, v1, v2, ad], facts, beat, v1, v2, ad };
}

describe("automezcla", () => {
  it("an imported vocal (dual-mono, gaps, no lows) is not taken for the beat", () => {
    const { tracks, facts, v1 } = setup();
    facts.set(v1.id, { ...facts.get(v1.id)!, recorded: false, stereo: true });
    expect(guessRoles(tracks, facts).get(v1.id)).toBe("lead");
  });

  it("tells the beat, the lead (and its other parts) and the ad-libs apart", () => {
    const { tracks, facts, beat, v1, v2, ad } = setup();
    const roles = guessRoles(tracks, facts);
    expect(roles.get(beat.id)).toBe("beat");
    expect(roles.get(v1.id)).toBe("lead");
    expect(roles.get(v2.id)).toBe("lead");
    expect(roles.get(ad.id)).toBe("adlib");
  });

  it("levels by measured loudness: beat -14 LUFS, lead 1.5 over it, ad-libs under", () => {
    const { tracks, facts, beat, v1, v2, ad } = setup();
    const plan = planMix(tracks, facts, guessRoles(tracks, facts));
    const by = new Map(plan.map((p) => [p.trackId, p]));
    expect(by.get(beat.id)!.volumeDb).toBeCloseTo(-6, 5); // -8 -> -14
    expect(by.get(v1.id)!.volumeDb).toBeCloseTo(-1.5, 5); // -11 -> -12.5
    expect(by.get(v2.id)!.volumeDb).toBeCloseTo(2.5, 5); // the quieter part of the lead comes up
    expect(by.get(ad.id)!.volumeDb).toBeCloseTo(-5.5, 5); // -12 -> -17.5
    expect(Math.abs(by.get(ad.id)!.pan)).toBeGreaterThan(0.2);
    expect(by.get(beat.id)!.reverbSendDb).toBeNull();
    expect(by.get(v1.id)!.reverbSendDb).not.toBeNull();
  });

  it("applies in one go: faders, pans, one shared reverb bus with sends", () => {
    const { tracks, facts } = setup();
    const project = { ...createEmptyProject("t"), tracks };
    const next = applyMixPlan(project, planMix(tracks, facts, guessRoles(tracks, facts)));
    const buses = next.buses.filter((b) => b.name === SHARED_REVERB_BUS);
    expect(buses).toHaveLength(1);
    expect(buses[0].inserts[0].type).toBe("reverb");
    expect(next.tracks.filter((t) => t.sends.some((s) => s.busId === buses[0].id))).toHaveLength(3);
    // applying again reuses the bus
    const again = applyMixPlan(next, planMix(next.tracks, facts, guessRoles(next.tracks, facts)));
    expect(again.buses.filter((b) => b.name === SHARED_REVERB_BUS)).toHaveLength(1);
  });
});
