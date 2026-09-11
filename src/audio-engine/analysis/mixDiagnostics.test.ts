import { describe, expect, it } from "vitest";
import { detectGainStaging, detectMasking } from "./mixDiagnostics";
import type { TrackBandProfile } from "@/types/mixAnalysis";

function profile(
  trackId: string,
  trackName: string,
  rmsDb: number,
  bandShares: Record<string, number> | null
): TrackBandProfile {
  return { trackId, trackName, rmsDb, bandShares };
}

/** All-zero shares except the given bands, which get an equal, concentrated share. */
function concentratedShares(...bands: string[]): Record<string, number> {
  const shares: Record<string, number> = {
    subBass: 0.02,
    bass: 0.02,
    lowMid: 0.02,
    mid: 0.02,
    highMid: 0.02,
    presence: 0.02,
    sibilance: 0.02,
    air: 0.02,
  };
  for (const b of bands) shares[b] = 0.5;
  return shares;
}

describe("detectMasking", () => {
  it("flags two tracks that both concentrate energy in the same band", () => {
    const a = profile("a", "Vocal", -12, concentratedShares("mid"));
    const b = profile("b", "Synth Lead", -14, concentratedShares("mid"));
    const findings = detectMasking([a, b]);
    expect(findings).toHaveLength(1);
    expect(findings[0].band).toBe("mid");
    expect(findings[0].trackAId).toBe("a");
    expect(findings[0].trackBId).toBe("b");
    expect(findings[0].overlapScore).toBeCloseTo(0.5, 5);
  });

  it("does not flag tracks concentrated in different bands", () => {
    const a = profile("a", "Bass", -10, concentratedShares("bass"));
    const b = profile("b", "Vocal", -10, concentratedShares("presence"));
    expect(detectMasking([a, b])).toHaveLength(0);
  });

  it("does not flag a track against itself and skips silent (null-share) tracks", () => {
    const a = profile("a", "Vocal", -10, concentratedShares("mid"));
    const silent = profile("b", "Muted Track", -Infinity, null);
    expect(detectMasking([a, silent])).toHaveLength(0);
  });

  it("does not flag a broadly-balanced mix where no band is concentrated", () => {
    const flatShares: Record<string, number> = {
      subBass: 0.12,
      bass: 0.13,
      lowMid: 0.12,
      mid: 0.13,
      highMid: 0.12,
      presence: 0.13,
      sibilance: 0.12,
      air: 0.13,
    };
    const a = profile("a", "Full Mix Bus", -8, flatShares);
    const b = profile("b", "Another Bus", -8, flatShares);
    expect(detectMasking([a, b])).toHaveLength(0);
  });

  it("ranks findings by overlap score and caps the result", () => {
    const tracks: TrackBandProfile[] = [];
    // 5 tracks all concentrated in "mid" -> 10 pairs, all above the cap of 8.
    for (let i = 0; i < 5; i++) {
      tracks.push(profile(`t${i}`, `Track ${i}`, -10, concentratedShares("mid")));
    }
    const findings = detectMasking(tracks);
    expect(findings.length).toBeLessThanOrEqual(8);
    for (let i = 1; i < findings.length; i++) {
      expect(findings[i - 1].overlapScore).toBeGreaterThanOrEqual(findings[i].overlapScore);
    }
  });
});

describe("detectGainStaging", () => {
  it("flags a track well below the session's median level", () => {
    const tracks = [
      profile("a", "Beat", -12, null),
      profile("b", "Vocal", -13, null),
      profile("c", "Quiet Adlib", -28, null),
    ];
    const findings = detectGainStaging(tracks);
    expect(findings).toHaveLength(1);
    expect(findings[0].trackId).toBe("c");
    expect(findings[0].direction).toBe("quieter");
    expect(findings[0].deltaFromMedianDb).toBeLessThan(-6);
  });

  it("flags a track well above the session's median level", () => {
    const tracks = [
      profile("a", "Beat", -14, null),
      profile("b", "Vocal", -13, null),
      profile("c", "Too Hot", -2, null),
    ];
    const findings = detectGainStaging(tracks);
    expect(findings).toHaveLength(1);
    expect(findings[0].trackId).toBe("c");
    expect(findings[0].direction).toBe("louder");
  });

  it("flags nothing when every track sits within range of the median", () => {
    const tracks = [
      profile("a", "Beat", -12, null),
      profile("b", "Vocal", -13, null),
      profile("c", "Adlib", -15, null),
    ];
    expect(detectGainStaging(tracks)).toHaveLength(0);
  });

  it("excludes silent tracks from the median and from findings", () => {
    const tracks = [
      profile("a", "Beat", -12, null),
      profile("b", "Vocal", -13, null),
      profile("silent", "Muted", -Infinity, null),
    ];
    const findings = detectGainStaging(tracks);
    expect(findings.every((f) => f.trackId !== "silent")).toBe(true);
  });

  it("needs at least two audible tracks to say anything", () => {
    expect(detectGainStaging([profile("a", "Solo Track", -12, null)])).toHaveLength(0);
  });
});
