"use client";

import { useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import type { PitchCorrectionEffect } from "@/audio-engine/effects/PitchCorrectionEffect";
import type { PitchAnalysis } from "@/audio-engine/pitch/applyPitchCorrection";
import { useRafLoop } from "@/hooks/useRafLoop";
import type { EffectTarget } from "@/state/projectStore";
import {
  EFFECT_ACCENT,
  PITCH_CORRECTION_PRESETS,
  PITCH_CORRECTION_PRESET_LABELS,
  PITCH_CORRECTION_PRESET_NAMES,
  type PitchCorrectionParams,
  type PitchCorrectionPresetName,
} from "@/types/effects";
import { BottomSheet } from "../BottomSheet";
import { Knob } from "../ui/Knob";
import { Picker } from "../ui/Picker";
import { NoteIcon, WaveformIcon, TuneIcon, HeadphonesIcon, AutomationIcon } from "../icons";

const NOTE_NAMES = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"] as const;
const KEY_OPTIONS = NOTE_NAMES.map((name, i) => ({ value: String(i), label: name }));

function midiToLabel(midi: number | null): string {
  if (midi === null) return "—";
  const rounded = Math.round(midi);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

function frequencyToMidi(freq: number, refHz: number): number {
  return 69 + 12 * Math.log2(freq / refHz);
}

/**
 * The reference design's "Afinación" mockup shows 5 style icons named
 * Clásico/Dúo/Armonía/Natural/Robot - illustrative content for a generic
 * example, not a spec for THIS codebase: "Dúo"/"Armonía" imply a multi-
 * voice harmonizer, and no such effect exists anywhere in this project
 * (confirmed before writing this file). Rather than inventing two fake
 * presets to hit the count, this reuses the 5 real, already-implemented
 * PITCH_CORRECTION_PRESETS with their real labels - the same ones
 * EffectCard's preset navigator already shows for this exact effect, so
 * the two screens never disagree about what to call the same setting.
 */
const STYLE_ICONS: Record<PitchCorrectionPresetName, typeof NoteIcon> = {
  natural: NoteIcon,
  popSuave: WaveformIcon,
  trapDuro: TuneIcon,
  transparente: HeadphonesIcon,
  robot: AutomationIcon,
};

interface AfinacionPanelProps {
  open: boolean;
  onClose: () => void;
  target: EffectTarget;
  effectId: string;
  params: PitchCorrectionParams;
  onChange: (params: PitchCorrectionParams) => void;
  /** VozPanel already runs `analyzePitch` on the take in the background the
   * moment it loads (for the pitch-curve view) - this reuses that same
   * result (the real Krumhansl-Kessler key detector, not a second
   * redundant analysis pass) instead of re-running it on click. Null
   * before anything's loaded, in which case "Detectar" stays disabled. */
  pitchAnalysis: PitchAnalysis | null;
}

/**
 * The simple, one-screen "Afinación" from "Cabina v2": a single big
 * Intensidad knob, automatic key/scale detection, and 5 named styles -
 * deliberately NOT the dense `PitchCorrectionPanel` (still reachable from
 * the generic effects rack for the full manual controls: fixed-pitch mode,
 * per-note custom scale, detection range, reference pitch). This screen
 * is the 80% case; that one is the escape hatch for the other 20%.
 */
export function AfinacionPanel({ open, onClose, target, effectId, params, onChange, pitchAnalysis }: AfinacionPanelProps) {
  const [detectResult, setDetectResult] = useState<{ confidencePct: number } | null>(null);
  const [liveLabel, setLiveLabel] = useState<{ detected: string; target: string; cents: number | null; confidence: number }>({
    detected: "—",
    target: "—",
    cents: null,
    confidence: 0,
  });

  useRafLoop(() => {
    const node = getAudioEngine().getEffectNode(target, effectId) as PitchCorrectionEffect | undefined;
    const info = typeof node?.getLastInfo === "function" ? node.getLastInfo() : null;
    setLiveLabel({
      detected: midiToLabel(info?.detectedHz != null ? frequencyToMidi(info.detectedHz, params.referenceHz) : null),
      target: midiToLabel(info?.targetHz != null ? frequencyToMidi(info.targetHz, params.referenceHz) : null),
      cents: info?.centsOff ?? null,
      confidence: info?.confidence ?? 0,
    });
  }, open);

  function detectKey() {
    if (!pitchAnalysis) return;
    const { detectedKey } = pitchAnalysis;
    onChange({ ...params, key: detectedKey.key, scale: detectedKey.scale === "minor" ? "naturalMinor" : "major" });
    setDetectResult({ confidencePct: Math.round(detectedKey.confidence * 100) });
  }

  function toggleMajorMinor() {
    onChange({ ...params, scale: params.scale === "major" ? "naturalMinor" : "major" });
  }

  function applyStyle(name: PitchCorrectionPresetName) {
    onChange({ ...params, mode: "scale", ...PITCH_CORRECTION_PRESETS[name] });
  }

  const scaleLabel = params.scale === "major" ? "Mayor" : params.scale === "naturalMinor" ? "Menor" : params.scale;
  const centsText =
    liveLabel.cents !== null && liveLabel.confidence > 0.5
      ? `${liveLabel.cents > 0 ? "+" : ""}${Math.round(liveLabel.cents)} cents`
      : "—";

  return (
    <BottomSheet open={open} onClose={onClose} title="Afinación" accent={`var(--cabina-${EFFECT_ACCENT.pitchCorrection})`}>
      <div className="flex flex-col items-center gap-3">
        <div className="flex w-full gap-2">
          <div className="w-20">
            <Picker
              value={String(params.key)}
              options={KEY_OPTIONS}
              title="Tonalidad"
              onChange={(v) => onChange({ ...params, key: Number(v) })}
            />
          </div>
          <button
            onClick={toggleMajorMinor}
            className="flex min-h-11 flex-1 items-center justify-center rounded bg-surf px-3 text-[11px] font-medium text-bone"
          >
            {scaleLabel}
          </button>
          <button
            onClick={detectKey}
            disabled={!pitchAnalysis}
            title={pitchAnalysis ? "Detectar tonalidad real de la toma grabada" : "Graba algo primero para poder detectarla"}
            className="flex min-h-11 shrink-0 items-center justify-center rounded bg-surf-2 px-3 text-[11px] font-medium text-bone-2 disabled:opacity-40"
          >
            Detectar
          </button>
        </div>
        {detectResult && (
          <p className="-mt-1 w-full text-center text-[10px] text-bone-3">Detectado con {detectResult.confidencePct}% de confianza</p>
        )}

        <Knob
          value={params.mix * 100}
          min={0}
          max={100}
          defaultValue={70}
          decimals={0}
          unit="%"
          label="Intensidad"
          size={150}
          onChange={(v) => onChange({ ...params, mix: v / 100 })}
        />

        <p className="font-mono text-[11px] text-bone-2">
          {liveLabel.detected} → <span className="text-live">{liveLabel.target}</span> · {centsText}
        </p>

        <div className="grid w-full grid-cols-5 gap-2">
          {PITCH_CORRECTION_PRESET_NAMES.map((name) => {
            const Icon = STYLE_ICONS[name];
            const active = params.mode === "scale" && PITCH_CORRECTION_PRESETS[name].retuneSpeedMs === params.retuneSpeedMs && PITCH_CORRECTION_PRESETS[name].humanize === params.humanize;
            return (
              <button key={name} onClick={() => applyStyle(name)} className="flex flex-col items-center gap-1 text-center">
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-full border ${
                    active ? "border-bone bg-bone text-ink" : "border-line-2 bg-surf text-bone-2"
                  }`}
                >
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <span className={`text-[9px] font-medium ${active ? "text-bone" : "text-bone-3"}`}>
                  {PITCH_CORRECTION_PRESET_LABELS[name]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </BottomSheet>
  );
}
