"use client";

import { useEffect, useRef, useState } from "react";
import { useClipDrag } from "./clipDrag";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { useProjectStore } from "@/state/projectStore";
import type { AudioClip } from "@/types/project";
import { snapToGrid } from "@/lib/timing/grid";
import { getOverlappingTakes } from "@/lib/timeline/takes";
import { TRACK_HEIGHT } from "./constants";
import { Waveform } from "../Waveform";
import { Picker } from "../ui/Picker";

const MIN_CLIP_SEC = 0.05;
const TAP_THRESHOLD_PX = 6;
/** Press and hold this long on a region to pick it up (BandLab). */
const LONG_PRESS_MS = 300;
/** Near the timeline's edges a dragged region scrolls the view. */
const EDGE_PX = 40;
const EDGE_SPEED = 9; // px per frame at the very edge

type DragState =
  /** Finger down on an unselected region: a hold picks it up, a swipe scrolls. */
  | { mode: "press"; startX: number; startY: number; timer: number }
  /** Moving a region (both axes): previewed, committed on release. */
  | { mode: "move"; startX: number; startY: number; scrollLeft: number; scrollTop: number; lifted: boolean }
  | { mode: "trim-left"; startX: number; startTime: number; sourceOffset: number; duration: number }
  | { mode: "trim-right"; startX: number; duration: number };

/**
 * A region in the phone Studio, behaving like BandLab's (user's screen
 * recordings): tap selects it - white outline + white circles on both ends
 * to trim/extend - and opens the Region Action Menu (RegionActionBar).
 * Press and hold a region (or just drag a selected one) to pick it up and
 * slide it anywhere: earlier/later (snapped to the grid), onto another
 * track, or below the last track for a new one - previewed while you drag,
 * applied once on release (one undo step). A quick swipe on an unselected
 * region still moves through the song.
 * Drawn like a pro console's clip (Pro Tools) but sized for a finger: a
 * name strip on top (name, clip gain, loop mark), a dark body in the
 * track colour with the waveform in full colour and a defined border; a
 * looped region repeats its waveform tile; fades shade the faded part
 * under a curve.
 */
/** Grey used for regions that can't be heard (muted track, or another track
 * is soloed) - BandLab greys those regions out (user's recording). */
const SILENT_COLOR = "#5f5f66";
/** Height of the name strip on top of a region. */
const STRIP_PX = 14;

