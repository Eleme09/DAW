"use client";

import { useProjectStore } from "@/state/projectStore";

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
  const play = useProjectStore((s) => s.play);
  const pause = useProjectStore((s) => s.pause);
  const stop = useProjectStore((s) => s.stop);
  const setBpm = useProjectStore((s) => s.setBpm);
  const setTimeSignature = useProjectStore((s) => s.setTimeSignature);
  const setLoop = useProjectStore((s) => s.setLoop);
  const toggleMetronome = useProjectStore((s) => s.toggleMetronome);
  const renameProject = useProjectStore((s) => s.renameProject);
  const persist = useProjectStore((s) => s.persist);

  return (
    <div className="flex h-14 shrink-0 items-center gap-4 border-b border-neutral-800 bg-neutral-950 px-4 text-sm text-neutral-200">
      <input
        value={project.name}
        onChange={(e) => renameProject(e.target.value)}
        className="w-40 rounded bg-neutral-900 px-2 py-1 font-medium outline-none focus:ring-1 focus:ring-orange-500"
      />

      <div className="flex items-center gap-1">
        <button
          onClick={() => (isPlaying ? pause() : play())}
          className="flex h-9 w-9 items-center justify-center rounded bg-orange-500 font-bold text-black hover:bg-orange-400"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? "❚❚" : "▶"}
        </button>
        <button
          onClick={stop}
          className="flex h-9 w-9 items-center justify-center rounded bg-neutral-800 hover:bg-neutral-700"
          aria-label="Stop"
        >
          ■
        </button>
      </div>

      <span className="font-mono text-base tabular-nums text-neutral-100">{formatTime(currentTime)}</span>

      <div className="flex items-center gap-1 text-xs text-neutral-400">
        <label>BPM</label>
        <input
          type="number"
          min={20}
          max={300}
          value={project.bpm}
          onChange={(e) => setBpm(Number(e.target.value) || project.bpm)}
          className="w-16 rounded bg-neutral-900 px-1 py-1 text-neutral-100 outline-none focus:ring-1 focus:ring-orange-500"
        />
      </div>

      <div className="flex items-center gap-1 text-xs text-neutral-400">
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

      <button
        onClick={() => setLoop({ enabled: !project.loop.enabled })}
        className={`rounded px-2 py-1 text-xs font-medium ${
          project.loop.enabled ? "bg-orange-500 text-black" : "bg-neutral-800 text-neutral-300"
        }`}
      >
        LOOP
      </button>

      <button
        onClick={toggleMetronome}
        className={`rounded px-2 py-1 text-xs font-medium ${
          project.metronomeEnabled ? "bg-orange-500 text-black" : "bg-neutral-800 text-neutral-300"
        }`}
      >
        CLICK
      </button>

      <div className="ml-auto">
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
