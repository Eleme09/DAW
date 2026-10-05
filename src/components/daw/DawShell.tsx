"use client";

import { useEffect, useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { useProjectStore } from "@/state/projectStore";
import { TransportBar } from "./TransportBar";
import { BrowserPanel } from "./BrowserPanel";
import { Timeline } from "./Timeline/Timeline";
import { MixerPanel } from "./Mixer/MixerPanel";
import { EffectsRackPanel } from "./EffectsRack/EffectsRackPanel";
import { AutomationEditor } from "./Automation/AutomationEditor";
import { ProjectHomeScreen } from "./ProjectHomeScreen";
import { MobileStudio } from "./MobileStudio";

const DESKTOP_QUERY = "(min-width: 768px)";

/** Phone and desktop get different Studio layouts (BandLab's mobile Studio is
 * one screen with the timeline always present - see MobileStudio), so this
 * picks one instead of hiding duplicate DOM with CSS. DawShell is client-only
 * (ssr: false), so reading matchMedia in the initializer is safe. */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}

export function DawShell() {
  const projectOpen = useProjectStore((s) => s.projectOpen);
  const tracks = useProjectStore((s) => s.project.tracks);
  const buses = useProjectStore((s) => s.project.buses);
  const masterInserts = useProjectStore((s) => s.project.masterInserts);
  const masterVolumeDb = useProjectStore((s) => s.project.masterVolumeDb);
  const isDesktop = useIsDesktop();

  // Keep the audio graph in sync with track state even before the user hits
  // play, so mixer meters/pan/volume are live immediately.
  useEffect(() => {
    getAudioEngine().syncTracks(tracks, buses);
  }, [tracks, buses]);

  useEffect(() => {
    getAudioEngine().syncMasterInserts(masterInserts);
  }, [masterInserts]);

  useEffect(() => {
    getAudioEngine().setMasterVolume(masterVolumeDb);
  }, [masterVolumeDb]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        useProjectStore.getState().splitClipAtPlayhead();
        return;
      }
      if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        useProjectStore.getState().duplicateClipAtPlayhead();
        return;
      }
      const isUndoRedoModifier = e.ctrlKey || e.metaKey;
      if (isUndoRedoModifier && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) useProjectStore.getState().redo();
        else useProjectStore.getState().undo();
        return;
      }
      if (isUndoRedoModifier && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        useProjectStore.getState().redo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // The project picker gate - BandLab always lands you here first, never
  // straight into a Studio. All hooks above still run unconditionally every
  // render (Rules of Hooks); only the JSX branches here.
  if (!projectOpen) return <ProjectHomeScreen />;

  if (!isDesktop) return <MobileStudio />;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ink text-bone">
      <TransportBar />
      <AutomationEditor />
      <div className="flex flex-1 overflow-hidden">
        <BrowserPanel />
        <Timeline />
        <EffectsRackPanel />
      </div>
      <div className="shrink-0">
        <MixerPanel />
      </div>
    </div>
  );
}
