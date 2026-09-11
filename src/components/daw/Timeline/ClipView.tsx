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

export function ClipView({ clip }: ClipViewProps) {
  const updateClip = useProjectStore((s) => s.updateClip);
  const removeClip = useProjectStore((s) => s.removeClip);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(() => getAudioEngine().getBuffer(clip.sampleId) ?? null);
  const dragState = useRef<{ startX: number; startTime: number } | null>(null);

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

  function onPointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startTime: clip.startTime };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragState.current) return;
    const deltaSec = (e.clientX - dragState.current.startX) / PIXELS_PER_SECOND;
    const nextStart = Math.max(0, dragState.current.startTime + deltaSec);
    updateClip(clip.trackId, clip.id, { startTime: nextStart });
  }

  function onPointerUp(e: React.PointerEvent) {
    dragState.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={() => removeClip(clip.trackId, clip.id)}
      title={`${clip.name} — drag to move, double-click to delete`}
      style={{
        position: "absolute",
        left: clip.startTime * PIXELS_PER_SECOND,
        width,
        height: TRACK_HEIGHT - 8,
        top: 4,
        background: clip.color + "33",
        borderColor: clip.color,
      }}
      className="cursor-grab select-none overflow-hidden rounded border active:cursor-grabbing"
    >
      <div
        className="truncate px-1 text-[10px] font-medium text-neutral-100"
        style={{ background: clip.color + "aa" }}
      >
        {clip.name}
      </div>
      <Waveform buffer={buffer} width={width} height={TRACK_HEIGHT - 24} color="rgba(255,255,255,0.85)" />
    </div>
  );
}
