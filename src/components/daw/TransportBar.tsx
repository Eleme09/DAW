"use client";

import { useRef, useState } from "react";
import { useProjectStore } from "@/state/projectStore";
import { UndoIcon, RedoIcon, PlayIcon, PauseIcon, StopIcon, RewindIcon, CloseIcon, FolderIcon, GearIcon } from "./icons";
import { BpmField, ClickButton, LoopButton, StudioSettingsSheet, TimeSigField, useExportActions } from "./StudioSettingsSheet";

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
}

/** "Volver al inicio": one tap jumps to 0, a second tap jumps back to where you were. */
export function useReturnToStart() {
  const currentTime = useProjectStore((s) => s.currentTime);
  const seek = useProjectStore((s) => s.seek);
  const lastPositionRef = useRef<number | null>(null);
  return () => {
    if (currentTime > 0.05) {
      lastPositionRef.current = currentTime;
      seek(0);
    } else if (lastPositionRef.current !== null) {
      seek(lastPositionRef.current);
      lastPositionRef.current = null;
    }
  };
}

/** Desktop transport (md and up). The phone layout is MobileStudio's own top bar + bottom transport row. */
export function TransportBar() {
  const projectName = useProjectStore((s) => s.project.name);
  const hasAudio = useProjectStore((s) => s.project.tracks.some((t) => t.clips.length > 0));
  const currentTime = useProjectStore((s) => s.currentTime);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const isRecording = useProjectStore((s) => s.isRecording);
  const isCountingIn = useProjectStore((s) => s.isCountingIn);
  const countInBeats = useProjectStore((s) => s.countInBeats);
  const recordingError = useProjectStore((s) => s.recordingError);
  const play = useProjectStore((s) => s.play);
  const pause = useProjectStore((s) => s.pause);
  const stop = useProjectStore((s) => s.stop);
  const startRecording = useProjectStore((s) => s.startRecording);
  const stopRecording = useProjectStore((s) => s.stopRecording);
  const cancelRecording = useProjectStore((s) => s.cancelRecording);
  const renameProject = useProjectStore((s) => s.renameProject);
  const persist = useProjectStore((s) => s.persist);
  const closeProject = useProjectStore((s) => s.closeProject);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const { isExporting, isExportingStems, exportError, exportMix, exportStems } = useExportActions();
  const handleReturnToStart = useReturnToStart();
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function handleExitProject() {
    await persist();
    closeProject();
  }

  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-ink px-4 text-sm text-bone">
      <input
        value={projectName}
        onChange={(e) => renameProject(e.target.value)}
        className="w-40 shrink-0 rounded bg-surf px-2 py-1 font-medium outline-none focus:ring-1 focus:ring-bone"
      />

      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => (isPlaying ? pause() : play())}
          disabled={isRecording || isCountingIn}
          aria-label={isPlaying ? "Pausar" : "Reproducir"}
          title={isPlaying ? "Pausar" : "Reproducir"}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-bone text-ink hover:opacity-90 disabled:opacity-40"
        >
          {isPlaying && !isRecording ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
        </button>
        <button
          onClick={stop}
          disabled={isRecording || isCountingIn}
          aria-label="Detener"
          title="Detener"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-surf-2 hover:bg-surf-3 disabled:opacity-40"
        >
          <StopIcon className="h-4 w-4" />
        </button>
        <button
          onClick={handleReturnToStart}
          disabled={isRecording || isCountingIn}
          aria-label="Volver al inicio"
          title="Volver al inicio — un toque más vuelve a donde estabas"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-surf-2 hover:bg-surf-3 disabled:opacity-40"
        >
          <RewindIcon className="h-4 w-4" />
        </button>
        <button
          onClick={() => (isRecording ? stopRecording() : startRecording())}
          disabled={isCountingIn}
          aria-label={isRecording ? "Detener grabación" : isCountingIn ? "Cuenta atrás" : "Grabar"}
          title={isRecording ? "Detener grabación" : "Graba sobre la pista armada"}
          className={`flex h-12 w-12 items-center justify-center rounded-full bg-rec font-mono text-base font-bold text-bone ${
            isRecording ? "animate-pulse" : isCountingIn ? "opacity-70" : "hover:opacity-90"
          }`}
        >
          {isCountingIn ? countInBeats : isRecording ? <StopIcon className="h-4 w-4" /> : null}
        </button>
        {(isRecording || isCountingIn) && (
          <button
            onClick={cancelRecording}
            aria-label="Cancelar grabación"
            title="Cancelar grabación - descarta la toma"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-surf-2 text-bone-2 hover:bg-surf-3"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button onClick={undo} disabled={!canUndo} title="Deshacer (Ctrl+Z)" className="flex h-11 w-11 items-center justify-center rounded-full bg-surf-2 text-bone-2 hover:bg-surf-3 disabled:opacity-30">
          <UndoIcon className="h-4 w-4" />
        </button>
        <button onClick={redo} disabled={!canRedo} title="Rehacer (Ctrl+Mayús+Z)" className="flex h-11 w-11 items-center justify-center rounded-full bg-surf-2 text-bone-2 hover:bg-surf-3 disabled:opacity-30">
          <RedoIcon className="h-4 w-4" />
        </button>
      </div>

      <span className="shrink-0 font-mono text-base tabular-nums text-bone" title="Posición de reproducción">
        {formatTime(currentTime)}
      </span>
      {recordingError && (
        <span className="max-w-xs truncate text-xs text-red-400" title={recordingError}>
          Error de micrófono: {recordingError}
        </span>
      )}

      <span className="h-6 w-px shrink-0 bg-line" />
      <BpmField />
      <TimeSigField />
      <LoopButton />
      <ClickButton />
      {exportError && <span className="max-w-xs truncate text-xs text-red-400">Error de exportación: {exportError}</span>}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button
          onClick={() => void exportMix()}
          disabled={isExporting || isExportingStems || isRecording || !hasAudio}
          className="rounded-full bg-surf-2 px-3 py-1.5 text-xs font-medium text-bone hover:bg-surf-3 disabled:opacity-40"
        >
          {isExporting ? "Exportando…" : "Exportar"}
        </button>
        <button
          onClick={() => void exportStems()}
          disabled={isExporting || isExportingStems || isRecording || !hasAudio}
          className="rounded-full bg-surf-2 px-3 py-1.5 text-xs font-medium text-bone hover:bg-surf-3 disabled:opacity-40"
        >
          {isExportingStems ? "Exportando…" : "Exportar stems"}
        </button>
        <button onClick={() => void persist()} className="rounded-full bg-surf-2 px-3 py-1.5 text-xs font-medium text-bone hover:bg-surf-3">
          Guardar
        </button>
        <button
          onClick={() => void handleExitProject()}
          className="flex items-center gap-1.5 rounded-full bg-surf-2 px-3 py-1.5 text-xs font-medium text-bone hover:bg-surf-3"
        >
          <FolderIcon className="h-3.5 w-3.5" /> Mis proyectos
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          aria-label="Ajustes del proyecto"
          title="Ajustes del proyecto"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-surf-2 text-bone-2 hover:bg-surf-3"
        >
          <GearIcon className="h-5 w-5" />
        </button>
      </div>
      <StudioSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
