"use client";

import { useRef, useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import type { ClipperEffect } from "@/audio-engine/effects/ClipperEffect";
import { computePeakDb } from "@/audio-engine/loudness";
import { useRafLoop } from "@/hooks/useRafLoop";
import type { EffectTarget } from "@/state/projectStore";
import type { ClipperParams } from "@/types/effects";
import { ParamSlider } from "./ParamSlider";

const HEIGHT = 130;
const DB_MIN = -30;
const DB_MAX = 0;
const HISTORY_LEN = 150;
const CLIPPING_MARGIN_DB = 0.15; // how close to the ceiling counts as "pinned"

function dbToFrac(db: number): number {
  const clamped = Math.min(DB_MAX, Math.max(DB_MIN, Number.isFinite(db) ? db : DB_MIN));
  return (clamped - DB_MIN) / (DB_MAX - DB_MIN);
}

/**
 * No entry in the FASE 10F reference table names a specific product for
 * the standalone Clipper (unlike Limiter/Compressor, which do) - it's a
 * hard brickwall with a single ceiling parameter, so this reuses the same
 * honest pattern established for Limiter/Reverb rather than inventing a
 * new one: a real scrolling peak-level history from ClipperEffect's own
 * output analyser (this instance's actual post-clip output, not a
 * post-chain tap - see the effect's doc comment) against the ceiling
 * line. When the level is pinned at the ceiling, that IS active clipping
 * (a hard clipper can't produce output above it), so the "recortando"
 * badge is a direct, honest read of the real level trace, not a guess.
 */
export function ClipperPanel({
  target,
  effectId,
  params,
  onChange,
}: {
  target: EffectTarget;
  effectId: string;
  params: ClipperParams;
  onChange: (params: ClipperParams) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const historyRef = useRef<number[]>([]);
  const [clipping, setClipping] = useState(false);

  useRafLoop(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const node = getAudioEngine().getEffectNode(target, effectId) as ClipperEffect | undefined;
    const analyser = typeof node?.getOutputAnalyser === "function" ? node.getOutputAnalyser() : null;
    let peakDb = -Infinity;
    if (analyser) {
      if (!timeDataRef.current || timeDataRef.current.length !== analyser.fftSize) {
        timeDataRef.current = new Float32Array(analyser.fftSize);
      }
      analyser.getFloatTimeDomainData(timeDataRef.current);
      peakDb = computePeakDb(timeDataRef.current);
    }
    historyRef.current.push(peakDb);
    if (historyRef.current.length > HISTORY_LEN) historyRef.current.shift();
    setClipping(peakDb >= params.ceilingDb - CLIPPING_MARGIN_DB);

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || HEIGHT;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "9px monospace";
    for (const db of [-24, -18, -12, -6, 0]) {
      const y = h - dbToFrac(db) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.fillText(`${db}`, 2, y - 2);
    }

    const hist = historyRef.current;
    if (hist.length > 1) {
      ctx.strokeStyle = "#f2ede4";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < hist.length; i++) {
        const x = (i / (HISTORY_LEN - 1)) * w;
        const y = h - dbToFrac(hist[i]) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    const ceilingY = h - dbToFrac(params.ceilingDb) * h;
    ctx.strokeStyle = clipping ? "#e5243b" : "rgba(229,36,59,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, ceilingY);
    ctx.lineTo(w, ceilingY);
    ctx.stroke();
    ctx.fillStyle = clipping ? "#e5243b" : "rgba(229,36,59,0.7)";
    ctx.fillText(`techo ${params.ceilingDb.toFixed(1)} dB`, w * 0.5, ceilingY - 3);
  }, true);

  return (
    <div className="space-y-2">
      <canvas ref={canvasRef} className="block w-full rounded bg-ink" style={{ height: HEIGHT }} />
      <div className="flex items-center gap-2">
        <span className="w-24 shrink-0 text-[10px] uppercase tracking-wide text-bone-3">Estado</span>
        <span
          className={`rounded px-2 py-0.5 font-mono text-[11px] uppercase ${
            clipping ? "bg-[#e5243b] text-bone" : "bg-surf-2 text-bone-3"
          }`}
        >
          {clipping ? "Recortando" : "Libre"}
        </span>
      </div>
      <ParamSlider label="Techo" value={params.ceilingDb} min={-6} max={0} step={0.1} unit=" dB" onChange={(v) => onChange({ ...params, ceilingDb: v })} />
    </div>
  );
}
