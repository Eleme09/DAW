"use client";

import { useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { useRafLoop } from "@/hooks/useRafLoop";
import { useProjectStore, type EffectTarget } from "@/state/projectStore";
import {
  EFFECT_LABELS,
  EFFECT_PRESET_META,
  EFFECT_ACCENT,
  applyEffectPreset,
  type EffectInstance,
} from "@/types/effects";
import { EffectParamsEditor } from "./EffectParamsEditor";
import { BottomSheet } from "../BottomSheet";
import {
  SparkleIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  CloseIcon,
} from "../icons";

interface EffectCardProps {
  target: EffectTarget;
  effect: EffectInstance;
  isFirst: boolean;
  isLast: boolean;
}

export function EffectCard({ target, effect, isFirst, isLast }: EffectCardProps) {
  // Collapsed by default and opens full-screen on tap, not an inline expand
  // - one effect used to fill the whole rack with its knobs and leftover
  // whitespace (a single EQ band reported as "taking over the screen").
  // The compact row alone (name + bypass) already says everything needed
  // without opening it.
  const [sheetOpen, setSheetOpen] = useState(false);
  // A/B compare (zona 1/7): two parameter snapshots the user can flip
  // between instantly, each remembering which preset (if any) it was last
  // set to - tracked per slot, not globally, so flipping to B after dialing
  // in a preset on A doesn't keep claiming that preset's name for B's own
  // (different) params. Real state flip, not a loudness-matched bypass -
  // that's zona 8's separate, harder "honest bypass" task, still not done
  // (see PROGRESS.md backlog). Both slots start as the params the card
  // mounted with, with no preset claimed for either.
  const [slots, setSlots] = useState<{
    A: { params: EffectInstance["params"]; presetId: string | null };
    B: { params: EffectInstance["params"]; presetId: string | null };
  }>(() => ({
    A: { params: effect.params, presetId: null },
    B: { params: effect.params, presetId: null },
  }));
  const [activeSlot, setActiveSlot] = useState<"A" | "B">("A");
  // Zona 8 "bypass honesto": the real measured dB gap between this effect's
  // processed and dry signal, read from the engine's own continuous
  // BypassWrapper measurement (AudioEngine.getEffectBypassDeltaDb) - not a
  // guess. Polled only while the sheet is open (the compensation itself
  // runs in the engine regardless; this is just the display catching up).
  const [bypassDeltaDb, setBypassDeltaDb] = useState(0);
  useRafLoop(() => {
    setBypassDeltaDb(getAudioEngine().getEffectBypassDeltaDb(target, effect.id) ?? 0);
  }, sheetOpen);

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

  const presets = EFFECT_PRESET_META[effect.type];
  const activePresetId = slots[activeSlot].presetId;
  const presetLabel = (activePresetId && presets.find((p) => p.id === activePresetId)?.label) || "Personalizado";
  const accent = `var(--cabina-${EFFECT_ACCENT[effect.type]})`;
  // Below this, the gap is close enough to read as "basically matched" -
  // showing e.g. "+0.05dB" would just be noise, not honesty.
  const deltaIsMeaningful = Math.abs(bypassDeltaDb) >= 0.3;
  const deltaText = `${bypassDeltaDb > 0 ? "+" : ""}${bypassDeltaDb.toFixed(1)}dB`;
  const bypassTitle = deltaIsMeaningful ? `Bypass (diferencia real ${deltaText} - ya compensada al volumen)` : "Bypass";

  function applyParams(params: EffectInstance["params"], newPresetId: string | null) {
    updateEffectParams(target, effect.id, params);
    setSlots((s) => ({ ...s, [activeSlot]: { params, presetId: newPresetId } }));
  }

  function cyclePreset(dir: 1 | -1) {
    if (presets.length === 0) return;
    const currentIdx = activePresetId ? presets.findIndex((p) => p.id === activePresetId) : -1;
    const nextIdx = currentIdx < 0 ? (dir > 0 ? 0 : presets.length - 1) : (currentIdx + dir + presets.length) % presets.length;
    const next = presets[nextIdx];
    applyParams(applyEffectPreset(effect, next.id), next.id);
  }

  function selectSlot(slot: "A" | "B") {
    if (slot === activeSlot) return;
    setActiveSlot(slot);
    updateEffectParams(target, effect.id, slots[slot].params);
  }

  function askAi() {
    setAssistantDraftMessage(`${EFFECT_LABELS[effect.type]} en ${targetName}: `);
    setBrowserTab("assistant");
    setMobileView("browser");
  }

  return (
    <div className={`rounded border ${effect.bypassed ? "border-line opacity-50" : "border-line-2"} bg-surf`}>
      <div
        onClick={() => setSheetOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setSheetOpen(true);
        }}
        title="Abrir a pantalla completa"
        className="flex w-full cursor-pointer items-center gap-0.5 px-2 py-1.5 text-left"
      >
        <span className="-m-3.5 flex h-11 w-11 shrink-0 items-center justify-center text-bone-2">
          <ChevronRightIcon className="h-4 w-4" />
        </span>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} title="Tipo de efecto" />
        <span className="ml-1.5 flex-1 truncate text-xs font-medium text-bone">{EFFECT_LABELS[effect.type]}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            askAi();
          }}
          title="Preguntar a la IA sobre este efecto"
          className="-m-3.5 flex h-11 w-11 shrink-0 items-center justify-center text-bone-2 hover:text-bone-2"
        >
          <SparkleIcon className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            moveEffect(target, effect.id, -1);
          }}
          disabled={isFirst}
          className="-m-3.5 flex h-11 w-11 shrink-0 items-center justify-center text-bone-2 hover:text-bone-2 disabled:opacity-20"
          title="Subir"
        >
          <ArrowUpIcon className="h-4 w-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            moveEffect(target, effect.id, 1);
          }}
          disabled={isLast}
          className="-m-3.5 flex h-11 w-11 shrink-0 items-center justify-center text-bone-2 hover:text-bone-2 disabled:opacity-20"
          title="Bajar"
        >
          <ArrowDownIcon className="h-4 w-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleEffectBypass(target, effect.id);
          }}
          className={`flex h-11 min-w-11 shrink-0 items-center justify-center rounded px-2 text-[10px] font-bold ${
            effect.bypassed ? "bg-surf-3 text-bone-2" : "bg-bone text-ink"
          }`}
          title="Bypass"
        >
          {effect.bypassed ? "OFF" : "ON"}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeEffect(target, effect.id);
          }}
          title="Eliminar efecto"
          className="-m-3.5 flex h-11 w-11 shrink-0 items-center justify-center text-bone-3 hover:text-red-400"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={EFFECT_LABELS[effect.type]}
        accent={accent}
        subtitle={
          <div className="pt-2">
            <div className="flex items-center gap-1">
              {presets.length > 0 && (
                <>
                  <button
                    onClick={() => cyclePreset(-1)}
                    title="Preset anterior"
                    className="flex h-10 w-10 shrink-0 items-center justify-center text-bone-2 hover:text-bone-2"
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                  </button>
                  <span className="flex-1 truncate text-center text-[11px] font-medium text-bone-2">{presetLabel}</span>
                  <button
                    onClick={() => cyclePreset(1)}
                    title="Preset siguiente"
                    className="flex h-10 w-10 shrink-0 items-center justify-center text-bone-2 hover:text-bone-2"
                  >
                    <ChevronRightIcon className="h-4 w-4" />
                  </button>
                </>
              )}
              <div className="ml-2 flex shrink-0 overflow-hidden rounded border border-line">
                <button
                  onClick={() => selectSlot("A")}
                  title="Comparar A"
                  className={`h-10 w-9 text-[11px] font-bold ${activeSlot === "A" ? "bg-bone text-ink" : "bg-surf-2 text-bone-2"}`}
                >
                  A
                </button>
                <button
                  onClick={() => selectSlot("B")}
                  title="Comparar B"
                  className={`h-10 w-9 text-[11px] font-bold ${activeSlot === "B" ? "bg-bone text-ink" : "bg-surf-2 text-bone-2"}`}
                >
                  B
                </button>
              </div>
              <button
                onClick={() => toggleEffectBypass(target, effect.id)}
                className={`ml-2 flex h-10 min-w-10 shrink-0 items-center justify-center rounded px-2 text-[10px] font-bold ${
                  effect.bypassed ? "bg-surf-3 text-bone-2" : "bg-bone text-ink"
                }`}
                title={bypassTitle}
              >
                {effect.bypassed ? "OFF" : "ON"}
              </button>
            </div>
            {deltaIsMeaningful && (
              <p className="px-1 pt-1 text-center text-[10px] text-bone-3">
                Diferencia real: {deltaText} {effect.bypassed ? "(bypass ya la compensa)" : "(se compensará al hacer bypass)"}
              </p>
            )}
          </div>
        }
      >
        <div className="flex flex-wrap gap-x-3 gap-y-2">
          <EffectParamsEditor
            target={target}
            effect={effect}
            onChange={(params) => applyParams(params, null)}
          />
        </div>
      </BottomSheet>
    </div>
  );
}
