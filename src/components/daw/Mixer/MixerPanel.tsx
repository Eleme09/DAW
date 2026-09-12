"use client";

import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { useProjectStore } from "@/state/projectStore";
import type { MonitorMode } from "@/types/project";
import { MeterBar } from "../MeterBar";
import { WaveformIcon, BusIcon, MicIcon, ChevronLeftIcon, ChevronRightIcon, RecordIcon } from "../icons";
import { Knob } from "../ui/Knob";
import { Fader } from "./Fader";

const MONITOR_NEXT: Record<MonitorMode, MonitorMode> = { off: "auto", auto: "on", on: "off" };
const MONITOR_LABEL: Record<MonitorMode, string> = {
  off: "Monitor: apagado (nunca se oye la entrada)",
  auto: "Monitor: automático (se oye la entrada al detener o grabar)",
  on: "Monitor: siempre (se oye la entrada mientras esté armada)",
};
const MONITOR_CLASS: Record<MonitorMode, string> = {
  off: "bg-surf-2 text-bone-3 hover:text-bone",
  auto: "bg-surf-3 text-bone-2",
  on: "bg-live text-ink",
};

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
    <div className="flex h-full flex-1 gap-2 overflow-x-auto border-t border-line bg-ink p-2 md:h-auto md:min-h-64 md:flex-none">
      {tracks.length === 0 && (
        <div className="flex flex-1 items-center justify-center text-xs text-bone-3">
          Todavía no hay pistas — agrega una desde la Sesión
        </div>
      )}
      {tracks.map((track, i) => (
        <div
          key={track.id}
          onClick={() => selectTrack(track.id)}
          className={`flex w-32 shrink-0 flex-col items-center gap-1.5 rounded border p-2 ${
            track.id === selectedTrackId ? "border-bone bg-surf" : "border-line bg-surf"
          }`}
        >
          <div className="flex w-full items-center gap-1">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: track.color }}
              title="Color de la pista"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                moveTrack(track.id, -1);
              }}
              disabled={i === 0}
              title="Mover canal a la izquierda"
              className="-mx-2.5 flex h-11 w-11 shrink-0 items-center justify-center text-bone-3 hover:text-bone-2 disabled:opacity-20"
            >
              <ChevronLeftIcon className="h-3.5 w-3.5" />
            </button>
            <input
              value={track.name}
              onChange={(e) => updateTrack(track.id, { name: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              title="Renombrar canal"
              className="w-full min-w-0 truncate bg-transparent text-center text-[11px] font-medium text-bone outline-none"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                moveTrack(track.id, 1);
              }}
              disabled={i === tracks.length - 1}
              title="Mover canal a la derecha"
              className="-mx-2.5 flex h-11 w-11 shrink-0 items-center justify-center text-bone-3 hover:text-bone-2 disabled:opacity-20"
            >
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              openTrackFx(track.id);
            }}
            title="Abrir cadena de inserts de este canal"
            className="flex min-h-11 w-full items-center justify-center gap-1 rounded bg-surf-2 text-[10px] font-medium text-bone-2 hover:text-bone"
          >
            <WaveformIcon className="h-3 w-3" />
            FX{track.inserts.length > 0 ? ` (${track.inserts.length})` : ""}
          </button>

          <div className="flex h-32 items-end gap-1">
            <Fader
              valueDb={track.volumeDb}
              onChange={(db) => updateTrack(track.id, { volumeDb: db })}
              height={128}
              label={track.name}
              showScale
            />
            <MeterBar analyser={engine.getTrackAnalyser(track.id)} />
          </div>
          <span className="font-mono text-[10px] tabular-nums text-bone-2">
            {track.volumeDb.toFixed(1)}dB
          </span>

          <Knob
            value={track.pan}
            min={-1}
            max={1}
            defaultValue={0}
            decimals={2}
            label="Pan"
            size={32}
            onChange={(pan) => updateTrack(track.id, { pan })}
          />

          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                updateTrack(track.id, { muted: !track.muted });
              }}
              title={track.muted ? "Quitar silencio" : "Silenciar"}
              className={`flex h-11 w-11 items-center justify-center rounded text-[11px] font-bold ${
                track.muted ? "bg-red-500 text-black" : "bg-surf-2 text-bone-2 hover:text-bone"
              }`}
            >
              M
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                updateTrack(track.id, { solo: !track.solo });
              }}
              title={track.solo ? "Quitar solo" : "Solo"}
              className={`flex h-11 w-11 items-center justify-center rounded text-[11px] font-bold ${
                track.solo ? "bg-yellow-400 text-black" : "bg-surf-2 text-bone-2 hover:text-bone"
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
              title="Armar para grabar"
              className={`flex h-11 w-11 items-center justify-center rounded disabled:opacity-30 ${
                track.armed ? "bg-rec text-bone" : "bg-surf-2 text-bone-2 hover:text-bone"
              }`}
            >
              <RecordIcon className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                updateTrack(track.id, { monitorMode: MONITOR_NEXT[track.monitorMode] });
              }}
              title={MONITOR_LABEL[track.monitorMode]}
              className={`flex h-11 w-11 items-center justify-center rounded ${MONITOR_CLASS[track.monitorMode]}`}
            >
              <MicIcon className="h-4 w-4" />
            </button>
          </div>
          {track.armed && (
            <div className="flex h-2 w-full items-center">
              <MeterBar
                analyser={track.armed && isRecording ? engine.getRecordingAnalyser() : engine.getMonitorAnalyser()}
                vertical={false}
              />
            </div>
          )}
        </div>
      ))}

      <div className="ml-auto flex w-32 shrink-0 flex-col items-center gap-1.5 rounded border border-line-2 bg-surf p-2">
        <span className="text-[11px] font-semibold text-bone">MASTER</span>
        <button
          onClick={openMasterFx}
          title="Abrir la cadena del bus master"
          className="flex min-h-11 w-full items-center justify-center gap-1 rounded bg-surf-2 text-[10px] font-medium text-bone-2 hover:text-bone"
        >
          <BusIcon className="h-3 w-3" />
          FX
        </button>
        <div className="flex h-32 items-end gap-1">
          <Fader valueDb={masterVolumeDb} onChange={setMasterVolume} height={128} label="Master" showScale />
          <MeterBar analyser={engine.getMasterAnalyser()} />
        </div>
        <span className="font-mono text-[10px] tabular-nums text-bone-2">{masterVolumeDb.toFixed(1)}dB</span>
      </div>
    </div>
  );
}
