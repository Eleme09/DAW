import { describe, expect, it } from "vitest";
import { isTrackMonitoredLive } from "./monitoring";

describe("isTrackMonitoredLive", () => {
  it("never monitors an unarmed track, regardless of mode", () => {
    expect(isTrackMonitoredLive(false, "on", false, false)).toBe(false);
    expect(isTrackMonitoredLive(false, "auto", true, true)).toBe(false);
  });

  it("mode off never monitors, even armed and recording", () => {
    expect(isTrackMonitoredLive(true, "off", false, false)).toBe(false);
    expect(isTrackMonitoredLive(true, "off", true, true)).toBe(false);
  });

  it("auto and on only open the mic during a take", () => {
    for (const mode of ["auto", "on"] as const) {
      expect(isTrackMonitoredLive(true, mode, false, false)).toBe(false);
      expect(isTrackMonitoredLive(true, mode, true, false)).toBe(false);
      expect(isTrackMonitoredLive(true, mode, true, true)).toBe(true);
    }
  });
});
