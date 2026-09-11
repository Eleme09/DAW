"use client";

import { useEffect, useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { useProjectStore } from "@/state/projectStore";
import { TransportBar } from "./TransportBar";
import { BrowserPanel } from "./BrowserPanel";
import { Timeline } from "./Timeline/Timeline";
import { MixerPanel } from "./Mixer/MixerPanel";
import { EffectsRackPanel } from "./EffectsRack/EffectsRackPanel";
import { LivePitchMonitorPanel } from "./LivePitchMonitorPanel";
import { FolderIcon, TimelineIcon, MixIcon, KnobIcon } from "./icons";
import type { ComponentType } from "react";

// Below the `md` breakpoint the desktop's three-pane row (Browser/Timeline/
// EffectsRack) plus the docked Mixer can't coexist on screen at once, so on
// mobile exactly one of the four becomes a full-width view, switched via the
// tab bar at the bottom. At `md` and up every pane renders simultaneously
// exactly as before and this state is unused.
type MobileView = "browser" | "timeline" | "mixer" | "effects";

const MOBILE_VIEWS: { id: MobileView; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { id: "browser", label: "Browser", Icon: FolderIcon },
  { id: "timeline", label: "Timeline", Icon: TimelineIcon },
  { id: "mixer", label: "Mixer", Icon: MixIcon },
  { id: "effects", label: "FX", Icon: KnobIcon },
];

export function DawShell() {
  const tracks = useProjectStore((s) => s.project.tracks);
  const masterInserts = useProjectStore((s) => s.project.masterInserts);
  const [mobileView, setMobileView] = useState<MobileView>("timeline");

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

  // Live pitch monitor uses its own mic stream independent of the transport/
  // recording lifecycle - make sure it's actually released on unmount.
  useEffect(() => {
    return () => {
      if (getAudioEngine().isLivePitchMonitorActive()) {
        getAudioEngine().disableLivePitchMonitor();
      }
    };
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-neutral-950 text-neutral-100">
      <TransportBar />
      <LivePitchMonitorPanel />
      <div className="flex flex-1 overflow-hidden">
        <div className={`${mobileView === "browser" ? "block" : "hidden"} w-full md:contents`}>
          <BrowserPanel />
        </div>
        <div className={`${mobileView === "timeline" ? "flex" : "hidden"} min-w-0 flex-1 md:contents`}>
          <Timeline />
        </div>
        <div className={`${mobileView === "effects" ? "block" : "hidden"} w-full md:contents`}>
          <EffectsRackPanel />
        </div>
      </div>
      <div className={`shrink-0 ${mobileView === "mixer" ? "block" : "hidden"} md:block`}>
        <MixerPanel />
      </div>

      <nav
        className="flex shrink-0 border-t border-neutral-800 bg-neutral-950 md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {MOBILE_VIEWS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setMobileView(id)}
            className={`flex flex-1 flex-col items-center gap-0.5 border-t-2 py-2 text-[11px] font-medium uppercase tracking-wide transition-colors ${
              mobileView === id
                ? "border-orange-500 text-orange-400"
                : "border-transparent text-neutral-500 hover:text-neutral-300"
            }`}
          >
            <Icon className="h-5 w-5" />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
