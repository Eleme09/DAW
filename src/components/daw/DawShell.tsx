"use client";

import { useEffect } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { useProjectStore } from "@/state/projectStore";
import { TransportBar } from "./TransportBar";
import { BrowserPanel } from "./BrowserPanel";
import { Timeline } from "./Timeline/Timeline";
import { MixerPanel } from "./Mixer/MixerPanel";
import { EffectsRackPanel } from "./EffectsRack/EffectsRackPanel";

export function DawShell() {
  const tracks = useProjectStore((s) => s.project.tracks);
  const masterInserts = useProjectStore((s) => s.project.masterInserts);

  // Keep the audio graph in sync with track state even before the user hits
  // play, so mixer meters/pan/volume are live immediately.
  useEffect(() => {
    getAudioEngine().syncTracks(tracks);
  }, [tracks]);

  useEffect(() => {
    getAudioEngine().syncMasterInserts(masterInserts);
  }, [masterInserts]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        useProjectStore.getState().splitClipAtPlayhead();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-neutral-950 text-neutral-100">
      <TransportBar />
      <div className="flex flex-1 overflow-hidden">
        <BrowserPanel />
        <Timeline />
        <EffectsRackPanel />
      </div>
      <MixerPanel />
    </div>
  );
}
