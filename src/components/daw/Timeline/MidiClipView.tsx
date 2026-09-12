"use client";

import { useRef } from "react";
import { useProjectStore } from "@/state/projectStore";
import type { MidiClip } from "@/types/project";
import { snapToGrid } from "@/lib/timing/grid";
import { PIXELS_PER_SECOND, TRACK_HEIGHT } from "./constants";
import { NoteIcon } from "../icons";

interface MidiClipViewProps {
  clip: MidiClip;
}

const MIN_CLIP_SEC = 0.25;
const HANDLE_WIDTH = 7;

type DragState =
  | { mode: "move"; startX: number; startTime: number }
  | { mode: "trim-right"; startX: number; duration: number };

/** Compact block for a programmed pattern on an instrument track - the MIDI
 * counterpart to ClipView. Notes are edited in the piano roll (opened via
 * the note-icon button), not by dragging inline - only move/resize/delete
 * happen directly on the timeline, same as ClipView's own trim handles. */
export function MidiClipView({ clip }: MidiClipViewProps) {
  const updateMidiClip = useProjectStore((s) => s.updateMidiClip);
  const removeMidiClip = useProjectStore((s) => s.removeMidiClip);
  const selectTrack = useProjectStore((s) => s.selectTrack);
  const setPianoRollClipId = useProjectStore((s) => s.setPianoRollClipId);
  const bpm = useProjectStore((s) => s.project.bpm);
  const timeSignature = useProjectStore((s) => s.project.timeSignature);
  const snapResolution = useProjectStore((s) => s.snapResolution);
  const dragState = useRef<DragState | null>(null);

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
    const deltaSec = (e.clientX - drag.startX) / PIXELS_PER_SECOND;
    if (drag.mode === "move") {
      updateMidiClip(clip.trackId, clip.id, { startTime: snap(Math.max(0, drag.startTime + deltaSec)) });
      return;
    }
    updateMidiClip(clip.trackId, clip.id, { duration: Math.max(MIN_CLIP_SEC, snap(drag.duration + deltaSec)) });
  }

  function onPointerUp(e: React.PointerEvent) {
    dragState.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }

  const pitches = clip.notes.map((n) => n.pitch);
  const minPitch = pitches.length ? Math.min(...pitches) : 60;
  const maxPitch = pitches.length ? Math.max(...pitches) : 60;
  const pitchRange = Math.max(1, maxPitch - minPitch);

  return (
    <div
      onPointerDown={(e) => beginDrag(e, { mode: "move", startX: e.clientX, startTime: clip.startTime })}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={() => removeMidiClip(clip.trackId, clip.id)}
      title={`${clip.name} — ${clip.notes.length} notas — arrastra para mover, arrastra el borde derecho para redimensionar, doble clic para eliminar`}
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
      <div className="flex items-center justify-between px-1" style={{ background: clip.color + "aa" }}>
        <span className="truncate text-[10px] font-medium text-bone">{clip.name}</span>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            selectTrack(clip.trackId);
            setPianoRollClipId(clip.id);
          }}
          title="Abrir piano roll"
          className="shrink-0 text-bone/80 hover:text-bone"
        >
          <NoteIcon className="h-3 w-3" />
        </button>
      </div>
      <div className="relative h-[calc(100%-16px)] w-full">
        {clip.notes.map((n) => (
          <div
            key={n.id}
            className="absolute rounded-[1px]"
            style={{
              left: n.startTime * PIXELS_PER_SECOND,
              width: Math.max(2, n.duration * PIXELS_PER_SECOND - 1),
              top: `${((maxPitch - n.pitch) / pitchRange) * 80}%`,
              height: 2,
              background: clip.color,
            }}
          />
        ))}
      </div>

      <div
        onPointerDown={(e) => beginDrag(e, { mode: "trim-right", startX: e.clientX, duration: clip.duration })}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ width: HANDLE_WIDTH }}
        className="absolute right-0 top-0 h-full cursor-ew-resize bg-white/0 group-hover:bg-white/20"
      />
    </div>
  );
}
