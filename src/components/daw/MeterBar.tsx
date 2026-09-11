"use client";

import { useRef } from "react";
import { useRafLoop } from "@/hooks/useRafLoop";

interface MeterBarProps {
  analyser: AnalyserNode | null;
  vertical?: boolean;
}

/** Simple peak meter driven directly by refs to avoid re-render churn. */
export function MeterBar({ analyser, vertical = true }: MeterBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  useRafLoop(() => {
    if (!analyser || !barRef.current) return;
    if (!dataRef.current || dataRef.current.length !== analyser.fftSize) {
      dataRef.current = new Float32Array(analyser.fftSize);
    }
    analyser.getFloatTimeDomainData(dataRef.current);
    let peak = 0;
    for (const v of dataRef.current) {
      const abs = Math.abs(v);
      if (abs > peak) peak = abs;
    }
    const pct = Math.min(100, peak * 100);
    if (vertical) {
      barRef.current.style.height = `${pct}%`;
    } else {
      barRef.current.style.width = `${pct}%`;
    }
    barRef.current.style.background = pct > 90 ? "#ef4444" : pct > 70 ? "#eab308" : "#22c55e";
  }, Boolean(analyser));

  return (
    <div
      className={
        vertical
          ? "relative h-full w-2 overflow-hidden rounded-sm bg-neutral-800"
          : "relative h-2 w-full overflow-hidden rounded-sm bg-neutral-800"
      }
    >
      <div
        ref={barRef}
        className={
          vertical
            ? "absolute bottom-0 w-full bg-green-500 transition-[height] duration-75"
            : "absolute left-0 h-full bg-green-500 transition-[width] duration-75"
        }
      />
    </div>
  );
}
