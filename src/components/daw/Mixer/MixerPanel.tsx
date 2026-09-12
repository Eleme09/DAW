"use client";

import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { useProjectStore } from "@/state/projectStore";
import { MeterBar } from "../MeterBar";
import { WaveformIcon, BusIcon } from "../icons";
import { Fader } from "./Fader";

export function MixerPanel() {
  const tracks = useProjectStore((s) => s.project.tracks);
  const masterVolumeDb = useProjectStore((s) => s.project.masterVolumeDb);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const armTrack = useProjectStore((s) => s.armTrack);
  const moveTrack = useProjectStore((s) => s.moveTrack);
  const setMasterVolume = useProjectStore((s) => s.setMasterVolume);
  const selectTrack = useProjectStore((s) => s.selectTrack);
  const selectedTrackId = useProjectStore((s) => s.selectedTrackId);
  const isRecording = useProjectStore((s) => s.isRecording);
  const setEffectsRackMode = useProjectStore((s) => s.setEffectsRackMode);
  const setMobileView = useProjectStore((s) => s.setMobileView);
  const engine = getAudioEngine();

  function openTrackFx(trackId: string) {
    selectTrack(trackId);
    setEffectsRackMode("track");
    setMobileView("effects");
  }

  function openMasterFx() {
    setEffectsRackMode("master");
    setMobileView("effects");
  }

  return (
    <div className="flex h-full flex-1 gap-2 overflow-x-auto border-t border-neutral-800 bg-neutral-950 p-2 md:h-56 md:flex-none">
      {tracks.length === 0 && (
        <div className="flex flex-1 items-center justify-center text-xs text-neutral-700">
          No tracks yet — add one from the Timeline
        </div>
      )}
      {tracks.map((track, i) => (
        <div
          key={track.id}
          onClick={() => selectTrack(track.id)}
          className={`flex w-24 shrink-0 flex-col items-center gap-1 rounded border p-2 ${
            track.id === selectedTrackId ? "border-cyan-500 bg-neutral-900" : "border-neutral-800 bg-neutral-900"
          }`}
        >
          <div className="flex w-full items-center gap-0.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                moveTrack(track.id, -1);
              }}
              disabled={i === 0}
              title="Move channel left"
              className="shrink-0 text-[10px] text-neutral-600 hover:text-neutral-300 disabled:opacity-20"
            >
              ◀
            </button>
            <input
              value={track.name}
              onChange={(e) => updateTrack(track.id, { name: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              title="Rename channel"
              className="w-full min-w-0 truncate bg-transparent text-center text-[10px] font-medium text-neutral-200 outline-none"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                moveTrack(track.id, 1);
              }}
              disabled={i === tracks.length - 1}
              title="Move channel right"
              className="shrink-0 text-[10px] text-neutral-600 hover:text-neutral-300 disabled:opacity-20"
            >
              ▶
            </button>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              openTrackFx(track.id);
            }}
            title="Open insert chain for this channel"
            className="flex w-full items-center justify-center gap-1 rounded bg-neutral-800 py-0.5 text-[9px] font-medium text-neutral-400 hover:text-neutral-200"
          >
            <WaveformIcon className="h-2.5 w-2.5" />
            FX{track.inserts.length > 0 ? ` (${track.inserts.length})` : ""}
          </button>

          <div className="flex h-28 items-end gap-1">
            <Fader
              valueDb={track.volumeDb}
              onChange={(db) => updateTrack(track.id, { volumeDb: db })}
              height={112}
              label={track.name}
            />
            <MeterBar analyser={engine.getTrackAnalyser(track.id)} />
          </div>
          <span className="font-mono text-[10px] tabular-nums text-neutral-500">
            {track.volumeDb.toFixed(1)}dB
          </span>

          <input
            type="range"
            min={-1}
            max={1}
            step={0.05}
            value={track.pan}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => updateTrack(track.id, { pan: Number(e.target.value) })}
            title={`Pan ${track.pan === 0 ? "C" : track.pan < 0 ? `${Math.abs(track.pan * 100).toFixed(0)}L` : `${(track.pan * 100).toFixed(0)}R`}`}
            className="w-full accent-neutral-400"
          />

          <div className="flex gap-1">
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
                track.armed ? "bg-red-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"
              }`}
            >
              ●
            </button>
          </div>
        </div>
      ))}

      <div className="ml-auto flex w-24 shrink-0 flex-col items-center gap-1 rounded border border-neutral-700 bg-neutral-900 p-2">
        <span className="text-[10px] font-semibold text-neutral-200">MASTER</span>
        <button
          onClick={openMasterFx}
          title="Open the master bus chain"
          className="flex w-full items-center justify-center gap-1 rounded bg-neutral-800 py-0.5 text-[9px] font-medium text-neutral-400 hover:text-neutral-200"
        >
          <BusIcon className="h-2.5 w-2.5" />
          FX
        </button>
        <div className="flex h-28 items-end gap-1">
          <Fader valueDb={masterVolumeDb} onChange={setMasterVolume} height={112} label="Master" />
          <MeterBar analyser={engine.getMasterAnalyser()} />
        </div>
        <span className="font-mono text-[10px] tabular-nums text-neutral-500">{masterVolumeDb.toFixed(1)}dB</span>
      </div>
    </div>
  );
}
