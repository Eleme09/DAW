"use client";

import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "@/state/projectStore";
import { GRID_RESOLUTIONS, type GridResolution } from "@/lib/timing/grid";
import { Picker } from "../ui/Picker";
import { HEADER_WIDTH, MIN_TIMELINE_SECONDS, RULER_HEIGHT, TRACK_HEIGHT } from "./constants";
import { Ruler } from "./Ruler";
import { TrackHeader } from "./TrackHeader";
import { TrackLane } from "./TrackLane";
import { LoopRegion } from "./LoopRegion";
import { GridLines } from "./GridLines";
import { ContextBar } from "./ContextBar";
import { ZoomControl } from "./ZoomControl";
import { usePinchZoom } from "./usePinchZoom";
import { ScissorsIcon, DuplicateIcon, PlusIcon } from "../icons";
import { CompactTrackHeader, COLLAPSED_HEADER_WIDTH } from "./CompactTrackHeader";
import { formatTime } from "../TransportBar";
import { RegionActionBar } from "./RegionActionBar";

interface TimelineProps {
  /** Phone Studio layout: no bottom toolbar or context bar here - those live in
   * MobileStudio's own track-panel row and transport, BandLab-style. */
  compact?: boolean;
  /** Where "+ Nueva pista" goes in compact mode (MobileStudio's Add Track sheet). */
  onAddTrack?: () => void;
}

