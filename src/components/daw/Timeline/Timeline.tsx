"use client";

import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "@/state/projectStore";
import type { Track } from "@/types/project";
import { GRID_RESOLUTIONS, type GridResolution } from "@/lib/timing/grid";
import { Picker } from "../ui/Picker";
import { HEADER_WIDTH, MIN_TIMELINE_SECONDS, RULER_HEIGHT, TRACK_HEIGHT } from "./constants";
import { Ruler } from "./Ruler";
import { TrackHeader } from "./TrackHeader";
import { TrackLane } from "./TrackLane";
import { LoopRegion } from "./LoopRegion";
import { ContextBar } from "./ContextBar";
import { ZoomControl } from "./ZoomControl";
import { usePinchZoom } from "./usePinchZoom";
import { ScissorsIcon, DuplicateIcon } from "../icons";

export function Timeline() {
  const project = useProjectStore((s) => s.project);
  const currentTime = useProjectStore((s) => s.currentTime);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const selectedTrackId = useProjectStore((s) => s.selectedTrackId);
  const seek = useProjectStore((s) => s.seek);
  const addTrack = useProjectStore((s) => s.addTrack);
  const removeEmptyTracks = useProjectStore((s) => s.removeEmptyTracks);
  const splitClipAtPlayhead = useProjectStore((s) => s.splitClipAtPlayhead);
  const duplicateClipAtPlayhead = useProjectStore((s) => s.duplicateClipAtPlayhead);
  const addPatternAtPlayhead = useProjectStore((s) => s.addPatternAtPlayhead);
  const snapResolution = useProjectStore((s) => s.snapResolution);
  const setSnapResolution = useProjectStore((s) => s.setSnapResolution);
  const pixelsPerSecond = useProjectStore((s) => s.pixelsPerSecond);
  const setPixelsPerSecond = useProjectStore((s) => s.setPixelsPerSecond);
  const setBrowserTab = useProjectStore((s) => s.setBrowserTab);
  const setMobileView = useProjectStore((s) => s.setMobileView);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [flashTrackId, setFlashTrackId] = useState<string | null>(null);
  // Guards only this button's own double-tap/double-fire (a stuck pointer
  // event on touch screens was creating a pile of empty tracks with no
  // visible cause). Local to this component instance, not the store - the
  // store's addTrack() itself stays a plain, always-succeeds action so
  // programmatic batch callers (Beat Generator, tests) are unaffected.
  const lastAddClickAt = useRef(0);

  usePinchZoom(scrollRef, pixelsPerSecond, setPixelsPerSecond);

  // Visible feedback for "+ Nueva pista"/"+ Nuevo instrumento": a track
  // appended off-screen (a session already scrolled down, or a tall list)
  // otherwise gives zero indication anything happened - scroll it into view
  // and flash its header briefly. Driven directly from the click, not an
  // effect watching the tracks array, so it fires exactly once per add and
  // never for removals/reorders.
  function handleAddTrack(type?: Track["type"]) {
    const now = Date.now();
    if (now - lastAddClickAt.current < 600) return;
    lastAddClickAt.current = now;
    const track = addTrack(undefined, type);
    const index = useProjectStore.getState().project.tracks.findIndex((t) => t.id === track.id);
    const el = scrollRef.current;
    if (el && index !== -1) {
      const rowTop = RULER_HEIGHT + index * TRACK_HEIGHT;
      el.scrollTop = Math.max(0, rowTop - el.clientHeight / 2 + TRACK_HEIGHT / 2);
    }
    setFlashTrackId(track.id);
    window.setTimeout(() => setFlashTrackId((current) => (current === track.id ? null : current)), 1200);
  }

  // Keeps the playhead on-screen during playback instead of letting it run
  // off the right edge of the scrolled viewport - re-checks on every
  // transport tick (currentTime changes every animation frame while
  // playing). Only nudges scrollLeft when the playhead is actually about
  // to leave the visible area, and re-centers it toward the left third of
  // the viewport rather than pinning it to one exact pixel every frame -
  // same "follow" convention as Pro Tools/Ableton, not a hard lock that'd
  // fight a manual scroll the instant playback starts.
  useEffect(() => {
    if (!isPlaying) return;
    const el = scrollRef.current;
    if (!el) return;
    const playheadX = HEADER_WIDTH + currentTime * pixelsPerSecond;
    const viewLeft = el.scrollLeft;
    const viewRight = viewLeft + el.clientWidth;
    const margin = el.clientWidth * 0.1;
    if (playheadX < viewLeft + HEADER_WIDTH || playheadX > viewRight - margin) {
      el.scrollLeft = Math.max(0, playheadX - HEADER_WIDTH - el.clientWidth * 0.25);
    }
  }, [currentTime, isPlaying, pixelsPerSecond]);

  function goToBeatGen() {
    setBrowserTab("generate");
    setMobileView("browser");
  }

  const selectedTrack = project.tracks.find((t) => t.id === selectedTrackId);
  const canAddPattern = selectedTrack?.type === "instrument";
  const emptyTrackCount = project.tracks.filter((t) => t.clips.length === 0 && t.midiClips.length === 0).length;

  const clipEnd = project.tracks.reduce(
    (max, t) => Math.max(max, ...t.clips.map((c) => c.startTime + c.duration), 0),
    0
  );
  const durationSec = Math.max(MIN_TIMELINE_SECONDS, clipEnd + 15);
  const contentWidth = durationSec * pixelsPerSecond;
  const tracksHeight = RULER_HEIGHT + project.tracks.length * TRACK_HEIGHT;

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-ink">
      <div
        ref={scrollRef}
        className="relative flex-1 overflow-auto"
        // pan-x pan-y (not "auto"/unset) keeps native one-finger scrolling
        // in both directions but excludes the browser's own pinch-to-zoom,
        // which would otherwise fight usePinchZoom's own two-finger
        // handling (zooming the whole page instead of the timeline).
        style={{ touchAction: "pan-x pan-y" }}
      >
        {project.tracks.length === 0 && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 text-center">
            <div>
              <p className="text-sm font-medium text-bone-2">Todavía no hay pistas</p>
              <p className="text-xs text-bone-3">Empieza con una de estas opciones, o importa un sample desde la pestaña Biblioteca</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                onClick={() => handleAddTrack()}
                className="rounded bg-surf-2 min-h-11 px-3 py-1.5 text-xs font-medium text-bone hover:bg-surf-3"
              >
                + Nueva pista
              </button>
              <button
                onClick={() => handleAddTrack("instrument")}
                title="Una pista con un instrumento synth/sampler, reproducible desde patrones programados"
                className="rounded bg-surf-2 min-h-11 px-3 py-1.5 text-xs font-medium text-bone hover:bg-surf-3"
              >
                + Nuevo instrumento
              </button>
              <button
                onClick={goToBeatGen}
                title="Genera un boceto completo de batería/bajo/acordes/melodía para empezar"
                className="rounded bg-bone min-h-11 px-3 py-1.5 text-xs font-semibold text-ink hover:opacity-90"
              >
                Generar un beat
              </button>
            </div>
          </div>
        )}
        <div className="relative" style={{ width: HEADER_WIDTH + contentWidth }}>
          <div className="sticky top-0 z-20 flex">
            <div
              className="sticky left-0 z-30 shrink-0 border-b border-r border-line bg-ink"
              style={{ width: HEADER_WIDTH, height: RULER_HEIGHT }}
            />
            <Ruler width={contentWidth} bpm={project.bpm} timeSignature={project.timeSignature} onSeek={(t) => seek(t)} />
          </div>

          <div className="absolute left-0 top-0" style={{ left: HEADER_WIDTH }}>
            <LoopRegion height={tracksHeight} />
          </div>

          {project.tracks.map((track) => (
            <div key={track.id} className="flex">
              <TrackHeader track={track} selected={track.id === selectedTrackId} flash={track.id === flashTrackId} />
              <TrackLane track={track} width={contentWidth} selected={track.id === selectedTrackId} />
            </div>
          ))}

          <div
            className="pointer-events-none absolute top-0 z-10 w-px bg-bone"
            style={{ left: HEADER_WIDTH + currentTime * pixelsPerSecond, height: tracksHeight }}
          >
            {/* Banderín de 1px con bandera triangular, como en Pro Tools
               (estudio-ui.html .playhead::before) - marca la cabeza de
               reproducción sin depender solo de la línea delgada. */}
            <div className="absolute -left-1 top-0 h-0 w-0 border-x-4 border-t-4 border-x-transparent border-t-bone" />
          </div>
        </div>
      </div>

      {project.tracks.length > 0 && <ContextBar />}

      <div className="flex flex-wrap items-center gap-2 border-t border-line p-2">
        {project.tracks.length > 0 && (
          <>
            <button
              onClick={() => handleAddTrack()}
              className="rounded bg-surf-2 min-h-11 px-3 py-1.5 text-xs font-medium text-bone hover:bg-surf-3"
            >
              + Nueva pista
            </button>
            <button
              onClick={() => handleAddTrack("instrument")}
              title="Agrega una pista con un instrumento synth/sampler, reproducible desde patrones programados"
              className="rounded bg-surf-2 min-h-11 px-3 py-1.5 text-xs font-medium text-bone hover:bg-surf-3"
            >
              + Nuevo instrumento
            </button>
          </>
        )}
        {emptyTrackCount >= 2 && (
          <button
            onClick={() => {
              if (window.confirm(`Vas a eliminar ${emptyTrackCount} pistas vacías (sin audio ni MIDI). ¿Continuar?`)) {
                removeEmptyTracks();
              }
            }}
            title="Elimina de una vez todas las pistas que no tienen ningún clip"
            className="rounded bg-surf-2 min-h-11 px-3 py-1.5 text-xs font-medium text-bone-2 hover:bg-surf-3 hover:text-bone"
          >
            Eliminar {emptyTrackCount} pistas vacías
          </button>
        )}
        <button
          onClick={addPatternAtPlayhead}
          disabled={!canAddPattern}
          title={
            canAddPattern
              ? "Agrega un patrón de un compás a la pista de instrumento seleccionada en el playhead"
              : "Selecciona primero una pista de instrumento"
          }
          className="rounded bg-surf-2 min-h-11 px-3 py-1.5 text-xs font-medium text-bone hover:bg-surf-3 disabled:opacity-30"
        >
          + Nuevo patrón
        </button>
        <button
          onClick={splitClipAtPlayhead}
          title="Divide el clip de la pista seleccionada en el playhead (atajo: S)"
          className="flex items-center gap-1.5 rounded bg-surf-2 min-h-11 px-3 py-1.5 text-xs font-medium text-bone hover:bg-surf-3"
        >
          <ScissorsIcon className="h-3.5 w-3.5" /> Dividir
        </button>
        <button
          onClick={duplicateClipAtPlayhead}
          title="Duplica el clip de la pista seleccionada en el playhead (atajo: D)"
          className="flex items-center gap-1.5 rounded bg-surf-2 min-h-11 px-3 py-1.5 text-xs font-medium text-bone hover:bg-surf-3"
        >
          <DuplicateIcon className="h-3.5 w-3.5" /> Duplicar
        </button>
        <ZoomControl value={pixelsPerSecond} onChange={setPixelsPerSecond} />
        <div className="ml-auto flex items-center gap-1.5 text-xs text-bone-2" title="Ajustar clips a la rejilla musical">
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
