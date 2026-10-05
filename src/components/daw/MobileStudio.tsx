"use client";

import { useState } from "react";
import { useProjectStore } from "@/state/projectStore";
import { isTrackMonitoredLive } from "@/audio-engine/monitoring";
import { Timeline } from "./Timeline/Timeline";
import { MixerPanel } from "./Mixer/MixerPanel";
import { EffectsRackPanel } from "./EffectsRack/EffectsRackPanel";
import { BrowserPanel } from "./BrowserPanel";
import { VozPanel } from "./VozPanel/VozPanel";
import { AutomationEditor } from "./Automation/AutomationEditor";
import { AddTrackSheet } from "./AddTrackSheet";
import { StudioSettingsSheet } from "./StudioSettingsSheet";
import { formatTime, useReturnToStart } from "./TransportBar";
import { MONITOR_NEXT } from "./monitorLabels";
import {
  BackIcon,
  PlusIcon,
  GearIcon,
  CloseIcon,
  MixIcon,
  UndoIcon,
  RedoIcon,
  RewindIcon,
  PlayIcon,
  PauseIcon,
  StopIcon,
  MetronomeIcon,
  MicIcon,
  KnobIcon,
  TuneIcon,
  RecordIcon,
  HeadphonesIcon,
} from "./icons";

/**
 * The phone Studio, rebuilt on BandLab's real structure (BANDLAB_REFERENCE.md
 * §1-2): ONE screen where the timeline is always present. Nothing replaces
 * it - the selected track's Voz/Fx panel opens underneath it, Mix View and
 * the sample library open over it with a close button, settings live behind
 * the gear. The old five-tab bottom bar (Voz/Biblioteca/Sesión/Mezcla/FX)
 * is gone on purpose: it hid the timeline every time you switched.
 *
 * `mobileView` stays the routing state so every existing "jump to effects /
 * mixer / library" caller elsewhere in the app keeps working unchanged.
 */
