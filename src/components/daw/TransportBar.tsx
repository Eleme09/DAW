"use client";

import { useState } from "react";
import { useProjectStore } from "@/state/projectStore";
import { exportProjectToWav, exportStemsToWav } from "@/lib/audio/exportProject";
import { getAudioEngine, type MonitorInputConstraints } from "@/audio-engine/AudioEngine";
import { UndoIcon, RedoIcon, MoreIcon, PlayIcon, PauseIcon, StopIcon, RecordIcon } from "./icons";
import { BottomSheet } from "./BottomSheet";

const CONSTRAINT_LABELS: Record<keyof MonitorInputConstraints, string> = {
  echoCancellation: "Cancelación de eco",
  noiseSuppression: "Supresión de ruido",
  autoGainControl: "Ganancia automática",
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms
    .toString()
    .padStart(3, "0")}`;
}

export function TransportBar() {
  const project = useProjectStore((s) => s.project);
  const currentTime = useProjectStore((s) => s.currentTime);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const isRecording = useProjectStore((s) => s.isRecording);
  const recordingError = useProjectStore((s) => s.recordingError);
  const play = useProjectStore((s) => s.play);
  const pause = useProjectStore((s) => s.pause);
  const stop = useProjectStore((s) => s.stop);
  const startRecording = useProjectStore((s) => s.startRecording);
  const stopRecording = useProjectStore((s) => s.stopRecording);
  const setBpm = useProjectStore((s) => s.setBpm);
  const setTimeSignature = useProjectStore((s) => s.setTimeSignature);
  const setLoop = useProjectStore((s) => s.setLoop);
  const toggleMetronome = useProjectStore((s) => s.toggleMetronome);
  const renameProject = useProjectStore((s) => s.renameProject);
  const persist = useProjectStore((s) => s.persist);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);

  const [isExporting, setIsExporting] = useState(false);
  const [isExportingStems, setIsExportingStems] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [micConstraints, setMicConstraints] = useState<MonitorInputConstraints>(() => getAudioEngine().getMonitorConstraints());
  const hasAudio = project.tracks.some((t) => t.clips.length > 0 || t.midiClips.length > 0);

  function toggleMicConstraint(key: keyof MonitorInputConstraints) {
    const next = { ...micConstraints, [key]: !micConstraints[key] };
    setMicConstraints(next);
    void getAudioEngine().setMonitorConstraints({ [key]: next[key] });
  }

  const latencySec = getAudioEngine().getLatencySec();

  async function handleExport() {
    setExportError(null);
    setIsExporting(true);
    try {
      await exportProjectToWav(project);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Error al exportar");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleExportStems() {
    setExportError(null);
    setIsExportingStems(true);
    try {
      await exportStemsToWav(project);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Error al exportar los stems");
    } finally {
      setIsExportingStems(false);
    }
  }

  const bpmField = (
    <div className="flex items-center gap-1 text-xs text-bone-2" title="Tempo, en pulsos por minuto">
      <label className="font-medium">BPM</label>
      <input
        type="number"
        min={20}
        max={300}
        value={project.bpm}
        onChange={(e) => setBpm(Number(e.target.value) || project.bpm)}
        className="w-16 rounded bg-surf px-1 py-1 text-bone outline-none focus:ring-1 focus:ring-bone"
      />
    </div>
  );

  const timeSigField = (
    <div className="flex items-center gap-1 text-xs text-bone-2" title="Compás">
      <label className="font-medium">COMPÁS</label>
      <input
        type="number"
        min={1}
        max={32}
        value={project.timeSignature[0]}
        onChange={(e) => setTimeSignature(Number(e.target.value) || 4, project.timeSignature[1])}
        className="w-10 rounded bg-surf px-1 py-1 text-center text-bone outline-none"
      />
      <span>/</span>
      <input
        type="number"
        min={1}
        max={32}
        value={project.timeSignature[1]}
        onChange={(e) => setTimeSignature(project.timeSignature[0], Number(e.target.value) || 4)}
        className="w-10 rounded bg-surf px-1 py-1 text-center text-bone outline-none"
      />
    </div>
  );

  const loopButton = (
    <button
      onClick={() => setLoop({ enabled: !project.loop.enabled })}
      title="Reproducir en bucle entre los marcadores de loop"
      className={`min-h-11 rounded px-2 text-xs font-medium ${
        project.loop.enabled ? "bg-bone text-ink" : "bg-surf-2 text-bone-2"
      }`}
    >
      LOOP
    </button>
  );

  const clickButton = (
    <button
      onClick={toggleMetronome}
      title="Clic del metrónomo al reproducir/grabar"
      className={`min-h-11 rounded px-2 text-xs font-medium ${
        project.metronomeEnabled ? "bg-bone text-ink" : "bg-surf-2 text-bone-2"
      }`}
    >
      CLICK
    </button>
  );

  return (
    <div
      className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-ink px-3 text-sm text-bone sm:gap-3 sm:px-4"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <input
        value={project.name}
        onChange={(e) => renameProject(e.target.value)}
        className="hidden w-32 shrink-0 rounded bg-surf px-2 py-1 font-medium outline-none focus:ring-1 focus:ring-bone sm:block md:w-40"
      />

      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => (isPlaying ? pause() : play())}
          disabled={isRecording}
          title={isPlaying ? "Pausar" : "Reproducir"}
          className="flex h-11 w-11 items-center justify-center rounded bg-bone font-bold text-ink hover:opacity-90 active:opacity-90 disabled:opacity-40"
          aria-label={isPlaying ? "Pausar" : "Reproducir"}
        >
          {isPlaying && !isRecording ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
        </button>
        <button
          onClick={stop}
          disabled={isRecording}
          title="Detener"
          className="flex h-11 w-11 items-center justify-center rounded bg-surf-2 hover:bg-surf-3 active:bg-surf-3 disabled:opacity-40"
          aria-label="Detener"
        >
          <StopIcon className="h-4 w-4" />
        </button>
        <button
          onClick={() => (isRecording ? stopRecording() : startRecording())}
          className={`flex h-11 w-11 items-center justify-center rounded text-lg ${
            isRecording
              ? "animate-pulse bg-red-600 text-white"
              : "bg-surf-2 text-red-500 hover:bg-surf-3 active:bg-surf-3"
          }`}
          aria-label={isRecording ? "Detener grabación" : "Grabar"}
          title={isRecording ? "Detener grabación" : "Graba sobre la pista armada"}
        >
          <RecordIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="hidden shrink-0 items-center gap-1 sm:flex">
        <button
          onClick={undo}
          disabled={!canUndo}
          title="Deshacer (Ctrl+Z)"
          className="flex h-11 w-11 items-center justify-center rounded bg-surf-2 text-bone-2 hover:bg-surf-3 disabled:opacity-30"
        >
          <UndoIcon className="h-4 w-4" />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          title="Rehacer (Ctrl+Mayús+Z)"
          className="flex h-11 w-11 items-center justify-center rounded bg-surf-2 text-bone-2 hover:bg-surf-3 disabled:opacity-30"
        >
          <RedoIcon className="h-4 w-4" />
        </button>
      </div>

      <span className="shrink-0 font-mono text-sm tabular-nums text-bone sm:text-base" title="Posición de reproducción">
        {formatTime(currentTime)}
      </span>
      {recordingError && (
        <span className="hidden max-w-xs truncate text-xs text-red-400 sm:inline" title={recordingError}>
          Error de micrófono: {recordingError}
        </span>
      )}

      <span className="hidden h-6 w-px shrink-0 bg-line sm:block" />
      <div className="hidden shrink-0 sm:block">{bpmField}</div>
      <div className="hidden shrink-0 sm:block">{timeSigField}</div>
      <span className="hidden h-6 w-px shrink-0 bg-line sm:block" />
      <div className="hidden shrink-0 sm:block">{loopButton}</div>
      <div className="hidden shrink-0 sm:block">{clickButton}</div>

      {exportError && (
        <span className="hidden max-w-xs truncate text-xs text-red-400 sm:inline">Error de exportación: {exportError}</span>
      )}

      <div className="ml-auto hidden shrink-0 items-center gap-2 sm:flex">
        <button
          onClick={handleExport}
          disabled={isExporting || isExportingStems || isRecording || !hasAudio}
          title={hasAudio ? "Renderiza la mezcla completa y descárgala en WAV" : "Agrega audio a la línea de tiempo primero"}
          className="rounded bg-surf-2 px-3 py-1.5 text-xs font-medium text-bone hover:bg-surf-3 disabled:opacity-40"
        >
          {isExporting ? "Exportando…" : "Exportar"}
        </button>
        <button
          onClick={handleExportStems}
          disabled={isExporting || isExportingStems || isRecording || !hasAudio}
          title={hasAudio ? "Descarga cada pista como su propio archivo WAV" : "Agrega audio a la línea de tiempo primero"}
          className="rounded bg-surf-2 px-3 py-1.5 text-xs font-medium text-bone hover:bg-surf-3 disabled:opacity-40"
        >
          {isExportingStems ? "Exportando…" : "Exportar stems"}
        </button>
        <button
          onClick={persist}
          className="rounded bg-surf-2 px-3 py-1.5 text-xs font-medium text-bone hover:bg-surf-3"
        >
          Guardar proyecto
        </button>
      </div>

      <button
        onClick={() => setMoreOpen(true)}
        title="Más controles de transporte"
        aria-label="Más controles de transporte"
        className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded bg-surf-2 text-bone-2 hover:bg-surf-3 sm:hidden"
      >
        <MoreIcon className="h-5 w-5" />
      </button>

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Transporte">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-bone-3">Nombre del proyecto</span>
          <input
            value={project.name}
            onChange={(e) => renameProject(e.target.value)}
            className="rounded bg-surf px-3 py-2 text-sm font-medium text-bone outline-none focus:ring-1 focus:ring-bone"
          />
        </label>

        <div className="flex gap-2">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded bg-surf-2 text-sm font-medium text-bone disabled:opacity-30"
          >
            <UndoIcon className="h-4 w-4" /> Deshacer
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded bg-surf-2 text-sm font-medium text-bone disabled:opacity-30"
          >
            <RedoIcon className="h-4 w-4" /> Rehacer
          </button>
        </div>

        <div className="flex gap-4">
          {bpmField}
          {timeSigField}
        </div>

        <div className="flex gap-2">
          {loopButton}
          {clickButton}
        </div>

        <div className="space-y-1.5 border-t border-line pt-3">
          <span className="text-[11px] font-medium uppercase tracking-wide text-bone-3">
            Entrada de micrófono {latencySec !== null && <span className="normal-case text-bone-3">— {Math.round(latencySec * 1000)}ms de latencia medida</span>}
          </span>
          <p className="text-xs text-bone-3">
            Apagados por defecto los dos — degradan una señal musical pensada para grabar con
            teléfono/auriculares, no para una llamada. Actívalos solo si el ambiente es realmente
            ruidoso y no tienes otra opción.
          </p>
          <div className="flex flex-col gap-2">
            {(Object.keys(CONSTRAINT_LABELS) as (keyof MonitorInputConstraints)[]).map((key) => (
              <button
                key={key}
                onClick={() => toggleMicConstraint(key)}
                className={`flex h-11 items-center justify-between rounded px-3 text-sm font-medium ${
                  micConstraints[key] ? "bg-bone text-ink" : "bg-surf-2 text-bone-2"
                }`}
              >
                {CONSTRAINT_LABELS[key]}
                <span>{micConstraints[key] ? "Activado" : "Desactivado"}</span>
              </button>
            ))}
          </div>
        </div>

        {(recordingError || exportError) && (
          <p className="text-xs text-red-400">{recordingError || exportError}</p>
        )}

        <button
          onClick={handleExport}
          disabled={isExporting || isExportingStems || isRecording || !hasAudio}
          className="h-11 w-full rounded bg-surf-2 text-sm font-medium text-bone disabled:opacity-40"
        >
          {isExporting ? "Exportando…" : hasAudio ? "Exportar mezcla como WAV" : "Agrega audio a la línea de tiempo primero"}
        </button>
        <button
          onClick={handleExportStems}
          disabled={isExporting || isExportingStems || isRecording || !hasAudio}
          className="h-11 w-full rounded bg-surf-2 text-sm font-medium text-bone disabled:opacity-40"
        >
          {isExportingStems ? "Exportando…" : "Exportar stems (un WAV por pista)"}
        </button>
        <button
          onClick={persist}
          className="h-11 w-full rounded bg-bone text-sm font-semibold text-ink"
        >
          Guardar proyecto
        </button>
      </BottomSheet>
    </div>
  );
}
