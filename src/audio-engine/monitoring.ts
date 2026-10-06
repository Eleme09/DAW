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
 *
 * The mic is only open during a take: "auto" and "on" both mean "hear
 * yourself while recording". Keeping it open while stopped (the old
 * "auto") or always (the old "on") held the phone's audio in a
 * call-style mode and paused every other app's sound.
 */
export function isTrackMonitoredLive(
  armed: boolean,
  monitorMode: MonitorMode,
  playing: boolean,
  recording: boolean
): boolean {
  void playing;
  if (!armed || monitorMode === "off") return false;
  return recording;
}
