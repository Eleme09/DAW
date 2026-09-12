"use client";

import { useState } from "react";
import { useProjectStore } from "@/state/projectStore";
import { exportProjectToWav } from "@/lib/audio/exportProject";
import { UndoIcon, RedoIcon, MoreIcon } from "./icons";
import { BottomSheet } from "./BottomSheet";

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
  const [exportError, setExportError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const hasAudio = project.tracks.some((t) => t.clips.length > 0);

  async function handleExport() {
    setExportError(null);
    setIsExporting(true);
    try {
      await exportProjectToWav(project);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  }

  const bpmField = (
    <div className="flex items-center gap-1 text-xs text-neutral-400" title="Tempo, in beats per minute">
      <label className="font-medium">BPM</label>
      <input
        type="number"
        min={20}
        max={300}
        value={project.bpm}
        onChange={(e) => setBpm(Number(e.target.value) || project.bpm)}
        className="w-16 rounded bg-neutral-900 px-1 py-1 text-neutral-100 outline-none focus:ring-1 focus:ring-cyan-500"
      />
    </div>
  );

  const timeSigField = (
    <div className="flex items-center gap-1 text-xs text-neutral-400" title="Time signature">
      <label className="font-medium">TIME</label>
      <input
        type="number"
        min={1}
        max={32}
        value={project.timeSignature[0]}
        onChange={(e) => setTimeSignature(Number(e.target.value) || 4, project.timeSignature[1])}
        className="w-10 rounded bg-neutral-900 px-1 py-1 text-center text-neutral-100 outline-none"
      />
      <span>/</span>
      <input
        type="number"
        min={1}
        max={32}
        value={project.timeSignature[1]}
        onChange={(e) => setTimeSignature(project.timeSignature[0], Number(e.target.value) || 4)}
        className="w-10 rounded bg-neutral-900 px-1 py-1 text-center text-neutral-100 outline-none"
      />
    </div>
  );

  const loopButton = (
    <button
      onClick={() => setLoop({ enabled: !project.loop.enabled })}
      title="Loop playback between the loop markers"
      className={`rounded px-2 py-1 text-xs font-medium ${
        project.loop.enabled ? "bg-cyan-500 text-black" : "bg-neutral-800 text-neutral-300"
      }`}
    >
      LOOP
    </button>
  );

  const clickButton = (
    <button
      onClick={toggleMetronome}
      title="Metronome click while playing/recording"
      className={`rounded px-2 py-1 text-xs font-medium ${
        project.metronomeEnabled ? "bg-cyan-500 text-black" : "bg-neutral-800 text-neutral-300"
      }`}
    >
      CLICK
    </button>
  );

  return (
    <div
      className="flex h-14 shrink-0 items-center gap-2 border-b border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-200 sm:gap-3 sm:px-4"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <input
        value={project.name}
        onChange={(e) => renameProject(e.target.value)}
        className="hidden w-32 shrink-0 rounded bg-neutral-900 px-2 py-1 font-medium outline-none focus:ring-1 focus:ring-cyan-500 sm:block md:w-40"
      />

      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => (isPlaying ? pause() : play())}
          disabled={isRecording}
          title={isPlaying ? "Pause" : "Play"}
          className="flex h-10 w-10 items-center justify-center rounded bg-cyan-500 font-bold text-black hover:bg-cyan-400 active:bg-cyan-400 disabled:opacity-40 sm:h-9 sm:w-9"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying && !isRecording ? "❚❚" : "▶"}
        </button>
        <button
          onClick={stop}
          disabled={isRecording}
          title="Stop"
          className="flex h-10 w-10 items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-700 disabled:opacity-40 sm:h-9 sm:w-9"
          aria-label="Stop"
        >
          ■
        </button>
        <button
          onClick={() => (isRecording ? stopRecording() : startRecording())}
          className={`flex h-10 w-10 items-center justify-center rounded text-lg sm:h-9 sm:w-9 ${
            isRecording
              ? "animate-pulse bg-red-600 text-white"
              : "bg-neutral-800 text-red-500 hover:bg-neutral-700 active:bg-neutral-700"
          }`}
          aria-label={isRecording ? "Stop recording" : "Record"}
          title={isRecording ? "Stop recording" : "Record onto the armed track"}
        >
          ●
        </button>
      </div>

      <div className="hidden shrink-0 items-center gap-1 sm:flex">
        <button
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          className="flex h-9 w-9 items-center justify-center rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 disabled:opacity-30"
        >
          <UndoIcon className="h-4 w-4" />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          className="flex h-9 w-9 items-center justify-center rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 disabled:opacity-30"
        >
          <RedoIcon className="h-4 w-4" />
        </button>
      </div>

      <span className="shrink-0 font-mono text-sm tabular-nums text-neutral-100 sm:text-base" title="Playhead position">
        {formatTime(currentTime)}
      </span>
      {recordingError && (
        <span className="hidden max-w-xs truncate text-xs text-red-400 sm:inline" title={recordingError}>
          Mic error: {recordingError}
        </span>
      )}

      <span className="hidden h-6 w-px shrink-0 bg-neutral-800 sm:block" />
      <div className="hidden shrink-0 sm:block">{bpmField}</div>
      <div className="hidden shrink-0 sm:block">{timeSigField}</div>
      <span className="hidden h-6 w-px shrink-0 bg-neutral-800 sm:block" />
      <div className="hidden shrink-0 sm:block">{loopButton}</div>
      <div className="hidden shrink-0 sm:block">{clickButton}</div>

      {exportError && (
        <span className="hidden max-w-xs truncate text-xs text-red-400 sm:inline">Export error: {exportError}</span>
      )}

      <div className="ml-auto hidden shrink-0 items-center gap-2 sm:flex">
        <button
          onClick={handleExport}
          disabled={isExporting || isRecording || !hasAudio}
          title={hasAudio ? "Render the full mix and download as WAV" : "Add audio to the timeline first"}
          className="rounded bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 disabled:opacity-40"
        >
          {isExporting ? "Exporting…" : "Export"}
        </button>
        <button
          onClick={persist}
          className="rounded bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
        >
          Save Project
        </button>
      </div>

      <button
        onClick={() => setMoreOpen(true)}
        title="More transport controls"
        aria-label="More transport controls"
        className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 sm:hidden"
      >
        <MoreIcon className="h-5 w-5" />
      </button>

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Transport">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Project name</span>
          <input
            value={project.name}
            onChange={(e) => renameProject(e.target.value)}
            className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-neutral-100 outline-none focus:ring-1 focus:ring-cyan-500"
          />
        </label>

        <div className="flex gap-2">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded bg-neutral-800 text-sm font-medium text-neutral-200 disabled:opacity-30"
          >
            <UndoIcon className="h-4 w-4" /> Undo
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded bg-neutral-800 text-sm font-medium text-neutral-200 disabled:opacity-30"
          >
            <RedoIcon className="h-4 w-4" /> Redo
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

        {(recordingError || exportError) && (
          <p className="text-xs text-red-400">{recordingError || exportError}</p>
        )}

        <button
          onClick={handleExport}
          disabled={isExporting || isRecording || !hasAudio}
          className="h-11 w-full rounded bg-neutral-800 text-sm font-medium text-neutral-200 disabled:opacity-40"
        >
          {isExporting ? "Exporting…" : hasAudio ? "Export mix as WAV" : "Add audio to the timeline first"}
        </button>
        <button
          onClick={persist}
          className="h-11 w-full rounded bg-cyan-500 text-sm font-semibold text-black"
        >
          Save Project
        </button>
      </BottomSheet>
    </div>
  );
}
