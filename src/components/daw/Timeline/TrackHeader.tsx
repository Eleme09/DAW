"use client";

import { useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { useProjectStore } from "@/state/projectStore";
import type { MonitorMode, Track } from "@/types/project";
import { MeterBar } from "../MeterBar";
import { Knob } from "../ui/Knob";
import { BottomSheet } from "../BottomSheet";
import { AutomationIcon, SparkleIcon, MoreIcon, MicIcon, RecordIcon } from "../icons";
import { HEADER_WIDTH, TRACK_HEIGHT } from "./constants";

interface TrackHeaderProps {
  track: Track;
  selected: boolean;
}

const MONITOR_NEXT: Record<MonitorMode, MonitorMode> = { off: "auto", auto: "on", on: "off" };
const MONITOR_LABEL: Record<MonitorMode, string> = {
  off: "Monitor: apagado (nunca se oye la entrada)",
  auto: "Monitor: automático (se oye la entrada al detener o grabar)",
  on: "Monitor: siempre (se oye la entrada mientras esté armada)",
};
const MONITOR_CLASS: Record<MonitorMode, string> = {
  off: "bg-neutral-800 text-neutral-500",
  auto: "bg-cyan-950 text-cyan-400",
  on: "bg-green-500 text-black",
};

export function TrackHeader({ track, selected }: TrackHeaderProps) {
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const removeTrack = useProjectStore((s) => s.removeTrack);
  const selectTrack = useProjectStore((s) => s.selectTrack);
  const armTrack = useProjectStore((s) => s.armTrack);
  const isRecording = useProjectStore((s) => s.isRecording);
  const setAutomationTrackId = useProjectStore((s) => s.setAutomationTrackId);
  const hasAutomation = track.automation.volume.enabled || track.automation.pan.enabled;
  const setAssistantDraftMessage = useProjectStore((s) => s.setAssistantDraftMessage);
  const setBrowserTab = useProjectStore((s) => s.setBrowserTab);
  const setMobileView = useProjectStore((s) => s.setMobileView);
  const isLiveInput = track.armed && isRecording;
  const [moreOpen, setMoreOpen] = useState(false);
  const engine = getAudioEngine();

  return (
    <div
      onClick={() => selectTrack(track.id)}
      style={{ width: HEADER_WIDTH, height: TRACK_HEIGHT }}
      className={`sticky left-0 z-10 relative flex shrink-0 flex-col gap-1 border-b border-r border-neutral-800 bg-neutral-950 p-1.5 pl-2.5 ${
        selected ? "ring-1 ring-inset ring-cyan-500" : ""
      } ${isLiveInput ? "ring-1 ring-inset ring-red-500" : ""}`}
    >
      {/* Color de pista: barra de 3px en el canto, no fondo teñido entero
         (estudio-ui.html .thead::before) - identifica la pista sin abaratar
         la interfaz con color plano, como hace BandLab. */}
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: track.color }} />
      <div className="flex items-center gap-1.5">
        <input
          value={track.name}
          onChange={(e) => updateTrack(track.id, { name: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          className="w-full min-w-0 truncate bg-transparent text-xs font-medium text-neutral-200 outline-none"
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMoreOpen(true);
          }}
          title="Más opciones de pista"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-neutral-500 hover:text-neutral-200"
        >
          <MoreIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="flex overflow-hidden rounded-[3px]">
        <button
          onClick={(e) => {
            e.stopPropagation();
            updateTrack(track.id, { muted: !track.muted });
          }}
          title={track.muted ? "Quitar silencio" : "Silenciar"}
          className={`min-h-11 flex-1 text-[11px] font-bold ${
            track.muted ? "bg-red-500 text-black" : "bg-neutral-900 text-neutral-400 hover:text-neutral-200"
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
          className={`min-h-11 flex-1 text-[11px] font-bold ${
            track.solo ? "bg-yellow-400 text-black" : "bg-neutral-900 text-neutral-400 hover:text-neutral-200"
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
          className={`flex min-h-11 flex-1 items-center justify-center disabled:opacity-30 ${
            track.armed ? "bg-red-600 text-white" : "bg-neutral-900 text-neutral-400 hover:text-neutral-200"
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
          className={`flex min-h-11 flex-1 items-center justify-center ${MONITOR_CLASS[track.monitorMode]}`}
        >
          <MicIcon className="h-4 w-4" />
        </button>
      </div>

      {track.armed && (
        <div className="flex h-2 items-center">
          <MeterBar analyser={isLiveInput ? engine.getRecordingAnalyser() : engine.getMonitorAnalyser()} vertical={false} />
        </div>
      )}

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title={track.name}>
        <div className="flex items-center justify-center gap-6">
          <Knob
            value={track.volumeDb}
            min={-60}
            max={6}
            defaultValue={0}
            label="Volumen"
            unit=" dB"
            onChange={(volumeDb) => updateTrack(track.id, { volumeDb })}
          />
          <Knob
            value={track.pan}
            min={-1}
            max={1}
            defaultValue={0}
            decimals={2}
            label="Pan"
            onChange={(pan) => updateTrack(track.id, { pan })}
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setAutomationTrackId(track.id);
              setMoreOpen(false);
            }}
            className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded text-xs font-medium ${
              hasAutomation ? "bg-cyan-500 text-black" : "bg-neutral-800 text-neutral-300"
            }`}
          >
            <AutomationIcon className="h-4 w-4" />
            Automatización
          </button>
          <button
            onClick={() => {
              setAssistantDraftMessage(`${track.name}: `);
              setBrowserTab("assistant");
              setMobileView("browser");
              setMoreOpen(false);
            }}
            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded bg-neutral-800 text-xs font-medium text-neutral-300"
          >
            <SparkleIcon className="h-4 w-4" />
            Preguntar a la IA
          </button>
        </div>
        <button
          onClick={() => {
            removeTrack(track.id);
            setMoreOpen(false);
          }}
          disabled={isLiveInput}
          className="flex min-h-11 w-full items-center justify-center rounded bg-red-950 text-xs font-medium text-red-400 disabled:opacity-30"
        >
          Eliminar pista
        </button>
      </BottomSheet>
    </div>
  );
}
