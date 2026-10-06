"use client";

import { useRef } from "react";

/** BandLab's "Blend": how much of the whole chain you hear (0 % = dry). */
export function BlendSlider({ value, onChange, disabled = false }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  function setFrom(clientX: number) {
    const r = track.current?.getBoundingClientRect();
    if (!r) return;
    onChange(Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * 100) / 100);
  }

  return (
    <div className={`mt-2 flex items-center gap-3 ${disabled ? "opacity-40" : ""}`}>
      <span className="text-[11px] font-medium text-bone-2">Blend</span>
      <div
        ref={track}
        role="slider"
        aria-label="Blend"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") onChange(Math.min(1, value + 0.05));
          if (e.key === "ArrowLeft") onChange(Math.max(0, value - 0.05));
        }}
        onPointerDown={(e) => {
          if (disabled) return;
          dragging.current = true;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setFrom(e.clientX);
        }}
        onPointerMove={(e) => dragging.current && setFrom(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
        onDoubleClick={() => !disabled && onChange(1)}
        className="relative h-7 flex-1 cursor-pointer"
        style={{ touchAction: "none" }}
      >
        <div className="absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/15" />
        <div className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-bone" style={{ width: `${value * 100}%` }} />
        <div className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bone shadow" style={{ left: `${value * 100}%` }} />
      </div>
      <span className="w-11 rounded-md bg-white/10 py-0.5 text-center font-mono text-[11px] text-bone">{Math.round(value * 100)} %</span>
    </div>
  );
}
