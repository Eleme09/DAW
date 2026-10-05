"use client";

import { useEffect, useRef, useState } from "react";
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

type DragState =
  | { mode: "move"; startX: number; startTime: number }
  | { mode: "trim-left"; startX: number; startTime: number; sourceOffset: number; duration: number }
  | { mode: "trim-right"; startX: number; duration: number };

/**
 * A region in the phone Studio, behaving like BandLab's (user's screen
 * recordings): tap selects it - white outline + white circles on both ends
 * to trim/extend - and opens the Region Action Menu (RegionActionBar).
 * Only a selected region can be dragged; an unselected one lets the swipe
 * through to the timeline (which is how you move through the song).
 * Darker body in the track color with the waveform in the full color; a
 * looped region repeats its waveform tile; fades draw as white lines.
 */
export function CompactClipView({ clip }: { clip: AudioClip }) {
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
  const height = TRACK_HEIGHT - 8;
  const loopLength = clip.loopLengthSec;
  const tileWidth = loopLength ? loopLength * pps : width;
  const tiles = loopLength ? Math.ceil(clip.duration / loopLength) : 1;

  function begin(e: React.PointerEvent, state: DragState) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = state;
    travel.current = 0;
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const deltaSec = (e.clientX - d.startX) / pps;
    travel.current = Math.max(travel.current, Math.abs(e.clientX - d.startX));
    if (d.mode === "move") {
      if (travel.current < TAP_THRESHOLD_PX) return;
      updateClip(clip.trackId, clip.id, { startTime: snap(Math.max(0, d.startTime + deltaSec)) });
    } else if (d.mode === "trim-left") {
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

  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (d?.mode === "move" && travel.current < TAP_THRESHOLD_PX) selectClip({ trackId: clip.trackId, clipId: clip.id });
  }

  const fadeInPx = clip.fadeInSec * pps;
  const fadeOutPx = clip.fadeOutSec * pps;

  return (
    <div
      onPointerDown={(e) => {
        if (selected) begin(e, { mode: "move", startX: e.clientX, startTime: clip.startTime });
        else {
          // Not selected: only detect a tap, let the swipe scroll the timeline.
          e.stopPropagation();
          drag.current = { mode: "move", startX: e.clientX, startTime: clip.startTime };
          travel.current = 0;
        }
      }}
      onPointerMove={(e) => {
        if (selected) onPointerMove(e);
        else if (drag.current) travel.current = Math.max(travel.current, Math.abs(e.clientX - drag.current.startX));
      }}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
      onClick={(e) => e.stopPropagation()}
      title={clip.name}
      style={{
        position: "absolute",
        left: clip.startTime * pps,
        width,
        height,
        top: 4,
        background: `${clip.color}4d`,
        touchAction: selected ? "none" : "pan-x pan-y",
        zIndex: selected ? 5 : undefined,
      }}
      className={`select-none rounded-md ${selected ? "outline outline-2 outline-white" : ""}`}
    >
      <div className="absolute inset-0 overflow-hidden rounded-md">
        {Array.from({ length: tiles }, (_, i) => (
          <div
            key={i}
            className={`absolute top-0 ${i > 0 ? "border-l border-white/30" : ""}`}
            style={{ left: i * tileWidth, width: Math.min(tileWidth, width - i * tileWidth), height }}
          >
            <Waveform
              buffer={buffer}
              width={Math.max(1, tileWidth)}
              height={height}
              color={clip.color}
              startSec={clip.sourceOffset}
              durationSec={loopLength ?? clip.duration}
            />
          </div>
        ))}
        {(fadeInPx > 0 || fadeOutPx > 0) && (
          <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
            {fadeInPx > 0 && <line x1={0} y1={height} x2={fadeInPx} y2={0} stroke="white" strokeWidth={1.5} />}
            {fadeOutPx > 0 && <line x1={width - fadeOutPx} y1={0} x2={width} y2={height} stroke="white" strokeWidth={1.5} />}
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

      {selected && (
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