export function Timeline({ compact = false, onAddTrack }: TimelineProps = {}) {
  const project = useProjectStore((s) => s.project);
  const currentTime = useProjectStore((s) => s.currentTime);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const selectedTrackId = useProjectStore((s) => s.selectedTrackId);
  const seek = useProjectStore((s) => s.seek);
  const addTrack = useProjectStore((s) => s.addTrack);
  const removeEmptyTracks = useProjectStore((s) => s.removeEmptyTracks);
  const splitClipAtPlayhead = useProjectStore((s) => s.splitClipAtPlayhead);
  const duplicateClipAtPlayhead = useProjectStore((s) => s.duplicateClipAtPlayhead);
  const snapResolution = useProjectStore((s) => s.snapResolution);
  const setSnapResolution = useProjectStore((s) => s.setSnapResolution);
  const pixelsPerSecond = useProjectStore((s) => s.pixelsPerSecond);
  const setPixelsPerSecond = useProjectStore((s) => s.setPixelsPerSecond);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [flashTrackId, setFlashTrackId] = useState<string | null>(null);
  const isRecording = useProjectStore((s) => s.isRecording);
  // Phone Studio (compact) works like BandLab's: the playhead stays FIXED in
  // the middle of the screen and the tracks slide under it - swiping the
  // timeline IS moving through the song. Time 0 therefore sits half a
  // viewport in (`origin`), and the name column shrinks to just the icon as
  // soon as you swipe away from the start, giving the waveforms the room.
  const [viewWidth, setViewWidth] = useState(0);
  const [scrolledAway, setScrolledAway] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const actionTrackId = useProjectStore((s) => s.selectedClip?.trackId ?? s.selectedTrackId);
  const expectedScrollLeft = useRef<number | null>(null);
  const origin = compact ? Math.max(HEADER_WIDTH * 0.75, Math.round(viewWidth / 2)) : HEADER_WIDTH;
  const headerWidth = compact ? (scrolledAway ? COLLAPSED_HEADER_WIDTH : origin) : HEADER_WIDTH;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !compact) return;
    const ro = new ResizeObserver(() => setViewWidth(el.clientWidth));
    ro.observe(el);
    setViewWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [compact]);

  // Compact: keep the scroll position locked to the playhead - during
  // playback/recording the tracks scroll under the fixed line; while
  // stopped, anything else that moves the playhead (rewind, ruler tap, zoom)
  // scrolls the view to match.
  useEffect(() => {
    if (!compact) return;
    const el = scrollRef.current;
    if (!el) return;
    const target = currentTime * pixelsPerSecond;
    if (Math.abs(el.scrollLeft - target) < 1) return;
    expectedScrollLeft.current = target;
    el.scrollLeft = target;
  }, [compact, currentTime, pixelsPerSecond, viewWidth]);

  function handleScroll() {
    if (!compact) return;
    const el = scrollRef.current;
    if (!el) return;
    setScrolledAway(el.scrollLeft > 2);
    setScrollTop(el.scrollTop);
    const expected = expectedScrollLeft.current;
    if (expected !== null && Math.abs(el.scrollLeft - expected) < 1.5) {
      expectedScrollLeft.current = null;
      return;
    }
    // A swipe by the user: that's a seek. Not while playing/recording - the
    // transport owns the position then.
    if (isPlaying || isRecording) return;
    seek(Math.max(0, el.scrollLeft / pixelsPerSecond));
  }
  // Guards only this button's own double-tap/double-fire (a stuck pointer
  // event on touch screens was creating a pile of empty tracks with no
  // visible cause). Local to this component instance, not the store - the
  // store's addTrack() itself stays a plain, always-succeeds action so
  // programmatic batch callers (tests) are unaffected.
  const lastAddClickAt = useRef(0);

  usePinchZoom(scrollRef, pixelsPerSecond, setPixelsPerSecond, compact ? { originX: origin, anchorLocalX: origin } : {});

  // Visible feedback for "+ Nueva pista": a track appended off-screen (a
  // session already scrolled down, or a tall list) otherwise gives zero
  // indication anything happened - scroll it into view and flash its
  // header briefly. Driven directly from the click, not an effect watching
  // the tracks array, so it fires exactly once per add and never for
  // removals/reorders.
  function handleAddTrack() {
    const now = Date.now();
    if (now - lastAddClickAt.current < 600) return;
    lastAddClickAt.current = now;
    const track = addTrack();
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
    if (!isPlaying || compact) return;
    const el = scrollRef.current;
    if (!el) return;
    const playheadX = HEADER_WIDTH + currentTime * pixelsPerSecond;
    const viewLeft = el.scrollLeft;
    const viewRight = viewLeft + el.clientWidth;
    const margin = el.clientWidth * 0.1;
    if (playheadX < viewLeft + HEADER_WIDTH || playheadX > viewRight - margin) {
      el.scrollLeft = Math.max(0, playheadX - HEADER_WIDTH - el.clientWidth * 0.25);
    }
  }, [currentTime, isPlaying, pixelsPerSecond, compact]);

  const emptyTrackCount = project.tracks.filter((t) => t.clips.length === 0).length;

  const clipEnd = project.tracks.reduce(
    (max, t) => Math.max(max, ...t.clips.map((c) => c.startTime + c.duration), 0),
    0
  );
  const durationSec = Math.max(MIN_TIMELINE_SECONDS, clipEnd + 15);
  const contentWidth = durationSec * pixelsPerSecond;
  const tracksHeight = RULER_HEIGHT + project.tracks.length * TRACK_HEIGHT;
  // Compact needs room after the end too, so the last second can still be
  // brought under the centered playhead.
  const totalWidth = origin + contentWidth + (compact ? Math.max(0, viewWidth - origin) : 0);
  // Lanes keep time 0 at `origin` whatever the header column's width is.
  const laneOffset = origin - headerWidth;

  const actionRowIndex = project.tracks.findIndex((t) => t.id === actionTrackId);

  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-ink">
      {compact && actionRowIndex !== -1 && (
        <RegionActionBar
          rowTop={RULER_HEIGHT + actionRowIndex * TRACK_HEIGHT - scrollTop}
          rowHeight={TRACK_HEIGHT}
          minTop={RULER_HEIGHT + 4}
        />
      )}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
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
              <p className="text-xs text-bone-3">Agrega una pista para grabar tu voz, o importa tu beat (audio o video)</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                onClick={() => (onAddTrack ? onAddTrack() : handleAddTrack())}
                className="min-h-11 rounded-full bg-bone px-5 py-1.5 text-sm font-semibold text-ink hover:opacity-90"
              >
                + Nueva pista
              </button>
            </div>
          </div>
        )}
        <div className="relative" style={{ width: totalWidth }}>
          <div className="sticky top-0 z-20 flex">
            <div
              className="sticky left-0 z-30 flex shrink-0 items-center border-b border-r border-line bg-ink px-2 transition-[width] duration-150"
              style={{ width: headerWidth, height: RULER_HEIGHT }}
            >
              {compact && (
                <span
                  className="absolute left-1.5 top-1/2 z-40 -translate-y-1/2 whitespace-nowrap rounded bg-ink/90 px-1 font-mono text-[11px] tabular-nums text-bone"
                  title="Posición de reproducción"
                >
                  {formatTime(currentTime)}
                </span>
              )}
            </div>
            <div className="shrink-0" style={{ marginLeft: laneOffset }}>
              <Ruler width={contentWidth} bpm={project.bpm} timeSignature={project.timeSignature} onSeek={(t) => seek(t)} />
            </div>
          </div>

          <div className="absolute left-0 top-0" style={{ left: origin }}>
            <LoopRegion height={tracksHeight} />
          </div>

          {project.tracks.map((track) => (
            <div key={track.id} className="flex">
              {compact ? (
                <CompactTrackHeader track={track} width={headerWidth} collapsed={scrolledAway} selected={track.id === selectedTrackId} />
              ) : (
                <TrackHeader track={track} selected={track.id === selectedTrackId} flash={track.id === flashTrackId} />
              )}
              <div className="shrink-0" style={{ marginLeft: laneOffset }}>
                <TrackLane track={track} width={contentWidth} selected={track.id === selectedTrackId} compact={compact} />
              </div>
            </div>
          ))}

          {compact && project.tracks.length > 0 && onAddTrack && (
            <div className="sticky left-0 z-10 p-1.5 transition-[width] duration-150" style={{ width: headerWidth }}>
              <button
                onClick={onAddTrack}
                aria-label="Nueva pista"
                title="Nueva pista: grabar voz o importar audio/video"
                className="flex h-11 w-full items-center justify-center rounded-lg bg-surf-2 text-bone hover:bg-surf-3"
              >
                <PlusIcon className="h-5 w-5" />
              </button>
            </div>
          )}

          {project.tracks.length > 0 && (
            <div
              className="pointer-events-none absolute"
              style={{ left: origin, top: tracksHeight, width: contentWidth, height: 2000 }}
            >
              <GridLines width={contentWidth} pixelsPerSecond={pixelsPerSecond} />
            </div>
          )}

          <div
            className="pointer-events-none absolute top-0 z-10 w-px bg-bone"
            style={{ left: origin + currentTime * pixelsPerSecond, height: compact ? tracksHeight + 2000 : tracksHeight }}
          >
            {/* Banderín triangular sobre la línea de reproducción */}
            <div className="absolute -left-1 top-0 h-0 w-0 border-x-4 border-t-4 border-x-transparent border-t-bone" />
          </div>
        </div>
      </div>

      {!compact && project.tracks.length > 0 && <ContextBar />}

      {!compact && (
      <div className="flex flex-wrap items-center gap-2 border-t border-line p-2">
        {project.tracks.length > 0 && (
          <button
            onClick={() => handleAddTrack()}
            className="rounded bg-surf-2 min-h-11 px-3 py-1.5 text-xs font-medium text-bone hover:bg-surf-3"
          >
            + Nueva pista
          </button>
        )}
        {emptyTrackCount >= 2 && (
          <button
            onClick={() => {
              if (window.confirm(`Vas a eliminar ${emptyTrackCount} pistas vacías (sin audio). ¿Continuar?`)) {
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
      )}
    </div>
  );
}
