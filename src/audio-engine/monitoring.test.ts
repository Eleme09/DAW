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

  it("mode on always monitors an armed track, regardless of transport state", () => {
    expect(isTrackMonitoredLive(true, "on", false, false)).toBe(true);
    expect(isTrackMonitoredLive(true, "on", true, false)).toBe(true);
    expect(isTrackMonitoredLive(true, "on", true, true)).toBe(true);
  });

  it("mode auto monitors while stopped", () => {
    expect(isTrackMonitoredLive(true, "auto", false, false)).toBe(true);
  });

  it("mode auto monitors while recording, even though transport is 'playing'", () => {
    expect(isTrackMonitoredLive(true, "auto", true, true)).toBe(true);
  });

  it("mode auto does NOT monitor during plain playback (not recording)", () => {
    expect(isTrackMonitoredLive(true, "auto", true, false)).toBe(false);
  });
});
