"use client";

import { useProjectStore } from "@/state/projectStore";
import { GRID_RESOLUTIONS, type GridResolution } from "@/lib/timing/grid";
import { Picker } from "../ui/Picker";
import { HEADER_WIDTH, MIN_TIMELINE_SECONDS, PIXELS_PER_SECOND, RULER_HEIGHT, TRACK_HEIGHT } from "./constants";
import { Ruler } from "./Ruler";
import { TrackHeader } from "./TrackHeader";
import { TrackLane } from "./TrackLane";
import { LoopRegion } from "./LoopRegion";
import { ScissorsIcon, DuplicateIcon } from "../icons";

export function Timeline() {
  const project = useProjectStore((s) => s.project);
  const currentTime = useProjectStore((s) => s.currentTime);
  const selectedTrackId = useProjectStore((s) => s.selectedTrackId);
  const seek = useProjectStore((s) => s.seek);
  const addTrack = useProjectStore((s) => s.addTrack);
  const splitClipAtPlayhead = useProjectStore((s) => s.splitClipAtPlayhead);
  const duplicateClipAtPlayhead = useProjectStore((s) => s.duplicateClipAtPlayhead);
  const addPatternAtPlayhead = useProjectStore((s) => s.addPatternAtPlayhead);
  const snapResolution = useProjectStore((s) => s.snapResolution);
  const setSnapResolution = useProjectStore((s) => s.setSnapResolution);
  const setBrowserTab = useProjectStore((s) => s.setBrowserTab);
  const setMobileView = useProjectStore((s) => s.setMobileView);

  function goToBeatGen() {
    setBrowserTab("generate");
    setMobileView("browser");
  }

  const selectedTrack = project.tracks.find((t) => t.id === selectedTrackId);
  const canAddPattern = selectedTrack?.type === "instrument";

  const clipEnd = project.tracks.reduce(
    (max, t) => Math.max(max, ...t.clips.map((c) => c.startTime + c.duration), 0),
    0
  );
  const durationSec = Math.max(MIN_TIMELINE_SECONDS, clipEnd + 15);
  const contentWidth = durationSec * PIXELS_PER_SECOND;
  const tracksHeight = RULER_HEIGHT + project.tracks.length * TRACK_HEIGHT;

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-neutral-950">
      <div className="relative flex-1 overflow-auto">
        {project.tracks.length === 0 && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 text-center">
            <div>
              <p className="text-sm font-medium text-neutral-400">Todavía no hay pistas</p>
              <p className="text-xs text-neutral-600">Empieza con una de estas opciones, o importa un sample desde la pestaña Biblioteca</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                onClick={() => addTrack()}
                className="rounded bg-neutral-800 min-h-11 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
              >
                + Nueva pista
              </button>
              <button
                onClick={() => addTrack(undefined, "instrument")}
                title="Una pista con un instrumento synth/sampler, reproducible desde patrones programados"
                className="rounded bg-neutral-800 min-h-11 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
              >
                + Nuevo instrumento
              </button>
              <button
                onClick={goToBeatGen}
                title="Genera un boceto completo de batería/bajo/acordes/melodía para empezar"
                className="rounded bg-cyan-500 min-h-11 px-3 py-1.5 text-xs font-semibold text-black hover:bg-cyan-400"
              >
                Generar un beat
              </button>
            </div>
          </div>
        )}
        <div className="relative" style={{ width: HEADER_WIDTH + contentWidth }}>
          <div className="sticky top-0 z-20 flex">
            <div
              className="sticky left-0 z-30 shrink-0 border-b border-r border-neutral-800 bg-neutral-950"
              style={{ width: HEADER_WIDTH, height: RULER_HEIGHT }}
            />
            <Ruler width={contentWidth} bpm={project.bpm} timeSignature={project.timeSignature} onSeek={(t) => seek(t)} />
          </div>

          <div className="absolute left-0 top-0" style={{ left: HEADER_WIDTH }}>
            <LoopRegion height={tracksHeight} />
          </div>

          {project.tracks.map((track) => (
            <div key={track.id} className="flex">
              <TrackHeader track={track} selected={track.id === selectedTrackId} />
              <TrackLane track={track} width={contentWidth} selected={track.id === selectedTrackId} />
            </div>
          ))}

          <div
            className="pointer-events-none absolute top-0 z-10 w-px bg-cyan-500"
            style={{ left: HEADER_WIDTH + currentTime * PIXELS_PER_SECOND, height: tracksHeight }}
          >
            {/* Banderín de 1px con bandera triangular, como en Pro Tools
               (estudio-ui.html .playhead::before) - marca la cabeza de
               reproducción sin depender solo de la línea delgada. */}
            <div className="absolute -left-1 top-0 h-0 w-0 border-x-4 border-t-4 border-x-transparent border-t-cyan-500" />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-neutral-800 p-2">
        {project.tracks.length > 0 && (
          <>
            <button
              onClick={() => addTrack()}
              className="rounded bg-neutral-800 min-h-11 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
            >
              + Nueva pista
            </button>
            <button
              onClick={() => addTrack(undefined, "instrument")}
              title="Agrega una pista con un instrumento synth/sampler, reproducible desde patrones programados"
              className="rounded bg-neutral-800 min-h-11 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
            >
              + Nuevo instrumento
            </button>
          </>
        )}
        <button
          onClick={addPatternAtPlayhead}
          disabled={!canAddPattern}
          title={
            canAddPattern
              ? "Agrega un patrón de un compás a la pista de instrumento seleccionada en el playhead"
              : "Selecciona primero una pista de instrumento"
          }
          className="rounded bg-neutral-800 min-h-11 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 disabled:opacity-30"
        >
          + Nuevo patrón
        </button>
        <button
          onClick={splitClipAtPlayhead}
          title="Divide el clip de la pista seleccionada en el playhead (atajo: S)"
          className="flex items-center gap-1.5 rounded bg-neutral-800 min-h-11 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
        >
          <ScissorsIcon className="h-3.5 w-3.5" /> Dividir
        </button>
        <button
          onClick={duplicateClipAtPlayhead}
          title="Duplica el clip de la pista seleccionada en el playhead (atajo: D)"
          className="flex items-center gap-1.5 rounded bg-neutral-800 min-h-11 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
        >
          <DuplicateIcon className="h-3.5 w-3.5" /> Duplicar
        </button>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-neutral-400" title="Ajustar clips a la rejilla musical">
          <span className="font-medium">Ajuste</span>
          <div className="w-24">
            <Picker<GridResolution>
              value={snapResolution}
              options={GRID_RESOLUTIONS.map((r) => ({ value: r, label: r === "off" ? "Desactivado" : r }))}
              title="Resolución de ajuste"
              onChange={setSnapResolution}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
