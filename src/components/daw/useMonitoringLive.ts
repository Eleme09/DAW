"use client";

import { useEffect, useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { isTrackMonitoredLive } from "@/audio-engine/monitoring";
import { likelyUsingHeadphones } from "@/lib/audio/outputHeuristics";
import { useProjectStore } from "@/state/projectStore";
import type { MonitorMode } from "@/types/project";

/**
 * The real "is this track's mic audible right now" state, plus the
 * feedback-risk heuristic that depends on it - shared by every surface
 * that shows arm/monitor controls for a track (TrackHeader, VozPanel) so
 * there's exactly one place computing this, not one per surface quietly
 * drifting from AudioEngine's own routing decision (see monitoring.ts's
 * doc comment for the bug that caused before this was centralized).
 *
 * Takes the two relevant fields directly rather than a whole `Track` so a
 * caller that might not have a track selected yet (VozPanel's empty
 * states) can still call this unconditionally - `armed: false` naturally
 * reads as "not monitoring", no hook-order gymnastics needed.
 */
export function useMonitoringLive(armed: boolean, monitorMode: MonitorMode) {
  const isRecording = useProjectStore((s) => s.isRecording);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const [likelyHeadphones, setLikelyHeadphones] = useState<boolean | null>(null);
  const monitoringLive = isTrackMonitoredLive(armed, monitorMode, isPlaying, isRecording);

  useEffect(() => {
    if (!monitoringLive) return;
    let cancelled = false;
    const engine = getAudioEngine();
    const check = () => {
      void engine.listOutputDevices().then((devices) => {
        if (!cancelled) setLikelyHeadphones(likelyUsingHeadphones(devices));
      });
    };
    check();
    navigator.mediaDevices?.addEventListener("devicechange", check);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener("devicechange", check);
    };
  }, [monitoringLive]);

  return { monitoringLive, likelyHeadphones, isRecording, isPlaying };
}

