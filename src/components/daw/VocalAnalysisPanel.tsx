"use client";

import type { Severity, VocalAnalysisResult } from "@/types/analysis";
import { WaveformIcon } from "./icons";

const SEVERITY_COLOR: Record<Severity, string> = {
  low: "text-green-400",
  medium: "text-yellow-400",
  high: "text-red-400",
};

const SEVERITY_LABEL: Record<Severity, string> = { low: "Low", medium: "Medium", high: "High" };

interface VocalAnalysisPanelProps {
  result: VocalAnalysisResult;
  onEnhance?: () => void;
  enhancing?: boolean;
}

export function VocalAnalysisPanel({ result, onEnhance, enhancing }: VocalAnalysisPanelProps) {
  const rows: Array<[string, Severity]> = [
    ["Noise", result.noise],
    ["Low-end", result.lowEnd],
    ["Mud", result.mud],
    ["Harshness", result.harshness],
    ["Sibilance", result.sibilance],
  ];

  return (
    <div className="mt-1 rounded border border-neutral-800 bg-neutral-950 p-2 text-[11px]">
      <div className="mb-1.5 flex items-center gap-1.5 border-b border-neutral-800 pb-1.5 font-semibold uppercase tracking-wide text-neutral-400">
        <WaveformIcon className="h-3.5 w-3.5 text-cyan-400" />
        Vocal Analysis
      </div>
      <div className="space-y-0.5">
        {rows.map(([label, severity]) => (
          <div key={label} className="flex justify-between">
            <span className="text-neutral-500">{label}</span>
            <span className={SEVERITY_COLOR[severity]}>{SEVERITY_LABEL[severity]}</span>
          </div>
        ))}
        <div className="flex justify-between">
          <span className="text-neutral-500">Dynamics</span>
          <span className={result.dynamics === "uncontrolled" ? "text-yellow-400" : "text-green-400"}>
            {result.dynamics === "uncontrolled" ? "Uncontrolled" : "Controlled"}
          </span>
        </div>
      </div>

      {result.limitations.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-neutral-800 pt-1.5">
          {result.limitations.map((msg, i) => (
            <p key={i} className="text-neutral-500">
              ⚠ {msg}
            </p>
          ))}
        </div>
      )}

      {onEnhance && (
        <button
          onClick={onEnhance}
          disabled={enhancing}
          className="mt-2 w-full rounded bg-cyan-500 px-2 py-1 text-[11px] font-semibold text-black hover:bg-cyan-400 disabled:opacity-50"
        >
          {enhancing ? "Applying…" : "Enhance This Recording"}
        </button>
      )}
    </div>
  );
}