export function MobileStudio() {
  const projectName = useProjectStore((s) => s.project.name);
  const tracks = useProjectStore((s) => s.project.tracks);
  const metronomeEnabled = useProjectStore((s) => s.project.metronomeEnabled);
  const selectedTrackId = useProjectStore((s) => s.selectedTrackId);
  const currentTime = useProjectStore((s) => s.currentTime);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const isRecording = useProjectStore((s) => s.isRecording);
  const isCountingIn = useProjectStore((s) => s.isCountingIn);
  const countInBeats = useProjectStore((s) => s.countInBeats);
  const recordingError = useProjectStore((s) => s.recordingError);
  const mobileView = useProjectStore((s) => s.mobileView);
  const setMobileView = useProjectStore((s) => s.setMobileView);
  const play = useProjectStore((s) => s.play);
  const pause = useProjectStore((s) => s.pause);
  const startRecording = useProjectStore((s) => s.startRecording);
  const stopRecording = useProjectStore((s) => s.stopRecording);
  const cancelRecording = useProjectStore((s) => s.cancelRecording);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const toggleMetronome = useProjectStore((s) => s.toggleMetronome);
  const persist = useProjectStore((s) => s.persist);
  const closeProject = useProjectStore((s) => s.closeProject);
  const armTrack = useProjectStore((s) => s.armTrack);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const addEffect = useProjectStore((s) => s.addEffect);
  const setEffectsRackMode = useProjectStore((s) => s.setEffectsRackMode);
  const returnToStart = useReturnToStart();

  const [addTrackOpen, setAddTrackOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const selectedTrack = tracks.find((t) => t.id === selectedTrackId) ?? null;
  const panelOpen = mobileView === "voz" || mobileView === "effects";
  const overlay = mobileView === "mixer" || mobileView === "browser" ? mobileView : null;
  const busy = isRecording || isCountingIn;
  const monitoringLive = selectedTrack
    ? isTrackMonitoredLive(selectedTrack.armed, selectedTrack.monitorMode, isPlaying, isRecording)
    : false;

  function togglePanel(view: "voz" | "effects") {
    if (view === "effects") setEffectsRackMode("track");
    setMobileView(mobileView === view ? "timeline" : view);
  }

  function openTuning() {
    if (!selectedTrack) return;
    if (!selectedTrack.inserts.some((e) => e.type === "pitchCorrection")) addEffect(selectedTrack.id, "pitchCorrection");
    setEffectsRackMode("track");
    setMobileView("effects");
  }

  async function exitToLibrary() {
    await persist();
    closeProject();
  }

  const pill = (active: boolean) =>
    `flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold disabled:opacity-30 ${
      active ? "bg-bone text-ink" : "bg-surf-2 text-bone-2"
    }`;
  const roundBtn = "flex h-11 w-11 items-center justify-center rounded-full text-bone-2 disabled:opacity-30";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-ink text-bone" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      {/* Top bar: salir · nueva pista · nombre + tiempo · ajustes */}
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-1.5">
        <button onClick={() => void exitToLibrary()} disabled={busy} aria-label="Salir a mis proyectos" title="Guardar y salir a mis proyectos" className={roundBtn}>
          <BackIcon className="h-5 w-5" />
        </button>
        <button
          onClick={() => setAddTrackOpen(true)}
          disabled={busy}
          aria-label="Nueva pista"
          title="Nueva pista: grabar voz o importar audio/video"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surf-2 text-bone disabled:opacity-30"
        >
          <PlusIcon className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-[11px] font-medium text-bone-3">{projectName}</div>
          <div className="font-mono text-base tabular-nums leading-tight text-bone" title="Posición de reproducción">
            {formatTime(currentTime)}
          </div>
        </div>
        <button onClick={() => setSettingsOpen(true)} aria-label="Ajustes del proyecto" title="Ajustes: tempo, metrónomo, micrófono, exportar" className={roundBtn}>
          <GearIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Studio: la línea de tiempo siempre está; el panel de pista abre debajo, Mezcla/Muestras encima */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <Timeline compact onAddTrack={() => setAddTrackOpen(true)} />
        </div>

        {panelOpen && (
          <div className="flex h-[46%] shrink-0 flex-col border-t border-line-2 bg-ink">
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-line px-3">
              <span className="truncate text-xs font-semibold text-bone">
                {mobileView === "voz" ? "Voz" : "Efectos"}
                {selectedTrack ? ` · ${selectedTrack.name}` : ""}
              </span>
              <button onClick={() => setMobileView("timeline")} aria-label="Cerrar panel" title="Cerrar panel" className="flex h-9 w-9 items-center justify-center rounded-full text-bone-2">
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{mobileView === "voz" ? <VozPanel /> : <EffectsRackPanel />}</div>
          </div>
        )}

        {overlay && (
          <div className="absolute inset-0 z-30 flex flex-col bg-ink">
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-3">
              <span className="text-sm font-semibold text-bone">{overlay === "mixer" ? "Mezcla" : "Mis muestras"}</span>
              <button onClick={() => setMobileView("timeline")} aria-label="Volver al estudio" title="Volver al estudio" className="flex h-9 w-9 items-center justify-center rounded-full bg-surf-2 text-bone">
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{overlay === "mixer" ? <MixerPanel /> : <BrowserPanel />}</div>
          </div>
        )}
      </div>

      {recordingError && <p className="shrink-0 bg-rec/15 px-3 py-1.5 text-xs text-red-300">Micrófono: {recordingError}</p>}

      {/* Fila de la pista seleccionada: Voz · Fx · Afinar · armar · monitor */}
      <div className="flex h-12 shrink-0 items-center gap-1.5 border-t border-line px-2">
        <button onClick={() => togglePanel("voz")} disabled={!selectedTrack} className={pill(mobileView === "voz")}>
          <MicIcon className="h-3.5 w-3.5" /> Voz
        </button>
        <button onClick={() => togglePanel("effects")} disabled={!selectedTrack} className={pill(mobileView === "effects")}>
          <KnobIcon className="h-3.5 w-3.5" /> Fx
        </button>
        <button onClick={openTuning} disabled={!selectedTrack} className={pill(false)}>
          <TuneIcon className="h-3.5 w-3.5" /> Afinar
        </button>
        <div className="flex-1" />
        <button
          onClick={() => selectedTrack && armTrack(selectedTrack.id)}
          disabled={!selectedTrack || busy}
          aria-label="Armar pista para grabar"
          title={selectedTrack ? `Armar "${selectedTrack.name}" para grabar` : "Selecciona una pista"}
          className={`flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-30 ${selectedTrack?.armed ? "bg-rec text-bone" : "bg-surf-2 text-bone-2"}`}
        >
          <RecordIcon className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => selectedTrack && updateTrack(selectedTrack.id, { monitorMode: MONITOR_NEXT[selectedTrack.monitorMode] })}
          disabled={!selectedTrack}
          aria-label="Escucharte mientras grabas"
          title={selectedTrack ? `Monitor: ${selectedTrack.monitorMode}${monitoringLive ? " — te estás escuchando ahora" : ""}` : "Selecciona una pista"}
          className={`flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-30 ${monitoringLive ? "bg-bone text-ink" : "bg-surf-2 text-bone-2"}`}
        >
          <HeadphonesIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Transporte: mezcla · deshacer · inicio · GRABAR · reproducir · rehacer · metrónomo */}
      <div className="flex h-[72px] shrink-0 items-center justify-between border-t border-line px-2" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <button onClick={() => setMobileView(mobileView === "mixer" ? "timeline" : "mixer")} aria-label="Mezcla" title="Mezcla (volumen, paneo, mute, solo)" className={`${roundBtn} ${mobileView === "mixer" ? "bg-bone !text-ink" : ""}`}>
          <MixIcon className="h-5 w-5" />
        </button>
        <button onClick={undo} disabled={!canUndo || busy} aria-label="Deshacer" title="Deshacer" className={roundBtn}>
          <UndoIcon className="h-5 w-5" />
        </button>
        <button onClick={returnToStart} disabled={busy} aria-label="Volver al inicio" title="Volver al inicio — otro toque vuelve a donde estabas" className={roundBtn}>
          <RewindIcon className="h-5 w-5" />
        </button>
        <button
          onClick={() => (isRecording ? stopRecording() : startRecording())}
          disabled={isCountingIn}
          aria-label={isRecording ? "Detener grabación" : isCountingIn ? "Cuenta atrás" : "Grabar"}
          title={isRecording ? "Detener grabación" : "Grabar en la pista armada"}
          className={`flex h-14 w-14 items-center justify-center rounded-full bg-rec font-mono text-lg font-bold text-bone ${isRecording ? "animate-pulse" : ""}`}
        >
          {isCountingIn ? countInBeats : isRecording ? <StopIcon className="h-5 w-5" /> : null}
        </button>
        <button onClick={() => (isPlaying ? pause() : play())} disabled={busy} aria-label={isPlaying ? "Pausar" : "Reproducir"} title={isPlaying ? "Pausar" : "Reproducir"} className={`${roundBtn} !text-bone`}>
          {isPlaying && !isRecording ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
        </button>
        <button onClick={redo} disabled={!canRedo || busy} aria-label="Rehacer" title="Rehacer" className={roundBtn}>
          <RedoIcon className="h-5 w-5" />
        </button>
        {busy ? (
          <button onClick={cancelRecording} aria-label="Cancelar grabación" title="Cancelar grabación - descarta la toma" className={roundBtn}>
            <CloseIcon className="h-5 w-5" />
          </button>
        ) : (
          <button onClick={toggleMetronome} aria-label="Metrónomo" title={metronomeEnabled ? "Metrónomo encendido" : "Metrónomo apagado"} className={`${roundBtn} ${metronomeEnabled ? "bg-bone !text-ink" : ""}`}>
            <MetronomeIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      <AutomationEditor />
      <AddTrackSheet open={addTrackOpen} onClose={() => setAddTrackOpen(false)} />
      <StudioSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