export function CompactClipView({
  clip,
  laneHeight = TRACK_HEIGHT,
  audible = true,
}: {
  clip: AudioClip;
  laneHeight?: number;
  audible?: boolean;
}) {
  const updateClip = useProjectStore((s) => s.updateClip);
  const selectClip = useProjectStore((s) => s.selectClip);
  const selectTake = useProjectStore((s) => s.selectTake);
  const selected = useProjectStore((s) => s.selectedClip?.clipId === clip.id);
  const bpm = useProjectStore((s) => s.project.bpm);
  const timeSignature = useProjectStore((s) => s.project.timeSignature);
  const snapResolution = useProjectStore((s) => s.snapResolution);
  const pps = useProjectStore((s) => s.pixelsPerSecond);
  const trackClips = useProjectStore((s) => s.project.tracks.find((t) => t.id === clip.trackId)?.clips);
  const takes = trackClips ? getOverlappingTakes(trackClips, clip) : [];
  const [loaded, setLoaded] = useState<{ sampleId: string; buffer: AudioBuffer | null } | null>(null);
  // A processed region (reverse, transpose...) points at a new sample - read
  // the cache first, fall back to whatever the loader brought back for it.
  const buffer =
    getAudioEngine().getBuffer(clip.sampleId) ?? (loaded?.sampleId === clip.sampleId ? loaded.buffer : null);
  const drag = useRef<DragState | null>(null);
  const travel = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const trackIndex = useProjectStore((s) => s.project.tracks.findIndex((t) => t.id === clip.trackId));
  const trackCount = useProjectStore((s) => s.project.tracks.length);
  const placeClip = useProjectStore((s) => s.placeClip);
  const setDrag = useClipDrag((s) => s.set);
  /** Preview while moving: snapped start time and target row. */
  const [preview, setPreview] = useState<{ start: number; row: number } | null>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const edgeFrame = useRef(0);

  useEffect(() => {
    if (getAudioEngine().getBuffer(clip.sampleId)) return;
    let cancelled = false;
    import("@/lib/audio/sampleLoader").then(({ ensureSampleLoaded }) =>
      ensureSampleLoaded(clip.sampleId).then((b) => {
        if (!cancelled) setLoaded({ sampleId: clip.sampleId, buffer: b });
      })
    );
    return () => {
      cancelled = true;
    };
  }, [clip.sampleId]);

  const snap = (sec: number) => snapToGrid(sec, bpm, timeSignature, snapResolution);
  const width = Math.max(4, clip.duration * pps);
  const height = laneHeight - 8;
  // over another track while dragged: preview it in that track's color
  const hoverColor = useProjectStore((s) => (preview && preview.row !== trackIndex ? s.project.tracks[preview.row]?.color : undefined));
  const color = hoverColor ?? (audible ? clip.color : SILENT_COLOR);
  const loopLength = clip.loopLengthSec;
  const tileWidth = loopLength ? loopLength * pps : width;
  const tiles = loopLength ? Math.ceil(clip.duration / loopLength) : 1;

  const scroller = () => rootRef.current?.closest<HTMLElement>("[data-timeline-scroll]") ?? null;

  function begin(e: React.PointerEvent, state: DragState) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = state;
    travel.current = 0;
  }

  /** Where the region would land for the finger at (x, y). */
  function landing(d: Extract<DragState, { mode: "move" }>, x: number, y: number) {
    const el = scroller();
    const dx = x - d.startX + (el ? el.scrollLeft - d.scrollLeft : 0);
    const dy = y - d.startY + (el ? el.scrollTop - d.scrollTop : 0);
    const start = snap(Math.max(0, clip.startTime + dx / pps));
    const row = Math.min(trackCount, Math.max(0, trackIndex + Math.round(dy / laneHeight)));
    return { dx, dy, start, row };
  }

  function updateMove(x: number, y: number) {
    const d = drag.current;
    if (!d || d.mode !== "move") return;
    const l = landing(d, x, y);
    if (!d.lifted) {
      if (Math.max(Math.abs(l.dx), Math.abs(l.dy)) < TAP_THRESHOLD_PX) return;
      d.lifted = true;
    }
    travel.current = TAP_THRESHOLD_PX;
    setPreview({ start: l.start, row: l.row });
    setDrag({ clipId: clip.id, fromTrackId: clip.trackId, targetIndex: l.row });
  }

  /** Scrolls the view while the finger rests near an edge. */
  function edgeScroll() {
    edgeFrame.current = 0;
    const d = drag.current;
    const el = scroller();
    const p = lastPointer.current;
    if (!d || d.mode !== "move" || !d.lifted || !el || !p) return;
    const r = el.getBoundingClientRect();
    const speed = (dist: number) => (dist < EDGE_PX ? EDGE_SPEED * (1 - Math.max(0, dist) / EDGE_PX) : 0);
    const vx = speed(r.right - p.x) - speed(p.x - r.left);
    const vy = speed(r.bottom - p.y) - speed(p.y - r.top - 40);
    if (vx === 0 && vy === 0) return;
    el.scrollLeft += vx;
    el.scrollTop += vy;
    updateMove(p.x, p.y);
    edgeFrame.current = requestAnimationFrame(edgeScroll);
  }

  function liftNow(e: { pointerId: number; target: EventTarget | null }, x: number, y: number) {
    const el = scroller();
    selectClip({ trackId: clip.trackId, clipId: clip.id });
    // the timeline must stop panning: this finger now carries the region
    el?.dispatchEvent(new CustomEvent("daw-cancel-pan"));
    try {
      (rootRef.current ?? (e.target as HTMLElement)).setPointerCapture(e.pointerId);
    } catch {
      // pointer already gone
    }
    drag.current = { mode: "move", startX: x, startY: y, scrollLeft: el?.scrollLeft ?? 0, scrollTop: el?.scrollTop ?? 0, lifted: true };
    travel.current = TAP_THRESHOLD_PX;
    setPreview({ start: clip.startTime, row: trackIndex });
    setDrag({ clipId: clip.id, fromTrackId: clip.trackId, targetIndex: trackIndex });
    navigator.vibrate?.(10);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    if (d.mode === "press") {
      travel.current = Math.max(travel.current, Math.abs(e.clientX - d.startX), Math.abs(e.clientY - d.startY));
      if (travel.current >= TAP_THRESHOLD_PX) {
        window.clearTimeout(d.timer);
        drag.current = null; // a swipe: the timeline pans
      }
      return;
    }
    if (d.mode === "move") {
      updateMove(e.clientX, e.clientY);
      if (d.lifted && !edgeFrame.current) edgeFrame.current = requestAnimationFrame(edgeScroll);
      return;
    }
    const deltaSec = (e.clientX - d.startX) / pps;
    travel.current = Math.max(travel.current, Math.abs(e.clientX - d.startX));
    if (d.mode === "trim-left") {
      const maxOffset = d.sourceOffset + d.duration - MIN_CLIP_SEC;
      const nextOffset = Math.min(maxOffset, Math.max(0, snap(d.sourceOffset + deltaSec)));
      const applied = nextOffset - d.sourceOffset;
      updateClip(clip.trackId, clip.id, {
        sourceOffset: nextOffset,
        startTime: Math.max(0, d.startTime + applied),
        duration: d.duration - applied,
      });
    } else {
      // A looped region extends by repeating; a plain one only up to its audio.
      const max = loopLength ? Infinity : buffer ? buffer.duration - clip.sourceOffset : Infinity;
      updateClip(clip.trackId, clip.id, { duration: Math.min(max, Math.max(MIN_CLIP_SEC, snap(d.duration + deltaSec))) });
    }
  }

  function endDrag() {
    if (edgeFrame.current) cancelAnimationFrame(edgeFrame.current);
    edgeFrame.current = 0;
    lastPointer.current = null;
    setPreview(null);
    setDrag(null);
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (!d) return;
    if (d.mode === "press") {
      window.clearTimeout(d.timer);
      if (travel.current < TAP_THRESHOLD_PX) selectClip({ trackId: clip.trackId, clipId: clip.id });
      return;
    }
    if (d.mode === "move") {
      if (d.lifted) {
        const l = landing(d, e.clientX, e.clientY);
        const tracks = useProjectStore.getState().project.tracks;
        const target = l.row === trackIndex ? undefined : l.row >= tracks.length ? "new" : tracks[l.row].id;
        placeClip(clip.trackId, clip.id, l.start, target);
      } else {
        selectClip({ trackId: clip.trackId, clipId: clip.id });
      }
      endDrag();
    }
  }

  function onPointerCancel() {
    const d = drag.current;
    if (d?.mode === "press") window.clearTimeout(d.timer);
    drag.current = null;
    endDrag();
  }

  useEffect(
    () => () => {
      const d = drag.current;
      if (d?.mode === "press") window.clearTimeout(d.timer);
      if (edgeFrame.current) cancelAnimationFrame(edgeFrame.current);
    },
    []
  );

  const fadeInPx = clip.fadeInSec * pps;
  const fadeOutPx = clip.fadeOutSec * pps;

  return (
    <div
      ref={rootRef}
      onPointerDown={(e) => {
        if (e.button !== 0 && e.pointerType === "mouse") return;
        const el = scroller();
        if (selected) {
          begin(e, { mode: "move", startX: e.clientX, startY: e.clientY, scrollLeft: el?.scrollLeft ?? 0, scrollTop: el?.scrollTop ?? 0, lifted: false });
          return;
        }
        // Not selected: a tap selects, a swipe scrolls the timeline, a hold
        // picks the region up.
        e.stopPropagation();
        const pointer = { pointerId: e.pointerId, target: e.target };
        const x = e.clientX;
        const y = e.clientY;
        travel.current = 0;
        drag.current = {
          mode: "press",
          startX: x,
          startY: y,
          timer: window.setTimeout(() => {
            if (drag.current?.mode === "press" && travel.current < TAP_THRESHOLD_PX) liftNow(pointer, x, y);
          }, LONG_PRESS_MS),
        };
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
      title={clip.name}
      data-no-pan={selected ? "" : undefined}
      data-keep-region=""
      style={{
        position: "absolute",
        left: clip.startTime * pps,
        width,
        height,
        top: 4,
        background: preview ? `${color}66` : `${color}2e`,
        border: `1px solid ${color}b3`,
        touchAction: selected ? "none" : "pan-x pan-y",
        zIndex: preview ? 40 : selected ? 5 : undefined,
        transform: preview ? `translate(${(preview.start - clip.startTime) * pps}px, ${(preview.row - trackIndex) * laneHeight}px) scale(1.02)` : undefined,
        boxShadow: preview ? "0 12px 28px rgba(0,0,0,.55)" : undefined,
        transition: preview ? "transform 60ms linear" : undefined,
        WebkitTouchCallout: "none",
      }}
      className={`select-none rounded-[4px] ${selected ? "outline outline-2 outline-offset-1 outline-white" : ""}`}
    >
      <div className="absolute inset-0 overflow-hidden rounded-[3px]">
        {/* name strip (Pro Tools-style clip header): name, clip gain, loop */}
        <div
          className="absolute inset-x-0 top-0 flex items-center gap-1 overflow-hidden px-1.5 text-[10px] font-semibold leading-none"
          style={{ height: STRIP_PX, background: selected ? "#f4f3ee" : `${color}e6`, color: "#0b0c0f" }}
        >
          {width > 34 && <span className="min-w-0 flex-1 truncate">{clip.name}</span>}
          {width > 70 && clip.gainDb !== 0 && <span className="shrink-0 tabular-nums opacity-75">{`${clip.gainDb > 0 ? "+" : ""}${clip.gainDb.toFixed(1)} dB`}</span>}
          {width > 50 && loopLength && <span className="shrink-0 opacity-75">⟳</span>}
        </div>
        {Array.from({ length: tiles }, (_, i) => (
          <div
            key={i}
            className={`absolute ${i > 0 ? "border-l border-white/30" : ""}`}
            style={{ top: STRIP_PX, left: i * tileWidth, width: Math.min(tileWidth, width - i * tileWidth), height: height - STRIP_PX }}
          >
            <Waveform
              buffer={buffer}
              width={Math.max(1, tileWidth)}
              height={Math.max(4, height - STRIP_PX)}
              color={color}
              startSec={clip.sourceOffset}
              durationSec={loopLength ?? clip.duration}
            />
          </div>
        ))}
        {(fadeInPx > 0 || fadeOutPx > 0) && (
          <svg className="pointer-events-none absolute inset-x-0" style={{ top: STRIP_PX }} width={width} height={height - STRIP_PX}>
            {/* the faded part shaded, the curve on top (like a console's fade) */}
            {fadeInPx > 0 && (
              <>
                <path d={`M0 0 L${fadeInPx} 0 Q${fadeInPx * 0.35} ${(height - STRIP_PX) * 0.15} 0 ${height - STRIP_PX} Z`} fill="rgba(0,0,0,.45)" />
                <path d={`M0 ${height - STRIP_PX} Q${fadeInPx * 0.35} ${(height - STRIP_PX) * 0.15} ${fadeInPx} 0`} fill="none" stroke="white" strokeWidth={1.5} />
              </>
            )}
            {fadeOutPx > 0 && (
              <>
                <path d={`M${width} 0 L${width - fadeOutPx} 0 Q${width - fadeOutPx * 0.35} ${(height - STRIP_PX) * 0.15} ${width} ${height - STRIP_PX} Z`} fill="rgba(0,0,0,.45)" />
                <path d={`M${width - fadeOutPx} 0 Q${width - fadeOutPx * 0.35} ${(height - STRIP_PX) * 0.15} ${width} ${height - STRIP_PX}`} fill="none" stroke="white" strokeWidth={1.5} />
              </>
            )}
          </svg>
        )}
      </div>

      {takes.length > 1 && (
        <div className="absolute right-1 top-1 w-20" onPointerDown={(e) => e.stopPropagation()}>
          <Picker
            value={clip.id}
            options={takes.map((t, i) => ({ value: t.id, label: `Toma ${i + 1}/${takes.length}` }))}
            title="Tomas grabadas en esta región - elige cuál suena"
            onChange={(id) => selectTake(clip.trackId, clip.takeGroupId!, id)}
          />
        </div>
      )}

      {selected && !preview && (
        <>
          {!loopLength && (
            <div
              onPointerDown={(e) =>
                begin(e, {
                  mode: "trim-left",
                  startX: e.clientX,
                  startTime: clip.startTime,
                  sourceOffset: clip.sourceOffset,
                  duration: clip.duration,
                })
              }
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              aria-label="Recortar inicio"
              style={{ touchAction: "none" }}
              className="absolute -left-5 top-1/2 flex h-11 w-10 -translate-y-1/2 cursor-ew-resize items-center justify-center"
            >
              <span className="h-5 w-5 rounded-full bg-white shadow" />
            </div>
          )}
          <div
            onPointerDown={(e) => begin(e, { mode: "trim-right", startX: e.clientX, duration: clip.duration })}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            aria-label={loopLength ? "Extender loop" : "Recortar final"}
            style={{ touchAction: "none" }}
            className="absolute -right-5 top-1/2 flex h-11 w-10 -translate-y-1/2 cursor-ew-resize items-center justify-center"
          >
            <span className="h-5 w-5 rounded-full bg-white shadow" />
          </div>
        </>
      )}
    </div>
  );
}
