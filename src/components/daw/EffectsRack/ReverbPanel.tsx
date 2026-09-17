"use client";

import { useRef } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import type { ReverbEffect } from "@/audio-engine/effects/ReverbEffect";
import { reverbDecayEnvelopeDb } from "@/audio-engine/effects/impulseResponse";
import { computePeakDb } from "@/audio-engine/loudness";
import { useRafLoop } from "@/hooks/useRafLoop";
import type { EffectTarget } from "@/state/projectStore";
import type { ReverbParams } from "@/types/effects";
import { ParamSlider } from "./ParamSlider";

const HEIGHT = 130;
const DB_MIN = -60;
const DB_MAX = 0;
const CURVE_STEPS = 100;
const SIZE_LABEL: Record<ReverbParams["sizeType"], string> = { room: "sala", hall: "auditorio", plate: "placa" };
const SIZE_ORDER: ReverbParams["sizeType"][] = ["room", "hall", "plate"];

function dbToFrac(db: number): number {
  const clamped = Math.min(DB_MAX, Math.max(DB_MIN, Number.isFinite(db) ? db : DB_MIN));
  return (clamped - DB_MIN) / (DB_MAX - DB_MIN);
}

/**
 * Valhalla Room/Pro-R-style pairing per the FASE 10F reference table:
 * "cola de decaimiento dibujada, tamaño de espacio como gráfico". The
 * curve is the exact `(1-t)^exponent` envelope `generateImpulseResponseSamples`
 * multiplies its noise by (see reverbDecayEnvelopeDb's doc comment) - the
 * literal formula behind the impulse response actually loaded into the
 * convolver, not a redrawn approximation. All three space sizes are drawn
 * at once (two dim, the selected one bright) so picking a size is a
 * visual comparison of decay shape, not just a button label - that's the
 * "tamaño de espacio como gráfico" part. The live level bar comes from
 * ReverbEffect's own wetAnalyser, so it's real proof the tail is actually
 * decaying after a transient, not just the static theoretical shape.
 */
export function ReverbPanel({
  target,
  effectId,
  params,
  onChange,
}: {
  target: EffectTarget;
  effectId: string;
  params: ReverbParams;
  onChange: (params: ReverbParams) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wetDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  useRafLoop(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const node = getAudioEngine().getEffectNode(target, effectId) as ReverbEffect | undefined;
    const wetAnalyser = typeof node?.getWetAnalyser === "function" ? node.getWetAnalyser() : null;
    let wetPeakDb = -Infinity;
    if (wetAnalyser) {
      if (!wetDataRef.current || wetDataRef.current.length !== wetAnalyser.fftSize) {
        wetDataRef.current = new Float32Array(wetAnalyser.fftSize);
      }
      wetAnalyser.getFloatTimeDomainData(wetDataRef.current);
      wetPeakDb = computePeakDb(wetDataRef.current);
    }

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || HEIGHT;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Grid.
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "9px monospace";
    for (const db of [-48, -36, -24, -12, 0]) {
      const y = h - dbToFrac(db) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.fillText(`${db}`, 2, y - 2);
    }
    ctx.fillText(`${params.decaySec.toFixed(1)}s`, w - 26, h - 2);

    // All three space sizes, selected one bright.
    for (const sizeType of SIZE_ORDER) {
      const selected = sizeType === params.sizeType;
      ctx.strokeStyle = selected ? "#f2ede4" : "rgba(255,255,255,0.15)";
      ctx.lineWidth = selected ? 2 : 1;
      ctx.beginPath();
      for (let i = 0; i <= CURVE_STEPS; i++) {
        const t = i / CURVE_STEPS;
        const db = reverbDecayEnvelopeDb(t, sizeType);
        const x = t * w;
        const y = h - dbToFrac(db) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Live wet-path level, real telemetry proving the tail is actually decaying.
    if (Number.isFinite(wetPeakDb)) {
      const barH = dbToFrac(wetPeakDb) * h;
      ctx.fillStyle = "rgba(122,214,146,0.5)";
      ctx.fillRect(w - 8, h - barH, 6, barH);
    }
  }, true);

  return (
    <div className="space-y-2">
      <canvas ref={canvasRef} className="block w-full rounded bg-ink" style={{ height: HEIGHT }} />
      <div className="flex w-full gap-1 text-[11px]">
        {SIZE_ORDER.map((sizeType) => (
          <button
            key={sizeType}
            onClick={() => onChange({ ...params, sizeType })}
            className={`min-h-11 flex-1 rounded px-1 uppercase ${
              params.sizeType === sizeType ? "bg-bone text-ink" : "bg-surf-2 text-bone-2"
            }`}
          >
            {SIZE_LABEL[sizeType]}
          </button>
        ))}
      </div>
      <ParamSlider label="Caída" value={params.decaySec} min={0.2} max={6} step={0.1} unit=" s" onChange={(v) => onChange({ ...params, decaySec: v })} />
      <ParamSlider label="Mezcla" value={params.mix * 100} min={0} max={100} step={1} unit="%" decimals={0} onChange={(v) => onChange({ ...params, mix: v / 100 })} />
    </div>
  );
}
