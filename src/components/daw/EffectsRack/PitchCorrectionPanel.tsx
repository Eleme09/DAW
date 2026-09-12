"use client";

import { useRef } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import type { PitchCorrectionEffect, PitchCorrectionLiveInfo } from "@/audio-engine/effects/PitchCorrectionEffect";
import { useRafLoop } from "@/hooks/useRafLoop";
import type { EffectTarget } from "@/state/projectStore";
import {
  MAJOR_SCALE_MASK,
  PITCH_CORRECTION_PRESETS,
  PITCH_CORRECTION_PRESET_LABELS,
  PITCH_CORRECTION_PRESET_NAMES,
  type PitchCorrectionParams,
  type PitchCorrectionScale,
} from "@/types/effects";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Picker } from "../ui/Picker";
import { Knob } from "../ui/Knob";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);

const SCALE_OPTIONS: { value: PitchCorrectionScale; label: string }[] = [
  { value: "major", label: "Mayor" },
  { value: "naturalMinor", label: "Menor nat." },
  { value: "harmonicMinor", label: "Menor arm." },
  { value: "chromatic", label: "Cromática" },
  { value: "custom", label: "Personalizada" },
];

const KEY_OPTIONS = NOTE_NAMES.map((name, i) => ({ value: String(i), label: name }));

/** The set of allowed pitch classes for a given (scale, customMask) pair -
 * used both to light the keyboard and to seed `customMask` the first time
 * a user taps a note while on a fixed scale (see togglePitchClass). */
function activePitchClasses(scale: PitchCorrectionScale, customMask: number): Set<number> {
  if (scale === "custom") {
    const set = new Set<number>();
    for (let pc = 0; pc < 12; pc++) if (customMask & (1 << pc)) set.add(pc);
    return set;
  }
  const intervals: Record<Exclude<PitchCorrectionScale, "custom">, number[]> = {
    major: [0, 2, 4, 5, 7, 9, 11],
    naturalMinor: [0, 2, 3, 5, 7, 8, 10],
    harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  };
  return new Set(intervals[scale]);
}

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

const WIDTH = 300;
const HEIGHT = 130;
const HISTORY_CAPACITY = 120;
const CENTS_RANGE = 55;

interface PitchCorrectionPanelProps {
  target: EffectTarget;
  effectId: string;
  params: PitchCorrectionParams;
  onChange: (params: PitchCorrectionParams) => void;
}

