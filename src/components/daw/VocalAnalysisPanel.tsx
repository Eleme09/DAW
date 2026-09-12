"use client";

import type { Severity, VocalAnalysisResult } from "@/types/analysis";
import { WaveformIcon, WarningIcon } from "./icons";

const SEVERITY_COLOR: Record<Severity, string> = {
  low: "text-green-400",
  medium: "text-yellow-400",
  high: "text-red-400",
};

const SEVERITY_LABEL: Record<Severity, string> = { low: "Baja", medium: "Media", high: "Alta" };

interface VocalAnalysisPanelProps {
  result: VocalAnalysisResult;
  onEnhance?: () => void;
  enhancing?: boolean;
}

export function VocalAnalysisPanel({ result, onEnhance, enhancing }: VocalAnalysisPanelProps) {
  const rows: Array<[string, Severity]> = [
    ["Ruido", result.noise],
    ["Graves", result.lowEnd],
    ["Barro", result.mud],
    ["Aspereza", result.harshness],
    ["Sibilancia", result.sibilance],
  ];

  return (
    <div className="mt-1 rounded border border-line bg-ink p-2 text-[11px]">
      <div className="mb-1.5 flex items-center gap-1.5 border-b border-line pb-1.5 font-semibold uppercase tracking-wide text-bone-2">
        <WaveformIcon className="h-3.5 w-3.5 text-bone" />
        Análisis vocal
      </div>
      <div className="space-y-0.5">
        {rows.map(([label, severity]) => (
          <div key={label} className="flex justify-between">
            <span className="text-bone-2">{label}</span>
            <span className={SEVERITY_COLOR[severity]}>{SEVERITY_LABEL[severity]}</span>
          </div>
        ))}
        <div className="flex justify-between">
          <span className="text-bone-2">Dinámica</span>
          <span className={result.dynamics === "uncontrolled" ? "text-yellow-400" : "text-green-400"}>
            {result.dynamics === "uncontrolled" ? "Descontrolada" : "Controlada"}
          </span>
        </div>
      </div>

      {result.limitations.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-line pt-1.5">
          {result.limitations.map((msg, i) => (
            <p key={i} className="flex items-start gap-1.5 text-bone-3">
              <WarningIcon className="h-3.5 w-3.5 shrink-0 translate-y-px" /> {msg}
            </p>
          ))}
        </div>
      )}

      {onEnhance && (
        <button
          onClick={onEnhance}
          disabled={enhancing}
          className="mt-2 w-full rounded bg-bone px-2 py-1 text-[11px] font-semibold text-ink hover:opacity-90 disabled:opacity-50"
        >
          {enhancing ? "Aplicando…" : "Mejorar esta grabación"}
        </button>
      )}
    </div>
  );
}
