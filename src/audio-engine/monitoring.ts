import type { MonitorMode } from "@/types/project";

/**
 * Whether a track's live mic input is actually audible at the output right
 * now - not just "the user configured monitoring on for this track". Single
 * source of truth for that question, shared by AudioEngine's real routing
 * decision (private shouldMonitorTrack, which used to inline this same
 * switch) and any UI that wants to claim "you can hear your mic right now"
 * instead of re-deriving an approximation from armed+mode alone (which,
 * before this function existed, silently ignored "auto" mode's dependency
 * on transport state and so overstated live monitoring during playback -
 * see TrackHeader.tsx's monitoringLive fix in PROGRESS.md).
 */
export function isTrackMonitoredLive(
  armed: boolean,
  monitorMode: MonitorMode,
  playing: boolean,
  recording: boolean
): boolean {
  if (!armed) return false;
  switch (monitorMode) {
    case "off":
      return false;
    case "on":
      return true;
    case "auto":
      return !playing || recording;
  }
}