export function PitchCorrectionPanel({ target, effectId, params, onChange }: PitchCorrectionPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<number[]>([]);
  const lastInfoRef = useRef<PitchCorrectionLiveInfo | null>(null);
  const labelRef = useRef<{ detected: string; target: string; cents: number | null; confidence: number }>({
    detected: "—",
    target: "—",
    cents: null,
    confidence: 0,
  });

  useRafLoop(() => {
    const node = getAudioEngine().getEffectNode(target, effectId) as PitchCorrectionEffect | undefined;
    const info = node?.getLastInfo() ?? null;

    if (info !== lastInfoRef.current) {
      lastInfoRef.current = info;
      const cents = info?.centsOff ?? null;
      historyRef.current.push(cents ?? NaN);
      if (historyRef.current.length > HISTORY_CAPACITY) historyRef.current.shift();
      labelRef.current = {
        detected: midiToLabel(info?.detectedHz != null ? frequencyToMidi(info.detectedHz, params.referenceHz) : null),
        target: midiToLabel(info?.targetHz != null ? frequencyToMidi(info.targetHz, params.referenceHz) : null),
        cents,
        confidence: info?.confidence ?? 0,
      };
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || WIDTH;
    const h = canvas.clientHeight || HEIGHT;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const centsToY = (c: number) => h / 2 - (Math.max(-CENTS_RANGE, Math.min(CENTS_RANGE, c)) / CENTS_RANGE) * (h / 2 - 10);

    // Grid: center "in tune" line + +/-25/50 cent guides.
    for (const c of [-50, -25, 0, 25, 50]) {
      const y = centsToY(c);
      ctx.strokeStyle = c === 0 ? "rgba(34,211,238,0.35)" : "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "9px monospace";
    ctx.fillText("+50¢", 2, centsToY(50) - 2);
    ctx.fillText("0¢", 2, centsToY(0) - 2);
    ctx.fillText("-50¢", 2, centsToY(-50) - 2);

    // Pitch history, scrolling right-to-left (most recent at the right edge).
    const hist = historyRef.current;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < hist.length; i++) {
      const c = hist[i];
      const x = (i / (HISTORY_CAPACITY - 1)) * w;
      if (Number.isNaN(c)) {
        started = false;
        continue;
      }
      const y = centsToY(c);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Current reading dot at the right edge.
    const lastCents = hist[hist.length - 1];
    if (lastCents !== undefined && !Number.isNaN(lastCents)) {
      const y = centsToY(lastCents);
      const inTune = Math.abs(lastCents) < 10;
      ctx.fillStyle = inTune ? "#4ade80" : "#22d3ee";
      ctx.beginPath();
      ctx.arc(w - 4, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Detected -> target note readout.
    const { detected, target: targetLabel, confidence } = labelRef.current;
    ctx.font = "bold 15px monospace";
    ctx.fillStyle = confidence > 0.5 ? "#e5e5e5" : "rgba(229,229,229,0.35)";
    ctx.fillText(detected, 8, h - 10);
    ctx.font = "11px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillText("→", 52, h - 12);
    ctx.font = "bold 15px monospace";
    ctx.fillStyle = "#22d3ee";
    ctx.fillText(targetLabel, 68, h - 10);
  }, true);

  const activeClasses = activePitchClasses(params.scale, params.customMask);

  function togglePitchClass(pc: number) {
    if (params.scale === "custom") {
      const next = params.customMask ^ (1 << pc);
      onChange({ ...params, customMask: next });
      return;
    }
    // First tap on a fixed scale switches to custom, seeded from that
    // scale's own notes, then toggles the tapped one - see the addendum's
    // "tap a key to exclude that note" requirement (only meaningful for an
    // arbitrary, user-editable note set, not one of the fixed named scales).
    const seeded = activePitchClasses(params.scale, params.customMask);
    if (seeded.has(pc)) seeded.delete(pc);
    else seeded.add(pc);
    let mask = 0;
    for (const p of seeded) mask |= 1 << p;
    onChange({ ...params, scale: "custom", customMask: mask });
  }

  function applyPreset(name: (typeof PITCH_CORRECTION_PRESET_NAMES)[number]) {
    onChange({ ...params, ...PITCH_CORRECTION_PRESETS[name] });
  }

  return (
    <div className="w-full space-y-2">
      <canvas
        ref={canvasRef}
        style={{ width: WIDTH, height: HEIGHT }}
        className="w-full max-w-full rounded bg-neutral-950"
      />
      <p className="text-[9px] text-neutral-600">
        Blanco: nota detectada. Cian: nota destino (suavizada). La línea muestra cuántos cents desafinaste de la nota
        de escala más cercana.
      </p>

      <div className="flex gap-1">
        {PITCH_CORRECTION_PRESET_NAMES.map((name) => (
          <button
            key={name}
            onClick={() => applyPreset(name)}
            className="min-h-11 flex-1 rounded bg-neutral-800 px-1 text-[10px] font-medium text-neutral-300 hover:bg-neutral-700"
          >
            {PITCH_CORRECTION_PRESET_LABELS[name]}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="w-20">
          <Picker
            value={String(params.key)}
            options={KEY_OPTIONS}
            title="Tonalidad"
            onChange={(v) => onChange({ ...params, key: Number(v) })}
          />
        </div>
        <div className="flex-1">
          <SegmentedControl
            value={params.scale}
            options={SCALE_OPTIONS}
            onChange={(scale) => onChange({ ...params, scale, customMask: params.customMask || MAJOR_SCALE_MASK })}
          />
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded border border-neutral-800 p-1">
        {Array.from({ length: 12 }, (_, i) => 11 - i).map((pc) => {
          const isRoot = pc === params.key;
          const isActive = activeClasses.has(pc);
          const isBlack = BLACK_KEYS.has(pc);
          return (
            <button
              key={pc}
              onClick={() => togglePitchClass(pc)}
              title={`${NOTE_NAMES[pc]}${isActive ? " (en la escala)" : " (excluida)"}`}
              className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded text-[9px] font-medium ${
                isActive ? (isBlack ? "bg-neutral-700 text-neutral-100" : "bg-neutral-200 text-black") : "bg-neutral-950 text-neutral-700"
              } ${isRoot ? "ring-2 ring-inset ring-cyan-500" : ""}`}
              style={{ writingMode: "vertical-rl" }}
            >
              {NOTE_NAMES[pc]}
            </button>
          );
        })}
      </div>
      <p className="text-[9px] text-neutral-600">
        Desliza para ver las 12 notas. Toca una nota para excluirla/incluirla (cambia a escala Custom).
      </p>

      <div className="flex flex-wrap gap-x-3 gap-y-2">
        <Knob
          value={params.retuneSpeedMs}
          min={0}
          max={400}
          defaultValue={120}
          decimals={0}
          unit=" ms"
          label="Retune"
          onChange={(v) => onChange({ ...params, retuneSpeedMs: v })}
        />
        <Knob
          value={params.mix * 100}
          min={0}
          max={100}
          defaultValue={100}
          decimals={0}
          unit="%"
          label="Mezcla"
          onChange={(v) => onChange({ ...params, mix: v / 100 })}
        />
        <Knob
          value={params.humanize * 100}
          min={0}
          max={100}
          defaultValue={30}
          decimals={0}
          unit="%"
          label="Humanizar"
          onChange={(v) => onChange({ ...params, humanize: v / 100 })}
        />
        <Knob
          value={params.referenceHz}
          min={400}
          max={480}
          defaultValue={440}
          decimals={0}
          unit="Hz"
          label="Ref (A4)"
          size={36}
          onChange={(v) => onChange({ ...params, referenceHz: v })}
        />
        <Knob
          value={params.detectMinHz}
          min={40}
          max={300}
          defaultValue={70}
          decimals={0}
          unit="Hz"
          label="Detección mín"
          size={36}
          onChange={(v) => onChange({ ...params, detectMinHz: Math.min(v, params.detectMaxHz - 10) })}
        />
        <Knob
          value={params.detectMaxHz}
          min={300}
          max={2000}
          defaultValue={1000}
          decimals={0}
          unit="Hz"
          label="Detección máx"
          size={36}
          onChange={(v) => onChange({ ...params, detectMaxHz: Math.max(v, params.detectMinHz + 10) })}
        />
      </div>
      <p className="text-[9px] text-neutral-600">
        Sin preservación de formantes todavía - correcciones grandes pueden sonar más finas (&quot;chipmunk&quot;).
        Ver AUDIO_ENGINE.md.
      </p>
    </div>
  );
}
