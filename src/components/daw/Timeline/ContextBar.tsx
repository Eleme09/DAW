"use client";

import { isTrackMonitoredLive } from "@/audio-engine/monitoring";
import { useProjectStore } from "@/state/projectStore";
import { MicIcon, KnobIcon, TuneIcon, ScissorsIcon, HeadphonesIcon } from "../icons";

const MONITOR_NEXT = { off: "auto", auto: "on", on: "off" } as const;

/**
 * Persistent bar between the track lanes and the transport (estudio-ui.html's
 * `.ctxbar`, screen "Sesión") - acts on whichever track is selected, so the
 * most common per-take actions (arm, open its effects, open tuning, cut,
 * toggle monitoring) don't require hunting through TrackHeader's small
 * per-row buttons or switching bottom-nav tabs by hand first.
 *
 * The reference mock uses 28px pill buttons inside a 44px bar - fine for a
 * static desktop mockup, but this app's own FASE 9 touch-target audit
 * requires >=44px real hit areas everywhere. Buttons here fill the full
 * 44px bar height instead, same hit-area-expansion approach already used
 * elsewhere (see PROGRESS.md) rather than reproducing the mockup's exact
 * pixel sizing where it conflicts with that rule.
 */
export function ContextBar() {
  const project = useProjectStore((s) => s.project);
  const selectedTrackId = useProjectStore((s) => s.selectedTrackId);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const isRecording = useProjectStore((s) => s.isRecording);
  const armTrack = useProjectStore((s) => s.armTrack);
  const setEffectsRackMode = useProjectStore((s) => s.setEffectsRackMode);
  const setMobileView = useProjectStore((s) => s.setMobileView);
  const splitClipAtPlayhead = useProjectStore((s) => s.splitClipAtPlayhead);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const addEffect = useProjectStore((s) => s.addEffect);

  const selectedTrack = project.tracks.find((t) => t.id === selectedTrackId);
  const disabled = !selectedTrack;

  function openEffects() {
    if (!selectedTrackId) return;
    setEffectsRackMode("track");
    setMobileView("effects");
  }

  function openTuning() {
    if (!selectedTrackId || !selectedTrack) return;
    if (!selectedTrack.inserts.some((e) => e.type === "pitchCorrection")) {
      addEffect(selectedTrackId, "pitchCorrection");
    }
    setEffectsRackMode("track");
    setMobileView("effects");
  }

  function toggleMonitor() {
    if (!selectedTrackId || !selectedTrack) return;
    updateTrack(selectedTrackId, { monitorMode: MONITOR_NEXT[selectedTrack.monitorMode] });
  }

  // Real routing state (see isTrackMonitoredLive), not just "mode isn't
  // off" - highlighting this button whenever the mode is merely configured
  // would claim monitoring is on even while "auto" mode is silent (e.g.
  // during plain playback), which is exactly the honesty gap this project
  // avoids everywhere else.
  const monitoring = selectedTrack
    ? isTrackMonitoredLive(selectedTrack.armed, selectedTrack.monitorMode, isPlaying, isRecording)
    : false;

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-t border-line bg-surf px-1.5">
      <button
        onClick={() => selectedTrackId && armTrack(selectedTrackId)}
        disabled={disabled}
        title={selectedTrack ? `Armar "${selectedTrack.name}" para grabar` : "Selecciona una pista primero"}
        className={`flex h-11 items-center gap-1.5 rounded px-2.5 text-[11px] font-semibold disabled:opacity-30 ${
          selectedTrack?.armed ? "bg-rec text-bone" : "border border-line2 text-bone-2 hover:text-bone"
        }`}
      >
        <MicIcon className="h-3.5 w-3.5" /> Entrada
      </button>
      <button
        onClick={openEffects}
        disabled={disabled}
        title={selectedTrack ? `Efectos de "${selectedTrack.name}"` : "Selecciona una pista primero"}
        className="flex h-11 items-center gap-1.5 rounded border border-line2 px-2.5 text-[11px] font-semibold text-bone-2 hover:text-bone disabled:opacity-30"
      >
        <KnobIcon className="h-3.5 w-3.5" /> Efectos
      </button>
      <button
        onClick={openTuning}
        disabled={disabled}
        title={selectedTrack ? `Afinación de "${selectedTrack.name}"` : "Selecciona una pista primero"}
        className="flex h-11 items-center gap-1.5 rounded border border-line2 px-2.5 text-[11px] font-semibold text-bone-2 hover:text-bone disabled:opacity-30"
      >
        <TuneIcon className="h-3.5 w-3.5" /> Afinar
      </button>
      <div className="flex-1" />
      <button
        onClick={splitClipAtPlayhead}
        disabled={disabled}
        title="Divide el clip de la pista seleccionada en el playhead (atajo: S)"
        className="flex h-11 w-11 items-center justify-center rounded border border-line2 text-bone-2 hover:text-bone disabled:opacity-30"
      >
        <ScissorsIcon className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={toggleMonitor}
        disabled={disabled}
        title={
          selectedTrack
            ? `Monitor: ${selectedTrack.monitorMode}${monitoring ? " — escuchando tu micrófono ahora mismo" : ""}`
            : "Selecciona una pista primero"
        }
        className={`flex h-11 w-11 items-center justify-center rounded border disabled:opacity-30 ${
          monitoring ? "border-bone bg-bone text-ink" : "border-line2 text-bone-2 hover:text-bone"
        }`}
      >
        <HeadphonesIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
