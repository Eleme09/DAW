"use client";

import { useEffect, useRef, useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { useProjectStore } from "@/state/projectStore";
import type { AudioClip } from "@/types/project";
import { PIXELS_PER_SECOND, TRACK_HEIGHT } from "./constants";
import { Waveform } from "../Waveform";

interface ClipViewProps {
  clip: AudioClip;
}

const MIN_CLIP_SEC = 0.05;
const HANDLE_WIDTH = 7;

type DragState =
  | { mode: "move"; startX: number; startTime: number }
  | { mode: "trim-left"; startX: number; startTime: number; sourceOffset: number; duration: number }
  | { mode: "trim-right"; startX: number; duration: number };

export function ClipView({ clip }: ClipViewProps) {
  const updateClip = useProjectStore((s) => s.updateClip);
  const removeClip = useProjectStore((s) => s.removeClip);
  const selectTrack = useProjectStore((s) => s.selectTrack);
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

  function beginDrag(e: React.PointerEvent, state: DragState) {
    e.stopPropagation();
    selectTrack(clip.trackId);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = state;
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragState.current;
    if (!drag) return;
    const deltaSec = (e.clientX - drag.startX) / PIXELS_PER_SECOND;

    if (drag.mode === "move") {
      updateClip(clip.trackId, clip.id, { startTime: Math.max(0, drag.startTime + deltaSec) });
      return;
    }

    if (drag.mode === "trim-left") {
      const maxOffset = drag.sourceOffset + drag.duration - MIN_CLIP_SEC;
      const nextOffset = Math.min(maxOffset, Math.max(0, drag.sourceOffset + deltaSec));
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
    const nextDuration = Math.min(maxDuration, Math.max(MIN_CLIP_SEC, drag.duration + deltaSec));
    updateClip(clip.trackId, clip.id, { duration: nextDuration });
  }

  function onPointerUp(e: React.PointerEvent) {
    dragState.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }

  return (
    <div
      onPointerDown={(e) => beginDrag(e, { mode: "move", startX: e.clientX, startTime: clip.startTime })}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={() => removeClip(clip.trackId, clip.id)}
      title={`${clip.name} — drag to move, drag edges to trim, double-click to delete`}
      style={{
        position: "absolute",
        left: clip.startTime * PIXELS_PER_SECOND,
        width,
        height: TRACK_HEIGHT - 8,
        top: 4,
        background: clip.color + "33",
        borderColor: clip.color,
      }}
      className="group cursor-grab select-none overflow-hidden rounded border active:cursor-grabbing"
    >
      <div
        className="truncate px-1 text-[10px] font-medium text-neutral-100"
        style={{ background: clip.color + "aa" }}
      >
        {clip.name}
      </div>
      <Waveform buffer={buffer} width={width} height={TRACK_HEIGHT - 24} color="rgba(255,255,255,0.85)" />

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
        </>
      )}
    </div>
  );
}
