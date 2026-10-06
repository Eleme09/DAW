"use client";

import { faderDbToPos, faderPosToDb } from "@/lib/audio/faderLaw";
import { useState } from "react";
import { useProjectStore } from "@/state/projectStore";
import { TRACK_COLORS, type Track } from "@/types/project";
import { InputMeterRow } from "../InputMeterRow";
import { MONITOR_NEXT, MONITOR_LABEL, MONITOR_CLASS } from "../monitorLabels";
import { useMonitoringLive } from "../useMonitoringLive";
import { Knob } from "../ui/Knob";
import { BottomSheet } from "../BottomSheet";
import { AutomationIcon, MoreIcon, MicIcon, RecordIcon, ChevronDownIcon } from "../icons";
import { HEADER_WIDTH, TRACK_HEIGHT } from "./constants";

interface TrackHeaderProps {
  track: Track;
  selected: boolean;
  /** Briefly true right after this track was just created - the visible
   * confirmation that "+ Nueva pista" actually did something, distinct
   * from `selected` (which addTrack also sets, but stays on indefinitely
   * and is easy to miss if the row scrolled off-screen). */
  flash?: boolean;
}

export function TrackHeader({ track, selected, flash }: TrackHeaderProps) {
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const removeTrack = useProjectStore((s) => s.removeTrack);
  const selectTrack = useProjectStore((s) => s.selectTrack);
  const armTrack = useProjectStore((s) => s.armTrack);
  const setAutomationTrackId = useProjectStore((s) => s.setAutomationTrackId);
  const hasAutomation = track.automation.volume.enabled || track.automation.pan.enabled;
  const { monitoringLive, likelyHeadphones, isRecording } = useMonitoringLive(track.armed, track.monitorMode);
  const isLiveInput = track.armed && isRecording;
  const [moreOpen, setMoreOpen] = useState(false);
  const moveTrack = useProjectStore((s) => s.moveTrack);
  const trackCount = useProjectStore((s) => s.project.tracks.length);

  return (
    <div
      onClick={() => selectTrack(track.id)}
      style={{
        width: HEADER_WIDTH,
        height: TRACK_HEIGHT,
        // Cabecera teñida con el mismo color y la misma opacidad que su
        // carril (TrackLane.tsx) - una sola banda de color continua por
        // fila, como en BandLab real (confirmado contra captura de su app),
        // no un borde de 3px aislado de la cabecera.
        // El tinte va sobre un fondo opaco: la cabecera es sticky y los
        // clips pasan por debajo al hacer scroll horizontal - con el tinte
        // translúcido solo, se veían a través de los botones.
        backgroundColor: "var(--color-ink)",
        backgroundImage: `linear-gradient(${selected ? `${track.color}26` : `${track.color}14`}, ${selected ? `${track.color}26` : `${track.color}14`})`,
      }}
      className={`sticky left-0 z-10 relative flex shrink-0 flex-col justify-center gap-1 border-b border-r border-line p-1 pl-2.5 ${
        selected ? "ring-1 ring-inset ring-bone" : ""
      } ${isLiveInput ? "ring-1 ring-inset ring-rec" : ""} ${flash ? "animate-pulse ring-2 ring-inset ring-bone" : ""}`}
    >
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: track.color }} />
      {/* Una sola fila (nombre + Armar/Monitor/Más), no dos filas separadas
         como antes - la densidad de BandLab. Solo 3 botones (no 5) porque el
         área táctil real es 44px cada uno sin importar el truco visual: con
         un cuarto o quinto botón del mismo tamaño sus zonas de toque se
         solapan de verdad (confirmado con Playwright - un tap en "Armar"
         activaba "Monitor" en su lugar), el mismo problema de selección
         imprecisa que ya se reportó una vez. Mute/Solo se movieron a la
         hoja "Más" - siguen a un toque de distancia, y ya existen también
         por canal en el Mixer, que es donde de verdad se hace mezcla. */}
      <div className="flex items-center gap-0.5">
        <input
          value={track.name}
          onChange={(e) => updateTrack(track.id, { name: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          className={`w-full min-w-0 truncate bg-transparent text-xs font-medium outline-none ${
            track.muted ? "text-bone-3 line-through decoration-1" : "text-bone"
          }`}
        />
        {/* Estado de solo, visible sin abrir "Más" - el de mute ya se ve en
           el propio nombre (tachado). No es un botón: togglear solo vive en
           la hoja, esto es solo el indicador. */}
        {track.solo && (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-bone text-[9px] font-bold text-ink">
            S
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            armTrack(track.id);
          }}
          disabled={isRecording}
          title="Armar para grabar"
          className="flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-30"
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded ${
              track.armed ? "bg-rec text-bone" : "bg-surf text-bone-3"
            }`}
          >
            <RecordIcon className="h-3.5 w-3.5" />
          </span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            updateTrack(track.id, { monitorMode: MONITOR_NEXT[track.monitorMode] });
          }}
          title={
            monitoringLive
              ? `${MONITOR_LABEL[track.monitorMode]} — escuchando tu micrófono ahora mismo`
              : MONITOR_LABEL[track.monitorMode]
          }
          className="relative flex h-11 w-11 shrink-0 items-center justify-center"
        >
          <span className={`flex h-6 w-6 items-center justify-center rounded ${MONITOR_CLASS[track.monitorMode]}`}>
            <MicIcon className="h-4 w-4" />
          </span>
          {/* Real-time routing state, distinct from the button's own color
             (which only ever reflects the configured mode - "auto" looks
             identical whether or not the mic is routed at this instant).
             Pulses only while AudioEngine is actually sending this track's
             mic to the output right now (isTrackMonitoredLive above). */}
          {monitoringLive && (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-live" />
          )}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMoreOpen(true);
          }}
          title="Más opciones de pista"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-bone-2 hover:text-bone"
        >
          <MoreIcon className="h-4 w-4" />
        </button>
      </div>

      {track.armed && (
        <InputMeterRow
          track={track}
          isRecording={isRecording}
          monitoringLive={monitoringLive}
          likelyHeadphones={likelyHeadphones}
        />
      )}

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title={track.name}>
        <div className="flex gap-2">
          <button
            onClick={() => updateTrack(track.id, { muted: !track.muted })}
            className={`min-h-11 flex-1 rounded-full text-sm font-bold ${
              track.muted ? "bg-bone text-ink" : "bg-surf-2 text-bone-2"
            }`}
          >
            Silenciar (M)
          </button>
          <button
            onClick={() => updateTrack(track.id, { solo: !track.solo })}
            className={`min-h-11 flex-1 rounded-full text-sm font-bold ${
              track.solo ? "bg-bone text-ink" : "bg-surf-2 text-bone-2"
            }`}
          >
            Solo (S)
          </button>
        </div>
        <div className="flex items-center justify-center gap-6">
          <Knob
            value={track.volumeDb}
            min={-60}
            max={6}
            defaultValue={0}
            label="Volumen"
            unit=" dB"
            taper={{ toPos: faderDbToPos, fromPos: (p) => Math.round(faderPosToDb(p) * 10) / 10 }}
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
            className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-xs font-medium ${
              hasAutomation ? "bg-bone text-ink" : "bg-surf-2 text-bone-2"
            }`}
          >
            <AutomationIcon className="h-4 w-4" />
            Automatización
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => moveTrack(track.id, -1)}
            disabled={track.order <= 0}
            title="Subir pista"
            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-surf-2 text-xs font-medium text-bone-2 disabled:opacity-30"
          >
            <ChevronDownIcon className="h-4 w-4 rotate-180" />
            Subir
          </button>
          <button
            onClick={() => moveTrack(track.id, 1)}
            disabled={track.order >= trackCount - 1}
            title="Bajar pista"
            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-surf-2 text-xs font-medium text-bone-2 disabled:opacity-30"
          >
            <ChevronDownIcon className="h-4 w-4" />
            Bajar
          </button>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-medium uppercase tracking-wide text-bone-3">Color</label>
          <div className="flex gap-2">
            {TRACK_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => updateTrack(track.id, { color })}
                title={color}
                style={{ background: color }}
                className={`h-11 flex-1 rounded-full ${track.color === color ? "ring-2 ring-inset ring-bone" : ""}`}
              />
            ))}
          </div>
        </div>
        <button
          onClick={() => {
            removeTrack(track.id);
            setMoreOpen(false);
          }}
          disabled={isLiveInput}
          className="flex min-h-11 w-full items-center justify-center rounded-full bg-red-950 text-xs font-medium text-red-400 disabled:opacity-30"
        >
          Eliminar pista
        </button>
      </BottomSheet>
    </div>
  );
}
