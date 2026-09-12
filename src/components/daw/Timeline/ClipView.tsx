"use client";

import { useEffect, useRef, useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { useProjectStore } from "@/state/projectStore";
import type { AudioClip } from "@/types/project";
import { snapToGrid } from "@/lib/timing/grid";
import { PIXELS_PER_SECOND, TRACK_HEIGHT } from "./constants";
import { Waveform } from "../Waveform";
import { Picker } from "../ui/Picker";

interface ClipViewProps {
  clip: AudioClip;
}

const MIN_CLIP_SEC = 0.05;
const HANDLE_WIDTH = 7;
const FADE_HANDLE_SIZE = 10;
const MIN_GAIN_DB = -24;
const MAX_GAIN_DB = 12;
const GAIN_PX_PER_DB = 3;

type DragState =
  | { mode: "move"; startX: number; startTime: number }
  | { mode: "trim-left"; startX: number; startTime: number; sourceOffset: number; duration: number }
  | { mode: "trim-right"; startX: number; duration: number }
  | { mode: "gain"; startY: number; gainDb: number }
  | { mode: "fade-in"; startX: number; fadeInSec: number }
  | { mode: "fade-out"; startX: number; fadeOutSec: number };

export function ClipView({ clip }: ClipViewProps) {
  const updateClip = useProjectStore((s) => s.updateClip);
  const removeClip = useProjectStore((s) => s.removeClip);
  const selectTrack = useProjectStore((s) => s.selectTrack);
  const selectTake = useProjectStore((s) => s.selectTake);
  const bpm = useProjectStore((s) => s.project.bpm);
  const timeSignature = useProjectStore((s) => s.project.timeSignature);
  const snapResolution = useProjectStore((s) => s.snapResolution);
  // Selecting the raw (stable) clips array, not a filtered derivative, so
  // this doesn't force a re-render on every playhead tick - `project` only
  // changes reference on an actual edit, `currentTime` lives outside it.
  const trackClips = useProjectStore((s) => s.project.tracks.find((t) => t.id === clip.trackId)?.clips);
  // Recording order, not display order - clips are always appended, so
  // array position doubles as "which take came Nth" without a separate field.
  const takes = clip.takeGroupId ? (trackClips?.filter((c) => c.takeGroupId === clip.takeGroupId) ?? []) : [];
  const [buffer, setBuffer] = useState<AudioBuffer | null>(() => getAudioEngine().getBuffer(clip.sampleId) ?? null);
  const dragState = useRef<DragState | null>(null);

  useEffect(() => {
    if (buffer) return;
    let cancelled = false;
    import("@/lib/audio/sampleLoader").then(({ ensureSampleLoaded }) =>
      ensureSampleLoaded(clip.sampleId).then((b) => {
        if (!cancelled) setBuffer(b);
      })
    );
    return () => {
      cancelled = true;
    };
  }, [buffer, clip.sampleId]);

  const width = Math.max(4, clip.duration * PIXELS_PER_SECOND);
  const snap = (seconds: number) => snapToGrid(seconds, bpm, timeSignature, snapResolution);

  function beginDrag(e: React.PointerEvent, state: DragState) {
    e.stopPropagation();
    selectTrack(clip.trackId);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = state;
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragState.current;
    if (!drag) return;

    if (drag.mode === "gain") {
      const deltaDb = (drag.startY - e.clientY) / GAIN_PX_PER_DB;
      const nextGainDb = Math.min(MAX_GAIN_DB, Math.max(MIN_GAIN_DB, drag.gainDb + deltaDb));
      updateClip(clip.trackId, clip.id, { gainDb: nextGainDb });
      return;
    }

    if (drag.mode === "fade-in") {
      const deltaSec = (e.clientX - drag.startX) / PIXELS_PER_SECOND;
      const nextFadeIn = Math.min(clip.duration / 2, Math.max(0, drag.fadeInSec + deltaSec));
      updateClip(clip.trackId, clip.id, { fadeInSec: nextFadeIn });
      return;
    }

    if (drag.mode === "fade-out") {
      const deltaSec = (drag.startX - e.clientX) / PIXELS_PER_SECOND;
      const nextFadeOut = Math.min(clip.duration / 2, Math.max(0, drag.fadeOutSec + deltaSec));
      updateClip(clip.trackId, clip.id, { fadeOutSec: nextFadeOut });
      return;
    }

    const deltaSec = (e.clientX - drag.startX) / PIXELS_PER_SECOND;

    if (drag.mode === "move") {
      updateClip(clip.trackId, clip.id, { startTime: snap(Math.max(0, drag.startTime + deltaSec)) });
      return;
    }

    if (drag.mode === "trim-left") {
      const maxOffset = drag.sourceOffset + drag.duration - MIN_CLIP_SEC;
      const nextOffset = Math.min(maxOffset, Math.max(0, snap(drag.sourceOffset + deltaSec)));
      const appliedDelta = nextOffset - drag.sourceOffset;
      updateClip(clip.trackId, clip.id, {
        sourceOffset: nextOffset,
        startTime: Math.max(0, drag.startTime + appliedDelta),
        duration: drag.duration - appliedDelta,
      });
      return;
    }

    // trim-right
    const maxDuration = buffer ? buffer.duration - clip.sourceOffset : Infinity;
    const nextDuration = Math.min(maxDuration, Math.max(MIN_CLIP_SEC, snap(drag.duration + deltaSec)));
    updateClip(clip.trackId, clip.id, { duration: nextDuration });
  }

  function onPointerUp(e: React.PointerEvent) {
    dragState.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }

  const contentHeight = TRACK_HEIGHT - 8;
  const gainRange = MAX_GAIN_DB - MIN_GAIN_DB;
  const gainY = contentHeight - ((clip.gainDb - MIN_GAIN_DB) / gainRange) * contentHeight;
  const fadeInPx = clip.fadeInSec * PIXELS_PER_SECOND;
  const fadeOutPx = clip.fadeOutSec * PIXELS_PER_SECOND;

  return (
    <div
      onPointerDown={(e) => beginDrag(e, { mode: "move", startX: e.clientX, startTime: clip.startTime })}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={() => removeClip(clip.trackId, clip.id)}
      title={`${clip.name} — arrastra para mover, arrastra los bordes para recortar, arrastra las esquinas para fundidos, arrastra la línea central para ganancia, doble clic para eliminar`}
      style={{
        position: "absolute",
        left: clip.startTime * PIXELS_PER_SECOND,
        width,
        height: contentHeight,
        top: 4,
        background: clip.color + "33",
        borderColor: clip.color,
      }}
      className="group cursor-grab select-none overflow-hidden rounded border active:cursor-grabbing"
    >
      <div
        className="flex items-center justify-between gap-1 px-1"
        style={{ background: clip.color + "aa" }}
      >
        <span className="truncate text-[10px] font-medium text-neutral-100">{clip.name}</span>
        {takes.length > 1 && (
          <div className="w-20 shrink-0" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <Picker
              value={clip.id}
              options={takes.map((t, i) => ({ value: t.id, label: `Toma ${i + 1}/${takes.length}` }))}
              title="Esta región tiene varias tomas grabadas encima - elige cuál suena"
              onChange={(id) => selectTake(clip.trackId, clip.takeGroupId!, id)}
            />
          </div>
        )}
      </div>
      <Waveform buffer={buffer} width={width} height={contentHeight - 16} color="rgba(255,255,255,0.85)" />

      {(clip.fadeInSec > 0 || fadeInPx > 0) && (
        <div
          className="pointer-events-none absolute left-0 top-0 bg-black/50"
          style={{ width: fadeInPx, height: contentHeight, clipPath: `polygon(0 0, 100% 0, 0 100%)` }}
        />
      )}
      {(clip.fadeOutSec > 0 || fadeOutPx > 0) && (
        <div
          className="pointer-events-none absolute right-0 top-0 bg-black/50"
          style={{ width: fadeOutPx, height: contentHeight, clipPath: `polygon(100% 0, 100% 100%, 0 0)` }}
        />
      )}

      <div
        onPointerDown={(e) => beginDrag(e, { mode: "gain", startY: e.clientY, gainDb: clip.gainDb })}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        title={`Ganancia ${clip.gainDb.toFixed(1)} dB — arrastra arriba/abajo`}
        className="absolute left-0 right-0 h-2 -translate-y-1/2 cursor-ns-resize"
        style={{ top: gainY }}
      >
        <div className="mt-[3px] h-px w-full bg-white/70" />
      </div>

      {buffer && (
        <>
          <div
            onPointerDown={(e) =>
              beginDrag(e, {
                mode: "trim-left",
                startX: e.clientX,
                startTime: clip.startTime,
                sourceOffset: clip.sourceOffset,
                duration: clip.duration,
              })
            }
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            style={{ width: HANDLE_WIDTH }}
            className="absolute left-0 top-0 h-full cursor-ew-resize bg-white/0 group-hover:bg-white/20"
          />
          <div
            onPointerDown={(e) =>
              beginDrag(e, { mode: "trim-right", startX: e.clientX, duration: clip.duration })
            }
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            style={{ width: HANDLE_WIDTH }}
            className="absolute right-0 top-0 h-full cursor-ew-resize bg-white/0 group-hover:bg-white/20"
          />
          <div
            onPointerDown={(e) => beginDrag(e, { mode: "fade-in", startX: e.clientX, fadeInSec: clip.fadeInSec })}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            title={`Fundido de entrada ${clip.fadeInSec.toFixed(2)}s — arrastra a la derecha`}
            style={{ width: FADE_HANDLE_SIZE, height: FADE_HANDLE_SIZE }}
            className="absolute left-0 top-0 cursor-ew-resize rounded-br bg-white/40 opacity-0 group-hover:opacity-100"
          />
          <div
            onPointerDown={(e) => beginDrag(e, { mode: "fade-out", startX: e.clientX, fadeOutSec: clip.fadeOutSec })}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            title={`Fundido de salida ${clip.fadeOutSec.toFixed(2)}s — arrastra a la izquierda`}
            style={{ width: FADE_HANDLE_SIZE, height: FADE_HANDLE_SIZE }}
            className="absolute right-0 top-0 cursor-ew-resize rounded-bl bg-white/40 opacity-0 group-hover:opacity-100"
          />
        </>
      )}
    </div>
  );
}
