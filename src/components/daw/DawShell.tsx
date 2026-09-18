"use client";

import { useEffect } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { useProjectStore, type MobileView } from "@/state/projectStore";
import { TransportBar } from "./TransportBar";
import { BrowserPanel } from "./BrowserPanel";
import { Timeline } from "./Timeline/Timeline";
import { MixerPanel } from "./Mixer/MixerPanel";
import { EffectsRackPanel } from "./EffectsRack/EffectsRackPanel";
import { PianoRoll } from "./PianoRoll/PianoRoll";
import { AutomationEditor } from "./Automation/AutomationEditor";
import { VozPanel } from "./VozPanel/VozPanel";
import { MicIcon, FolderIcon, TimelineIcon, MixIcon, KnobIcon } from "./icons";
import type { ComponentType } from "react";

// Below the `md` breakpoint the desktop's three-pane row (Browser/Timeline/
// EffectsRack) plus the docked Mixer can't coexist on screen at once, so on
// mobile exactly one of the four becomes a full-width view, switched via the
// tab bar at the bottom. At `md` and up every pane renders simultaneously
// exactly as before and this state is unused. Lives in the store (not local
// state) so other panels (e.g. the Mixer's per-channel FX button) can jump
// to a different tab.
const MOBILE_VIEWS: { id: MobileView; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { id: "voz", label: "Voz", Icon: MicIcon },
  { id: "browser", label: "Biblioteca", Icon: FolderIcon },
  { id: "timeline", label: "Sesión", Icon: TimelineIcon },
  { id: "mixer", label: "Mezcla", Icon: MixIcon },
  { id: "effects", label: "FX", Icon: KnobIcon },
];

export function DawShell() {
  const tracks = useProjectStore((s) => s.project.tracks);
  const buses = useProjectStore((s) => s.project.buses);
  const masterInserts = useProjectStore((s) => s.project.masterInserts);
  const masterVolumeDb = useProjectStore((s) => s.project.masterVolumeDb);
  const mobileView = useProjectStore((s) => s.mobileView);
  const setMobileView = useProjectStore((s) => s.setMobileView);

  // Resume the last session automatically - the store otherwise always
  // starts from a blank project, which would defeat autosave/recovery.
  useEffect(() => {
    useProjectStore.getState().recoverLastProject();
  }, []);

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

  // Live pitch monitor uses its own mic stream independent of the transport/
  // recording lifecycle - make sure it's actually released on unmount.
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ink text-bone">
      <TransportBar />
      <PianoRoll />
      <AutomationEditor />
      <div className="flex flex-1 overflow-hidden">
        {/* Voz is a mobile-only dedicated screen, same reasoning as the
           mobile Mixer tab below - on desktop, Sesión + FX + Biblioteca are
           already all visible together, which covers the same ground. */}
        <div className={`${mobileView === "voz" ? "flex" : "hidden"} w-full flex-1 flex-col overflow-hidden md:hidden`}>
          <VozPanel />
        </div>
        <div className={`${mobileView === "browser" ? "block" : "hidden"} w-full md:contents`}>
          <BrowserPanel />
        </div>
        <div className={`${mobileView === "timeline" ? "flex" : "hidden"} min-w-0 flex-1 md:contents`}>
          <Timeline />
        </div>
        {/* On mobile the Mixer is a full-height dedicated tab, not the
           compact desktop dock below - otherwise the three panes above stay
           empty-but-flex-1 (still claiming their share of height even with
           nothing visible in them) and squeeze the mixer into a sliver. */}
        <div className={`${mobileView === "mixer" ? "flex" : "hidden"} w-full flex-1 flex-col overflow-hidden md:hidden`}>
          <MixerPanel />
        </div>
        <div className={`${mobileView === "effects" ? "block" : "hidden"} w-full md:contents`}>
          <EffectsRackPanel />
        </div>
      </div>
      <div className="hidden shrink-0 md:block">
        <MixerPanel />
      </div>

      <nav
        className="flex shrink-0 border-t border-line bg-ink md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {MOBILE_VIEWS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setMobileView(id)}
            className={`flex flex-1 flex-col items-center gap-0.5 border-t-2 py-2 text-[11px] font-medium uppercase tracking-wide transition-colors ${
              mobileView === id
                ? "border-bone text-bone"
                : "border-transparent text-bone-3 hover:text-bone-2"
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
