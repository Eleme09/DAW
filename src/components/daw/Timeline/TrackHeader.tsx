"use client";

import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { useProjectStore } from "@/state/projectStore";
import type { Track } from "@/types/project";
import { MeterBar } from "../MeterBar";
import { HEADER_WIDTH, TRACK_HEIGHT } from "./constants";

interface TrackHeaderProps {
  track: Track;
  selected: boolean;
}

export function TrackHeader({ track, selected }: TrackHeaderProps) {
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const removeTrack = useProjectStore((s) => s.removeTrack);
  const selectTrack = useProjectStore((s) => s.selectTrack);
  const armTrack = useProjectStore((s) => s.armTrack);
  const isRecording = useProjectStore((s) => s.isRecording);
  const isLiveInput = track.armed && isRecording;

  return (
    <div
      onClick={() => selectTrack(track.id)}
      style={{ width: HEADER_WIDTH, height: TRACK_HEIGHT }}
      className={`sticky left-0 z-10 flex shrink-0 flex-col justify-between border-b border-r border-neutral-800 bg-neutral-950 p-2 ${
        selected ? "ring-1 ring-inset ring-cyan-500" : ""
      } ${isLiveInput ? "ring-1 ring-inset ring-red-500" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: track.color }} />
        <input
          value={track.name}
          onChange={(e) => updateTrack(track.id, { name: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          className="w-full truncate bg-transparent text-xs font-medium text-neutral-200 outline-none"
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeTrack(track.id);
          }}
          disabled={isLiveInput}
          title="Delete track"
          className="shrink-0 text-neutral-600 hover:text-red-400 disabled:opacity-30"
        >
          ✕
        </button>
      </div>

      {isLiveInput ? (
        <div className="flex h-1.5 items-center gap-1">
          <MeterBar analyser={getAudioEngine().getRecordingAnalyser()} vertical={false} />
        </div>
      ) : (
        <input
          type="range"
          min={-60}
          max={6}
          step={0.5}
          value={track.volumeDb}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => updateTrack(track.id, { volumeDb: Number(e.target.value) })}
          className="w-full accent-cyan-500"
        />
      )}

      <div className="flex items-center gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            updateTrack(track.id, { muted: !track.muted });
          }}
          title={track.muted ? "Unmute" : "Mute"}
          className={`h-5 w-5 rounded text-[10px] font-bold ${
            track.muted ? "bg-red-500 text-black" : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"
          }`}
        >
          M
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            updateTrack(track.id, { solo: !track.solo });
          }}
          title={track.solo ? "Unsolo" : "Solo"}
          className={`h-5 w-5 rounded text-[10px] font-bold ${
            track.solo ? "bg-yellow-400 text-black" : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"
          }`}
        >
          S
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            armTrack(track.id);
          }}
          disabled={isRecording}
          title="Arm for recording"
          className={`h-5 w-5 rounded text-[10px] font-bold disabled:opacity-30 ${
            track.armed ? "bg-red-600 text-white" : "bg-neutral-800 text-neutral-400"
          }`}
        >
          ●
        </button>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.05}
          value={track.pan}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => updateTrack(track.id, { pan: Number(e.target.value) })}
          className="ml-1 w-full accent-neutral-400"
          title={`Pan ${track.pan.toFixed(2)}`}
        />
      </div>
    </div>
  );
}
