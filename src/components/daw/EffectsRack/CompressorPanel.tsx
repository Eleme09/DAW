"use client";

import { useRef } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import type { CompressorEffect } from "@/audio-engine/effects/CompressorEffect";
import { compressorTransferDb } from "@/audio-engine/effects/curves";
import { useRafLoop } from "@/hooks/useRafLoop";
import type { EffectTarget } from "@/state/projectStore";
import type { CompressorParams } from "@/types/effects";
import { ParamSlider } from "./ParamSlider";

const DB_MIN = -60;
const DB_MAX = 0;
const WIDTH = 300;
const HEIGHT = 170;
const REDUCTION_MAX_DB = 24;

function dbToFrac(db: number): number {
  return (Math.min(DB_MAX, Math.max(DB_MIN, db)) - DB_MIN) / (DB_MAX - DB_MIN);
}

/**
 * FabFilter Pro-C-style pairing per the FASE 10F reference table: a
 * transfer curve (drawn straight from thresholdDb/ratio/kneeDb - exact,
 * no signal needed) plus a live gain-reduction meter (real telemetry from
 * the native DynamicsCompressorNode's own `.reduction`, via
 * CompressorEffect.getReductionDb()). Deliberately does NOT show a moving
 * "operating point" dot on the curve - that would need an accurate
 * per-node input-level reading this effect doesn't have access to (only
 * the track's post-chain analyser), and a guessed x-position would be
 * exactly the kind of invented precision this project avoids.
 */
export function CompressorPanel({
  target,
  effectId,
  params,
  onChange,
}: {
  target: EffectTarget;
  effectId: string;
  params: CompressorParams;
  onChange: (params: CompressorParams) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reductionRef = useRef(0);

  useRafLoop(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const node = getAudioEngine().getEffectNode(target, effectId) as CompressorEffect | undefined;
    reductionRef.current = typeof node?.getReductionDb === "function" ? node.getReductionDb() : 0;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || WIDTH;
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
      const x = dbToFrac(db) * w;
      const y = h - dbToFrac(db) * h;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.fillText(`${db}`, x + 2, h - 2);
    }

    // 1:1 reference (unity, no compression).
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    // Real transfer curve from the live params.
    ctx.strokeStyle = "#f2ede4";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const steps = 120;
    for (let i = 0; i <= steps; i++) {
      const inputDb = DB_MIN + (i / steps) * (DB_MAX - DB_MIN);
      const outputDb = compressorTransferDb(inputDb, params.thresholdDb, params.ratio, params.kneeDb);
      const x = dbToFrac(inputDb) * w;
      const y = h - dbToFrac(outputDb) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Threshold marker.
    const tx = dbToFrac(params.thresholdDb) * w;
    ctx.strokeStyle = "rgba(242,237,228,0.35)";
    ctx.beginPath();
    ctx.moveTo(tx, 0);
    ctx.lineTo(tx, h);
    ctx.stroke();
  }, true);

  return (
    <div className="space-y-2">
      <canvas ref={canvasRef} className="block w-full rounded bg-ink" style={{ height: HEIGHT }} />
      <GainReductionMeter reductionRef={reductionRef} />
      <ParamSlider label="Umbral" value={params.thresholdDb} min={-60} max={0} step={0.5} unit=" dB" onChange={(v) => onChange({ ...params, thresholdDb: v })} />
      <ParamSlider label="Ratio" value={params.ratio} min={1} max={20} step={0.5} unit=":1" onChange={(v) => onChange({ ...params, ratio: v })} />
      <ParamSlider label="Ataque" value={params.attackMs} min={0.1} max={100} step={0.1} unit=" ms" onChange={(v) => onChange({ ...params, attackMs: v })} />
      <ParamSlider label="Liberación" value={params.releaseMs} min={10} max={1000} step={5} unit=" ms" onChange={(v) => onChange({ ...params, releaseMs: v })} />
      <ParamSlider label="Knee" value={params.kneeDb} min={0} max={24} step={0.5} unit=" dB" onChange={(v) => onChange({ ...params, kneeDb: v })} />
      <ParamSlider label="Compensación" value={params.makeupDb} min={0} max={24} step={0.5} unit=" dB" onChange={(v) => onChange({ ...params, makeupDb: v })} />
    </div>
  );
}

/** Horizontal bar, real telemetry (compressor.reduction), grows from the
 * right as more gain gets cut - matches the reference's "medidor de
 * reducción de ganancia" requirement for this effect family. */
function GainReductionMeter({ reductionRef }: { reductionRef: React.RefObject<number> }) {
  const barRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useRafLoop(() => {
    const db = -reductionRef.current; // reduction is <= 0; show as a positive "dB cut" amount
    const frac = Math.min(1, Math.max(0, db / REDUCTION_MAX_DB));
    if (barRef.current) barRef.current.style.width = `${frac * 100}%`;
    if (labelRef.current) labelRef.current.textContent = `-${db.toFixed(1)} dB`;
  }, true);

  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-[10px] uppercase tracking-wide text-bone-3">Reducción</span>
      <div className="h-2 flex-1 overflow-hidden rounded-sm bg-surf-2">
        <div ref={barRef} className="h-full bg-s2" style={{ width: "0%" }} />
      </div>
      <span ref={labelRef} className="w-14 shrink-0 text-right font-mono text-[10px] text-bone-2">
        -0.0 dB
      </span>
    </div>
  );
}
