"use client";

import { useState } from "react";
import { useProjectStore, type EffectTarget } from "@/state/projectStore";
import { EFFECT_LABELS, type EffectInstance } from "@/types/effects";
import { EffectParamsEditor } from "./EffectParamsEditor";
import { SparkleIcon, ChevronDownIcon, ChevronRightIcon, ArrowUpIcon, ArrowDownIcon, CloseIcon } from "../icons";

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
    setAssistantDraftMessage(`${EFFECT_LABELS[effect.type]} en ${targetName}: `);
    setBrowserTab("assistant");
    setMobileView("browser");
  }

  return (
    <div className={`rounded border ${effect.bypassed ? "border-line opacity-50" : "border-line-2"} bg-surf`}>
      <div className="flex items-center gap-0.5 px-2 py-1.5">
        <button
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Contraer" : "Expandir"}
          className="-m-3.5 flex h-11 w-11 shrink-0 items-center justify-center text-bone-2 hover:text-bone-2"
        >
          {expanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
        </button>
        <span className="flex-1 truncate text-xs font-medium text-bone">{EFFECT_LABELS[effect.type]}</span>
        <button
          onClick={askAi}
          title="Preguntar a la IA sobre este efecto"
          className="-m-3.5 flex h-11 w-11 shrink-0 items-center justify-center text-bone-2 hover:text-bone-2"
        >
          <SparkleIcon className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => moveEffect(target, effect.id, -1)}
          disabled={isFirst}
          className="-m-3.5 flex h-11 w-11 shrink-0 items-center justify-center text-bone-2 hover:text-bone-2 disabled:opacity-20"
          title="Subir"
        >
          <ArrowUpIcon className="h-4 w-4" />
        </button>
        <button
          onClick={() => moveEffect(target, effect.id, 1)}
          disabled={isLast}
          className="-m-3.5 flex h-11 w-11 shrink-0 items-center justify-center text-bone-2 hover:text-bone-2 disabled:opacity-20"
          title="Bajar"
        >
          <ArrowDownIcon className="h-4 w-4" />
        </button>
        <button
          onClick={() => toggleEffectBypass(target, effect.id)}
          className={`flex h-11 min-w-11 shrink-0 items-center justify-center rounded px-2 text-[10px] font-bold ${
            effect.bypassed ? "bg-surf-3 text-bone-2" : "bg-bone text-ink"
          }`}
          title="Bypass"
        >
          {effect.bypassed ? "OFF" : "ON"}
        </button>
        <button
          onClick={() => removeEffect(target, effect.id)}
          title="Eliminar efecto"
          className="-m-3.5 flex h-11 w-11 shrink-0 items-center justify-center text-bone-3 hover:text-red-400"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
      {expanded && (
        <div className="flex flex-wrap gap-x-3 gap-y-2 border-t border-line p-2">
          <EffectParamsEditor target={target} effect={effect} onChange={(params) => updateEffectParams(target, effect.id, params)} />
        </div>
      )}
    </div>
  );
}
