"use client";

import { useRef } from "react";
import { useRafLoop } from "@/hooks/useRafLoop";

const REDUCTION_MAX_DB = 24;

/** Horizontal bar, real telemetry (a DynamicsCompressorNode's own
 * `.reduction`), grows as more gain gets cut - shared by every effect
 * whose reference model (FabFilter Pro-C/Pro-L, per FASE 10F's table)
 * requires a "medidor de reducción de ganancia". */
export function GainReductionMeter({ reductionRef, label = "Reducción" }: { reductionRef: React.RefObject<number>; label?: string }) {
  const barRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useRafLoop(() => {
    const db = -reductionRef.current; // reduction is <= 0; show as a positive "dB cut" amount
    const frac = Math.min(1, Math.max(0, db / REDUCTION_MAX_DB));
    if (barRef.current) barRef.current.style.width = `${frac * 100}%`;
    if (labelRef.current) labelRef.current.textContent = `-${db.toFixed(1)} dB`;
  }, true);

  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-[10px] uppercase tracking-wide text-bone-3">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-sm bg-surf-2">
        <div ref={barRef} className="h-full bg-s2" style={{ width: "0%" }} />
      </div>
      <span ref={labelRef} className="w-14 shrink-0 text-right font-mono text-[10px] text-bone-2">
        -0.0 dB
      </span>
    </div>
  );
}
