"use client";

import { useRef } from "react";
import { useProjectStore } from "@/state/projectStore";

const MIN_CYCLE_SEC = 0.25;
const TAP_PX = 5;

type Drag = { mode: "move" | "start" | "end"; startX: number; startTime: number; endTime: number; moved: boolean };

/**
 * BandLab's Cycle Bar (help center "Looping Regions and Setting a Playback
 * Cycle" + user's recordings): a red bar in the upper part of the ruler.
 * Dark red = off, bright red = on; tap it to toggle, drag it to move, drag
 * its ends to resize. When on, playback and recording repeat that span.
 */
export function CycleBar() {
  const loop = useProjectStore((s) => s.project.loop);
  const setLoop = useProjectStore((s) => s.setLoop);
  const pps = useProjectStore((s) => s.pixelsPerSecond);
  const drag = useRef<Drag | null>(null);

  function begin(e: React.PointerEvent, mode: Drag["mode"]) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, startX: e.clientX, startTime: loop.startTime, endTime: loop.endTime, moved: false };
  }

  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.startX) >= TAP_PX) d.moved = true;
    if (!d.moved) return;
    const delta = (e.clientX - d.startX) / pps;
    if (d.mode === "move") {
      const length = d.endTime - d.startTime;
      const start = Math.max(0, d.startTime + delta);
      setLoop({ startTime: start, endTime: start + length });
    } else if (d.mode === "start") {
      setLoop({ startTime: Math.min(d.endTime - MIN_CYCLE_SEC, Math.max(0, d.startTime + delta)) });
    } else {
      setLoop({ endTime: Math.max(d.startTime + MIN_CYCLE_SEC, d.endTime + delta) });
    }
  }

  function end(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    e.stopPropagation();
    if (d && !d.moved && d.mode === "move") setLoop({ enabled: !loop.enabled });
  }

  const left = loop.startTime * pps;
  const width = Math.max(12, (loop.endTime - loop.startTime) * pps);
  const color = loop.enabled ? "#e5383b" : "#5c1f22";

  return (
    <div
      data-no-pan=""
      onClick={(e) => e.stopPropagation()}
      className="absolute top-0 z-10 h-3"
      style={{ left, width }}
      title={loop.enabled ? "Ciclo activo — toca para apagar, arrastra para mover" : "Ciclo apagado — toca para activar"}
    >
      <div
        onPointerDown={(e) => begin(e, "move")}
        onPointerMove={move}
        onPointerUp={end}
        style={{ background: color, touchAction: "none" }}
        className="absolute inset-0 rounded-b-sm"
      />
      <div
        onPointerDown={(e) => begin(e, "start")}
        onPointerMove={move}
        onPointerUp={end}
        aria-label="Inicio del ciclo"
        style={{ touchAction: "none" }}
        className="absolute -left-3 -top-1 h-6 w-6 cursor-ew-resize"
      />
      <div
        onPointerDown={(e) => begin(e, "end")}
        onPointerMove={move}
        onPointerUp={end}
        aria-label="Fin del ciclo"
        style={{ touchAction: "none" }}
        className="absolute -right-3 -top-1 h-6 w-6 cursor-ew-resize"
      />
    </div>
  );
}
