"use client";

import { useState } from "react";
import { useProjectStore } from "@/state/projectStore";
import { EFFECT_LABELS, type EffectType } from "@/types/effects";
import { EffectCard } from "./EffectCard";
import { Analyzer } from "./Analyzer";
import { InstrumentSettings } from "./InstrumentSettings";
import { WaveformIcon, BusIcon } from "../icons";

const EFFECT_TYPES = Object.keys(EFFECT_LABELS) as EffectType[];

export function EffectsRackPanel() {
  const mode = useProjectStore((s) => s.effectsRackMode);
  const setMode = useProjectStore((s) => s.setEffectsRackMode);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const selectedTrackId = useProjectStore((s) => s.selectedTrackId);
  const selectedTrack = useProjectStore((s) => s.project.tracks.find((t) => t.id === s.selectedTrackId));
  const masterInserts = useProjectStore((s) => s.project.masterInserts);
  const addEffect = useProjectStore((s) => s.addEffect);

  const target = mode === "master" ? "master" : selectedTrackId;
  const inserts = mode === "master" ? masterInserts : (selectedTrack?.inserts ?? []);
  const label = mode === "master" ? "Bus master" : (selectedTrack?.name ?? "Ninguna pista seleccionada");

  return (
    <div className="flex h-full w-full shrink-0 flex-col border-l border-neutral-800 bg-neutral-950 md:w-80">
      <div className="flex items-center gap-1.5 border-b border-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-300">
        <span className="text-neutral-500">Efectos</span>
        <span className="text-neutral-700">/</span>
        <span className="truncate text-cyan-300">{label}</span>
      </div>

      <div className="flex border-b border-neutral-800 text-xs font-medium">
        <button
          onClick={() => setMode("track")}
          title="Efectos solo en la pista seleccionada"
          className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2 ${
            mode === "track"
              ? "border-cyan-500 bg-neutral-900 text-cyan-400"
              : "border-transparent text-neutral-500 hover:text-neutral-300"
          }`}
        >
          <WaveformIcon className="h-3.5 w-3.5" />
          Pista
        </button>
        <button
          onClick={() => setMode("master")}
          title="Efectos en el bus master, aplicados a toda la mezcla"
          className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2 ${
            mode === "master"
              ? "border-cyan-500 bg-neutral-900 text-cyan-400"
              : "border-transparent text-neutral-500 hover:text-neutral-300"
          }`}
        >
          <BusIcon className="h-3.5 w-3.5" />
          Master
        </button>
      </div>

      {mode === "master" && <Analyzer />}
      {mode === "track" && selectedTrack?.type === "instrument" && <InstrumentSettings track={selectedTrack} />}

      {!target ? (
        <p className="p-4 text-center text-xs text-neutral-600">Selecciona una pista para editar sus efectos.</p>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-2 overflow-y-auto p-2">
            {inserts.length === 0 && (
              <p className="mt-4 text-center text-xs text-neutral-600">Todavía no hay efectos.</p>
            )}
            {inserts.map((effect, i) => (
              <EffectCard
                key={effect.id}
                target={target}
                effect={effect}
                isFirst={i === 0}
                isLast={i === inserts.length - 1}
              />
            ))}
          </div>

          <div className="relative border-t border-neutral-800 p-2">
            <button
              onClick={() => setShowAddMenu((v) => !v)}
              className="min-h-11 w-full rounded bg-cyan-500 px-2 text-xs font-semibold text-black hover:bg-cyan-400"
            >
              + Nuevo efecto
            </button>
            {showAddMenu && (
              <div className="absolute bottom-full left-2 right-2 mb-1 max-h-64 overflow-y-auto rounded border border-neutral-700 bg-neutral-900 shadow-lg">
                {EFFECT_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => {
                      addEffect(target, type);
                      setShowAddMenu(false);
                    }}
                    className="block min-h-11 w-full px-3 text-left text-xs text-neutral-300 hover:bg-neutral-800"
                  >
                    {EFFECT_LABELS[type]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
