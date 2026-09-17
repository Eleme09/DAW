"use client";

import { useRef, useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import type { LimiterEffect } from "@/audio-engine/effects/LimiterEffect";
import { computeMeanSquare, computePeakDb, meanSquareToLufsApprox } from "@/audio-engine/loudness";
import { useRafLoop } from "@/hooks/useRafLoop";
import type { EffectTarget } from "@/state/projectStore";
import type { LimiterParams } from "@/types/effects";
import { ParamSlider } from "./ParamSlider";
import { GainReductionMeter } from "./GainReductionMeter";

const METER_MIN_DB = -30;
const METER_MAX_DB = 0;
const HEIGHT = 130;
const LOUDNESS_SMOOTHING = 0.95; // same constant as Analyzer.tsx, for a consistent "momentary-ish" reading

function dbToFrac(db: number): number {
  return (Math.min(METER_MAX_DB, Math.max(METER_MIN_DB, db)) - METER_MIN_DB) / (METER_MAX_DB - METER_MIN_DB);
}

/**
 * FabFilter Pro-L-style pairing per the FASE 10F reference table:
 * "Medidor de sonoridad (LUFS) y de reducción, techo visible". The peak
 * meter + ceiling line and the reduction meter are real regardless of
 * where this insert sits (peak from that target's own analyser, reduction
 * from the native node's `.reduction`). The LUFS (aprox.) readout only
 * appears when `target === "master"` - it comes from AudioEngine's single
 * master-bus loudness tap (see getLoudnessAnalyser()'s doc comment), so on
 * a per-track insert it would silently be showing the whole mix's
 * loudness instead of that track's, which would be a wrong number wearing
 * a real-looking label. Better to show nothing there than that.
 */
export function LimiterPanel({
  target,
  effectId,
  params,
  onChange,
}: {
  target: EffectTarget;
  effectId: string;
  params: LimiterParams;
  onChange: (params: LimiterParams) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reductionRef = useRef(0);
  const timeDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const loudnessTimeDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const smoothedMeanSquareRef = useRef(0);
  const [lufsApprox, setLufsApprox] = useState(-Infinity);

  useRafLoop(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const engine = getAudioEngine();

    const node = engine.getEffectNode(target, effectId) as LimiterEffect | undefined;
    reductionRef.current = typeof node?.getReductionDb === "function" ? node.getReductionDb() : 0;

    const levelAnalyser = target === "master" ? engine.getMasterAnalyser() : engine.getTrackAnalyser(target);
    let peakDb = -Infinity;
    if (levelAnalyser) {
      if (!timeDataRef.current || timeDataRef.current.length !== levelAnalyser.fftSize) {
        timeDataRef.current = new Float32Array(levelAnalyser.fftSize);
      }
      levelAnalyser.getFloatTimeDomainData(timeDataRef.current);
      peakDb = computePeakDb(timeDataRef.current);
    }

    if (target === "master") {
      const loudnessAnalyser = engine.getLoudnessAnalyser();
      if (loudnessAnalyser) {
        if (!loudnessTimeDataRef.current || loudnessTimeDataRef.current.length !== loudnessAnalyser.fftSize) {
          loudnessTimeDataRef.current = new Float32Array(loudnessAnalyser.fftSize);
        }
        loudnessAnalyser.getFloatTimeDomainData(loudnessTimeDataRef.current);
        const instantMeanSquare = computeMeanSquare(loudnessTimeDataRef.current);
        smoothedMeanSquareRef.current =
          LOUDNESS_SMOOTHING * smoothedMeanSquareRef.current + (1 - LOUDNESS_SMOOTHING) * instantMeanSquare;
        setLufsApprox(meanSquareToLufsApprox(smoothedMeanSquareRef.current));
      }
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
    for (const db of [-24, -18, -12, -6, 0]) {
      const y = h - dbToFrac(db) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.fillText(`${db}`, 2, y - 2);
    }

    // Peak level bar.
    if (Number.isFinite(peakDb)) {
      const barH = dbToFrac(peakDb) * h;
      ctx.fillStyle = peakDb > params.ceilingDb + 0.1 ? "#e5243b" : "#f2ede4";
      ctx.fillRect(w * 0.15, h - barH, w * 0.3, barH);
    }

    // Ceiling line - the brickwall the true peak should never cross.
    const ceilingY = h - dbToFrac(params.ceilingDb) * h;
    ctx.strokeStyle = "#e5243b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, ceilingY);
    ctx.lineTo(w, ceilingY);
    ctx.stroke();
    ctx.fillStyle = "#e5243b";
    ctx.font = "9px monospace";
    ctx.fillText(`techo ${params.ceilingDb.toFixed(1)} dB`, w * 0.5, ceilingY - 3);
  }, true);

  return (
    <div className="space-y-2">
      <canvas ref={canvasRef} className="block w-full rounded bg-ink" style={{ height: HEIGHT }} />
      <GainReductionMeter reductionRef={reductionRef} />
      {target === "master" && (
        <div className="flex items-center gap-2">
          <span className="w-24 shrink-0 text-[10px] uppercase tracking-wide text-bone-3">Sonoridad</span>
          <span className="font-mono text-[11px] text-bone">
            {Number.isFinite(lufsApprox) ? `${lufsApprox.toFixed(1)} LUFS (aprox.)` : "-∞"}
          </span>
        </div>
      )}
      <ParamSlider label="Umbral" value={params.thresholdDb} min={-30} max={0} step={0.5} unit=" dB" onChange={(v) => onChange({ ...params, thresholdDb: v })} />
      <ParamSlider label="Liberación" value={params.releaseMs} min={10} max={500} step={5} unit=" ms" onChange={(v) => onChange({ ...params, releaseMs: v })} />
      <ParamSlider label="Techo" value={params.ceilingDb} min={-3} max={0} step={0.1} unit=" dB" onChange={(v) => onChange({ ...params, ceilingDb: v })} />
    </div>
  );
}
