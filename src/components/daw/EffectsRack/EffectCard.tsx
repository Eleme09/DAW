"use client";

import { useState } from "react";
import { useProjectStore, type EffectTarget } from "@/state/projectStore";
import { EFFECT_LABELS, type EffectInstance } from "@/types/effects";
import { EffectParamsEditor } from "./EffectParamsEditor";
import { SparkleIcon } from "../icons";

interface EffectCardProps {
  target: EffectTarget;
  effect: EffectInstance;
  isFirst: boolean;
  isLast: boolean;
}

export function EffectCard({ target, effect, isFirst, isLast }: EffectCardProps) {
  const [expanded, setExpanded] = useState(true);
  const updateEffectParams = useProjectStore((s) => s.updateEffectParams);
  const toggleEffectBypass = useProjectStore((s) => s.toggleEffectBypass);
  const removeEffect = useProjectStore((s) => s.removeEffect);
  const moveEffect = useProjectStore((s) => s.moveEffect);
  const targetName = useProjectStore((s) =>
    target === "master" ? "Master" : (s.project.tracks.find((t) => t.id === target)?.name ?? target)
  );
  const setAssistantDraftMessage = useProjectStore((s) => s.setAssistantDraftMessage);
  const setBrowserTab = useProjectStore((s) => s.setBrowserTab);
  const setMobileView = useProjectStore((s) => s.setMobileView);

  function askAi() {
    setAssistantDraftMessage(`${EFFECT_LABELS[effect.type]} on ${targetName}: `);
    setBrowserTab("assistant");
    setMobileView("browser");
  }

  return (
    <div className={`rounded border ${effect.bypassed ? "border-neutral-800 opacity-50" : "border-neutral-700"} bg-neutral-900`}>
      <div className="flex items-center gap-0.5 px-2 py-1.5">
        <button
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Collapse" : "Expand"}
          className="-m-3.5 flex h-11 w-11 shrink-0 items-center justify-center text-neutral-500 hover:text-neutral-300"
        >
          {expanded ? "▾" : "▸"}
        </button>
        <span className="flex-1 truncate text-xs font-medium text-neutral-200">{EFFECT_LABELS[effect.type]}</span>
        <button
          onClick={askAi}
          title="Ask AI about this effect"
          className="-m-3.5 flex h-11 w-11 shrink-0 items-center justify-center text-neutral-500 hover:text-neutral-300"
        >
          <SparkleIcon className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => moveEffect(target, effect.id, -1)}
          disabled={isFirst}
          className="-m-3.5 flex h-11 w-11 shrink-0 items-center justify-center text-neutral-500 hover:text-neutral-300 disabled:opacity-20"
          title="Move up"
        >
          ↑
        </button>
        <button
          onClick={() => moveEffect(target, effect.id, 1)}
          disabled={isLast}
          className="-m-3.5 flex h-11 w-11 shrink-0 items-center justify-center text-neutral-500 hover:text-neutral-300 disabled:opacity-20"
          title="Move down"
        >
          ↓
        </button>
        <button
          onClick={() => toggleEffectBypass(target, effect.id)}
          className={`flex h-11 min-w-11 shrink-0 items-center justify-center rounded px-2 text-[10px] font-bold ${
            effect.bypassed ? "bg-neutral-700 text-neutral-400" : "bg-cyan-500 text-black"
          }`}
          title="Bypass"
        >
          {effect.bypassed ? "OFF" : "ON"}
        </button>
        <button
          onClick={() => removeEffect(target, effect.id)}
          title="Remove effect"
          className="-m-3.5 flex h-11 w-11 shrink-0 items-center justify-center text-neutral-600 hover:text-red-400"
        >
          ✕
        </button>
      </div>
      {expanded && (
        <div className="flex flex-wrap gap-x-3 gap-y-2 border-t border-neutral-800 p-2">
          <EffectParamsEditor target={target} effect={effect} onChange={(params) => updateEffectParams(target, effect.id, params)} />
        </div>
      )}
    </div>
  );
}
