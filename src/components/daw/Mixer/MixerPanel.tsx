"use client";

import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { useProjectStore } from "@/state/projectStore";
import { MeterBar } from "../MeterBar";

export function MixerPanel() {
  const tracks = useProjectStore((s) => s.project.tracks);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const engine = getAudioEngine();

  return (
    <div className="flex h-48 shrink-0 gap-2 overflow-x-auto border-t border-neutral-800 bg-neutral-950 p-2">
      {tracks.length === 0 && (
        <div className="flex flex-1 items-center justify-center text-xs text-neutral-700">
          No tracks yet — add one from the Timeline
        </div>
      )}
      {tracks.map((track) => (
        <div
          key={track.id}
          className="flex w-20 shrink-0 flex-col items-center gap-1 rounded border border-neutral-800 bg-neutral-900 p-2"
        >
          <span className="w-full truncate text-center text-[10px] font-medium text-neutral-300">
            {track.name}
          </span>
          <div className="flex h-24 items-end gap-1">
            <input
              type="range"
              min={-60}
              max={6}
              step={0.5}
              value={track.volumeDb}
              onChange={(e) => updateTrack(track.id, { volumeDb: Number(e.target.value) })}
              title={`Volume ${track.volumeDb.toFixed(1)} dB`}
              className="h-24 w-6 accent-orange-500"
              style={{ writingMode: "vertical-lr", direction: "rtl" }}
            />
            <MeterBar analyser={engine.getTrackAnalyser(track.id)} />
          </div>
          <span className="text-[10px] tabular-nums text-neutral-500">{track.volumeDb.toFixed(1)}dB</span>
          <div className="flex gap-1">
            <button
              onClick={() => updateTrack(track.id, { muted: !track.muted })}
              title={track.muted ? "Unmute" : "Mute"}
              className={`h-5 w-5 rounded text-[10px] font-bold ${
                track.muted ? "bg-red-500 text-black" : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"
              }`}
            >
              M
            </button>
            <button
              onClick={() => updateTrack(track.id, { solo: !track.solo })}
              title={track.solo ? "Unsolo" : "Solo"}
              className={`h-5 w-5 rounded text-[10px] font-bold ${
                track.solo ? "bg-yellow-400 text-black" : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"
              }`}
            >
              S
            </button>
          </div>
        </div>
      ))}

      <div className="ml-auto flex w-24 shrink-0 flex-col items-center gap-1 rounded border border-neutral-700 bg-neutral-900 p-2">
        <span className="text-[10px] font-semibold text-neutral-200">MASTER</span>
        <div className="flex h-24 items-end">
          <MeterBar analyser={engine.getMasterAnalyser()} />
        </div>
      </div>
    </div>
  );
}
