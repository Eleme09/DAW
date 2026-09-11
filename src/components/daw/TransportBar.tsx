"use client";

import { useState } from "react";
import { useProjectStore } from "@/state/projectStore";
import { exportProjectToWav } from "@/lib/audio/exportProject";

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

  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
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

  return (
    <div className="flex h-14 shrink-0 items-center gap-2 overflow-x-auto border-b border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-200 [&>*]:shrink-0 sm:gap-4 sm:px-4">
      <input
        value={project.name}
        onChange={(e) => renameProject(e.target.value)}
        className="w-28 rounded bg-neutral-900 px-2 py-1 font-medium outline-none focus:ring-1 focus:ring-orange-500 sm:w-40"
      />

      <div className="flex items-center gap-1">
        <button
          onClick={() => (isPlaying ? pause() : play())}
          disabled={isRecording}
          title={isPlaying ? "Pause" : "Play"}
          className="flex h-10 w-10 items-center justify-center rounded bg-orange-500 font-bold text-black hover:bg-orange-400 active:bg-orange-400 disabled:opacity-40 sm:h-9 sm:w-9"
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

      <span className="font-mono text-base tabular-nums text-neutral-100" title="Playhead position">
        {formatTime(currentTime)}
      </span>
      {recordingError && (
        <span className="max-w-xs truncate text-xs text-red-400" title={recordingError}>
          Mic error: {recordingError}
        </span>
      )}

      <span className="h-6 w-px bg-neutral-800" />

      <div className="flex items-center gap-1 text-xs text-neutral-400" title="Tempo, in beats per minute">
        <label className="font-medium">BPM</label>
        <input
          type="number"
          min={20}
          max={300}
          value={project.bpm}
          onChange={(e) => setBpm(Number(e.target.value) || project.bpm)}
          className="w-16 rounded bg-neutral-900 px-1 py-1 text-neutral-100 outline-none focus:ring-1 focus:ring-orange-500"
        />
      </div>

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

      <span className="h-6 w-px bg-neutral-800" />

      <button
        onClick={() => setLoop({ enabled: !project.loop.enabled })}
        title="Loop playback between the loop markers"
        className={`rounded px-2 py-1 text-xs font-medium ${
          project.loop.enabled ? "bg-orange-500 text-black" : "bg-neutral-800 text-neutral-300"
        }`}
      >
        LOOP
      </button>

      <button
        onClick={toggleMetronome}
        title="Metronome click while playing/recording"
        className={`rounded px-2 py-1 text-xs font-medium ${
          project.metronomeEnabled ? "bg-orange-500 text-black" : "bg-neutral-800 text-neutral-300"
        }`}
      >
        CLICK
      </button>

      {exportError && (
        <span className="max-w-xs truncate text-xs text-red-400" title={exportError}>
          Export error: {exportError}
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
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
    </div>
  );
}
