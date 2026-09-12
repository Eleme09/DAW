"use client";

import { useRef } from "react";

interface XYPadProps {
  x: number;
  y: number;
  onChange: (x: number, y: number) => void;
  size?: number;
  xLabel?: string;
  yLabel?: string;
}

/** Two-dimensional control (width/depth, filter cutoff/resonance, ...) as a
 * single draggable point instead of two separate sliders - x/y are 0..1. */
export function XYPad({ x, y, onChange, size = 120, xLabel, yLabel }: XYPadProps) {
  const ref = useRef<HTMLDivElement>(null);

  function updateFromEvent(e: { clientX: number; clientY: number }) {
    const rect = ref.current!.getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const ny = Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height));
    onChange(nx, ny);
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateFromEvent(e);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (e.buttons === 0 && e.pointerType === "mouse") return;
    if (e.pressure === 0 && e.pointerType !== "touch") return;
    updateFromEvent(e);
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={ref}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        style={{ width: size, height: size, touchAction: "none" }}
        className="relative cursor-crosshair rounded-[3px] border border-line bg-ink"
      >
        <div className="pointer-events-none absolute left-1/2 top-0 h-full w-px bg-surf" />
        <div className="pointer-events-none absolute left-0 top-1/2 h-px w-full bg-surf" />
        <div
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-bone shadow"
          style={{ left: `${x * 100}%`, top: `${(1 - y) * 100}%` }}
        />
      </div>
      {(xLabel || yLabel) && (
        <div className="flex w-full justify-between text-[9px] text-bone-3" style={{ width: size }}>
          <span>{xLabel}</span>
          <span>{yLabel}</span>
        </div>
      )}
    </div>
  );
}
