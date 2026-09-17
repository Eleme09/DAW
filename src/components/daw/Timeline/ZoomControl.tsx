"use client";

import { DEFAULT_PIXELS_PER_SECOND, MAX_PIXELS_PER_SECOND, MIN_PIXELS_PER_SECOND } from "./constants";

const ZOOM_STEP_FACTOR = 1.25;

interface ZoomControlProps {
  value: number;
  onChange: (value: number) => void;
}

/** Button pair for timeline zoom - the reliable, always-available path
 * alongside usePinchZoom's two-finger gesture (touch devices only, and not
 * always discoverable). Multiplicative steps, not additive, so "zoom in"
 * feels like the same amount of zoom whether starting wide or already tight. */
export function ZoomControl({ value, onChange }: ZoomControlProps) {
  const pct = Math.round((value / DEFAULT_PIXELS_PER_SECOND) * 100);
  return (
    <div className="flex items-center gap-0.5 rounded bg-surf-2">
      <button
        onClick={() => onChange(value / ZOOM_STEP_FACTOR)}
        disabled={value <= MIN_PIXELS_PER_SECOND}
        title="Alejar en la línea de tiempo"
        className="flex min-h-11 min-w-11 items-center justify-center text-base font-medium text-bone hover:bg-surf-3 disabled:opacity-30"
      >
        −
      </button>
      <span className="w-11 text-center font-mono text-[10px] tabular-nums text-bone-3" title="Zoom actual">
        {pct}%
      </span>
      <button
        onClick={() => onChange(value * ZOOM_STEP_FACTOR)}
        disabled={value >= MAX_PIXELS_PER_SECOND}
        title="Acercar en la línea de tiempo"
        className="flex min-h-11 min-w-11 items-center justify-center text-base font-medium text-bone hover:bg-surf-3 disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}
