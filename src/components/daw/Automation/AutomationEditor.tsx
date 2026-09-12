"use client";

import { useRef } from "react";
import { useProjectStore } from "@/state/projectStore";
import type { AutomationParam } from "@/types/project";
import { PIXELS_PER_SECOND, MIN_TIMELINE_SECONDS } from "../Timeline/constants";
import { BottomSheet } from "../BottomSheet";

const HEIGHT = 160;
const RANGES: Record<AutomationParam, { min: number; max: number; unit: string; decimals: number }> = {
  volume: { min: -60, max: 6, unit: "dB", decimals: 1 },
  pan: { min: -1, max: 1, unit: "", decimals: 2 },
};
const PARAM_LABEL: Record<AutomationParam, string> = { volume: "Volumen", pan: "Pan" };

/** Breakpoint-curve editor for a track's volume/pan automation, opened as a
 * bottom sheet (like the piano roll) rather than an inline Timeline lane -
 * a Timeline lane would need every track's height to become dynamic, which
 * risks the already-shipped FASE 2 ruler/loop-region/playhead math that
 * assumes a uniform TRACK_HEIGHT. This reuses the exact same tap-to-add /
 * drag-to-move / double-click-to-remove vocabulary as ClipView and the
 * piano roll instead of inventing a new interaction model. */
export function AutomationEditor() {
  const trackId = useProjectStore((s) => s.automationTrackId);
  const setTrackId = useProjectStore((s) => s.setAutomationTrackId);
  const param = useProjectStore((s) => s.automationParam);
  const setParam = useProjectStore((s) => s.setAutomationParam);
  const tracks = useProjectStore((s) => s.project.tracks);
  const setLaneEnabled = useProjectStore((s) => s.setAutomationLaneEnabled);
  const addPoint = useProjectStore((s) => s.addAutomationPoint);
  const updatePoint = useProjectStore((s) => s.updateAutomationPoint);
  const removePoint = useProjectStore((s) => s.removeAutomationPoint);
  const dragRef = useRef<string | null>(null);

  const track = tracks.find((t) => t.id === trackId);
  const range = RANGES[param];

  const clipEnd = tracks.reduce(
    (max, t) =>
      Math.max(
        max,
        ...t.clips.map((c) => c.startTime + c.duration),
        ...t.midiClips.map((c) => c.startTime + c.duration)
      ),
    0
  );
  const duration = Math.max(MIN_TIMELINE_SECONDS, clipEnd + 15);
  const width = duration * PIXELS_PER_SECOND;

  function valueToY(value: number): number {
    const pct = (value - range.min) / (range.max - range.min);
    return HEIGHT - pct * HEIGHT;
  }
  function yToValue(y: number): number {
    const pct = 1 - y / HEIGHT;
    return Math.min(range.max, Math.max(range.min, range.min + pct * (range.max - range.min)));
  }
  function xToTime(x: number): number {
    return Math.max(0, x / PIXELS_PER_SECOND);
  }

  function beginDragPoint(e: React.PointerEvent, pointId: string) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = pointId;
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const pointId = dragRef.current;
    if (!pointId || !track) return;
    const rect = e.currentTarget.getBoundingClientRect();
    updatePoint(track.id, param, pointId, {
      time: xToTime(e.clientX - rect.left),
      value: yToValue(e.clientY - rect.top),
    });
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  function handleBackgroundClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!track) return;
    const rect = e.currentTarget.getBoundingClientRect();
    addPoint(track.id, param, {
      time: xToTime(e.clientX - rect.left),
      value: yToValue(e.clientY - rect.top),
    });
  }

  const lane = track?.automation[param];
  const points = lane ? [...lane.points].sort((a, b) => a.time - b.time) : [];
  const polylinePoints = points.map((p) => `${p.time * PIXELS_PER_SECOND},${valueToY(p.value)}`).join(" ");

  return (
    <BottomSheet
      open={Boolean(track)}
      onClose={() => setTrackId(null)}
      title={track ? `${track.name} — Automatización` : "Automatización"}
    >
      {track && lane && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <div className="flex gap-1">
              {(["volume", "pan"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setParam(p)}
                  className={`rounded px-2 py-1 ${
                    param === p ? "bg-cyan-500 text-black" : "bg-neutral-800 text-neutral-400"
                  }`}
                >
                  {PARAM_LABEL[p]}
                </button>
              ))}
            </div>
            <label className="ml-auto flex items-center gap-1.5 text-neutral-400">
              <input
                type="checkbox"
                checked={lane.enabled}
                onChange={(e) => setLaneEnabled(track.id, param, e.target.checked)}
              />
              Activada
            </label>
          </div>
          <p className="text-[10px] text-neutral-600">
            Toca un espacio vacío para agregar un punto, arrastra un punto para moverlo, doble clic
            sobre un punto para quitarlo.
            {!lane.enabled && points.length > 0 && " Desactivada - la reproducción usa el valor estático hasta activarla."}
          </p>
          <div className="max-h-[50vh] overflow-auto rounded border border-neutral-800 bg-neutral-950">
            <div
              className="relative"
              style={{ width, height: HEIGHT }}
              onClick={handleBackgroundClick}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              <div
                className="pointer-events-none absolute inset-x-0 border-t border-neutral-800"
                style={{ top: valueToY(0) }}
              />
              <svg width={width} height={HEIGHT} className="pointer-events-none absolute inset-0">
                <polyline points={polylinePoints} fill="none" stroke={track.color} strokeWidth={2} />
              </svg>
              {points.map((p) => (
                <div
                  key={p.id}
                  onPointerDown={(e) => beginDragPoint(e, p.id)}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    removePoint(track.id, param, p.id);
                  }}
                  title={`${p.value.toFixed(range.decimals)}${range.unit} @ ${p.time.toFixed(2)}s`}
                  className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-neutral-950 active:cursor-grabbing"
                  style={{ left: p.time * PIXELS_PER_SECOND, top: valueToY(p.value), background: track.color }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
