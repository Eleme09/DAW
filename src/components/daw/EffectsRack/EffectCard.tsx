"use client";

import { useState } from "react";
import { useProjectStore, type EffectTarget } from "@/state/projectStore";
import { EFFECT_LABELS, type EffectInstance } from "@/types/effects";
import { EffectParamsEditor } from "./EffectParamsEditor";

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

  return (
    <div className={`rounded border ${effect.bypassed ? "border-neutral-800 opacity-50" : "border-neutral-700"} bg-neutral-900`}>
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button onClick={() => setExpanded((v) => !v)} className="text-neutral-500">
          {expanded ? "▾" : "▸"}
        </button>
        <span className="flex-1 text-xs font-medium text-neutral-200">{EFFECT_LABELS[effect.type]}</span>
        <button
          onClick={() => moveEffect(target, effect.id, -1)}
          disabled={isFirst}
          className="text-neutral-500 hover:text-neutral-300 disabled:opacity-20"
          title="Move up"
        >
          ↑
        </button>
        <button
          onClick={() => moveEffect(target, effect.id, 1)}
          disabled={isLast}
          className="text-neutral-500 hover:text-neutral-300 disabled:opacity-20"
          title="Move down"
        >
          ↓
        </button>
        <button
          onClick={() => toggleEffectBypass(target, effect.id)}
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
            effect.bypassed ? "bg-neutral-700 text-neutral-400" : "bg-orange-500 text-black"
          }`}
          title="Bypass"
        >
          {effect.bypassed ? "OFF" : "ON"}
        </button>
        <button onClick={() => removeEffect(target, effect.id)} className="text-neutral-600 hover:text-red-400">
          ✕
        </button>
      </div>
      {expanded && (
        <div className="space-y-1.5 border-t border-neutral-800 p-2">
          <EffectParamsEditor effect={effect} onChange={(params) => updateEffectParams(target, effect.id, params)} />
        </div>
      )}
    </div>
  );
}
