"use client";

import { useRef } from "react";
import { useProjectStore } from "@/state/projectStore";

const MIN_LOOP_SEC = 0.25;
const EDGE_WIDTH = 8;

type DragMode = "move" | "start" | "end";
interface DragState {
  mode: DragMode;
  startX: number;
  startTime: number;
  endTime: number;
}

/** Visible, draggable loop region over the ruler/track area — spans the
 * full track height (passed in) so both edges are grabbable anywhere
 * vertically, not just on the thin ruler strip. */
export function LoopRegion({ height }: { height: number }) {
  const loop = useProjectStore((s) => s.project.loop);
  const setLoop = useProjectStore((s) => s.setLoop);
  const pixelsPerSecond = useProjectStore((s) => s.pixelsPerSecond);
  const drag = useRef<DragState | null>(null);

  function beginDrag(e: React.PointerEvent, mode: DragMode) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, startX: e.clientX, startTime: loop.startTime, endTime: loop.endTime };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const deltaSec = (e.clientX - d.startX) / pixelsPerSecond;

    if (d.mode === "move") {
      const duration = d.endTime - d.startTime;
      const nextStart = Math.max(0, d.startTime + deltaSec);
      setLoop({ startTime: nextStart, endTime: nextStart + duration });
      return;
    }
    if (d.mode === "start") {
      const nextStart = Math.min(d.endTime - MIN_LOOP_SEC, Math.max(0, d.startTime + deltaSec));
      setLoop({ startTime: nextStart });
      return;
    }
    // end
    const nextEnd = Math.max(d.startTime + MIN_LOOP_SEC, d.endTime + deltaSec);
    setLoop({ endTime: nextEnd });
  }

  function onPointerUp(e: React.PointerEvent) {
    drag.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }

  const left = loop.startTime * pixelsPerSecond;
  const width = Math.max(4, (loop.endTime - loop.startTime) * pixelsPerSecond);

  return (
    // pointer-events-none on the wrapper: this div is a full-height visual
    // tint (and the drag hit-target for its three child strips below), but
    // without this it silently eats every click meant for a clip
    // underneath across the ENTIRE loop range and lane height - clips in
    // that range become untappable/undraggable, which is a much bigger
    // problem than it looks (the default project's loop already spans the
    // first bars, so this was blocking clip interaction from the very
    // first clip most people place). Each child strip re-enables its own
    // pointer events explicitly, so the loop drag handles still work.
    <div
      className={`pointer-events-none absolute top-0 z-15 ${loop.enabled ? "bg-bone/10" : "bg-bone-2/5"}`}
      style={{ left, width, height }}
      title={`Loop ${loop.startTime.toFixed(2)}s – ${loop.endTime.toFixed(2)}s — arrastra para mover`}
    >
      <div
        onPointerDown={(e) => beginDrag(e, "move")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ touchAction: "pan-y" }}
        className={`pointer-events-auto absolute inset-x-0 top-0 h-2 cursor-grab border-b ${
          loop.enabled ? "border-bone bg-bone/40" : "border-bone-3 bg-bone-3/40"
        }`}
      />
      <div
        onPointerDown={(e) => beginDrag(e, "start")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ width: EDGE_WIDTH, touchAction: "pan-y" }}
        className="pointer-events-auto absolute left-0 top-0 h-full cursor-ew-resize"
      />
      <div
        onPointerDown={(e) => beginDrag(e, "end")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ width: EDGE_WIDTH, touchAction: "pan-y" }}
        className="pointer-events-auto absolute right-0 top-0 h-full cursor-ew-resize"
      />
    </div>
  );
}
