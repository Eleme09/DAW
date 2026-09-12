"use client";

import { useRef } from "react";
import { useProjectStore } from "@/state/projectStore";
import { PIXELS_PER_SECOND } from "./constants";

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
  const drag = useRef<DragState | null>(null);

  function beginDrag(e: React.PointerEvent, mode: DragMode) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, startX: e.clientX, startTime: loop.startTime, endTime: loop.endTime };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const deltaSec = (e.clientX - d.startX) / PIXELS_PER_SECOND;

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

  const left = loop.startTime * PIXELS_PER_SECOND;
  const width = Math.max(4, (loop.endTime - loop.startTime) * PIXELS_PER_SECOND);

  return (
    <div
      className={`absolute top-0 z-15 ${loop.enabled ? "bg-cyan-500/10" : "bg-neutral-500/5"}`}
      style={{ left, width, height }}
      title={`Loop ${loop.startTime.toFixed(2)}s – ${loop.endTime.toFixed(2)}s — arrastra para mover`}
    >
      <div
        onPointerDown={(e) => beginDrag(e, "move")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={`absolute inset-x-0 top-0 h-2 cursor-grab border-b ${
          loop.enabled ? "border-cyan-500 bg-cyan-500/40" : "border-neutral-600 bg-neutral-600/40"
        }`}
      />
      <div
        onPointerDown={(e) => beginDrag(e, "start")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ width: EDGE_WIDTH }}
        className="absolute left-0 top-0 h-full cursor-ew-resize"
      />
      <div
        onPointerDown={(e) => beginDrag(e, "end")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ width: EDGE_WIDTH }}
        className="absolute right-0 top-0 h-full cursor-ew-resize"
      />
    </div>
  );
}
