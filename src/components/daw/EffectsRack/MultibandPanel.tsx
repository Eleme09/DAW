"use client";

import { useRef } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import type { MultibandCompressorEffect } from "@/audio-engine/effects/MultibandCompressorEffect";
import { compressorTransferDb } from "@/audio-engine/effects/curves";
import { useRafLoop } from "@/hooks/useRafLoop";
import type { EffectTarget } from "@/state/projectStore";
import type { MultibandBandParams, MultibandCompressorParams } from "@/types/effects";
import { ParamSlider } from "./ParamSlider";
import { GainReductionMeter } from "./GainReductionMeter";

const DB_MIN = -60;
const DB_MAX = 0;
const HEIGHT = 170;
const BAND_COLOR: Record<"low" | "mid" | "high", string> = { low: "#e08a4b", mid: "#f2ede4", high: "#7ad6d6" };
const BAND_LABEL: Record<"low" | "mid" | "high", string> = { low: "Graves", mid: "Medios", high: "Agudos" };
// MultibandBandParams has no kneeDb field (unlike CompressorParams) -
// MultibandCompressorEffect never sets `.knee` on its DynamicsCompressorNodes,
// so they run at the Web Audio spec's own default, 30 dB. Using that same
// number here keeps the drawn curve matching what the real nodes do.
const DEFAULT_KNEE_DB = 30;

function dbToFrac(db: number): number {
  return (Math.min(DB_MAX, Math.max(DB_MIN, db)) - DB_MIN) / (DB_MAX - DB_MIN);
}

/**
 * No reference product named in the brief for Multiband. Same transfer-
 * curve math as CompressorPanel (compressorTransferDb, exact from live
 * params - see its doc comment for why there's no "operating point" dot),
 * drawn three times at once (one line per band) rather than three
 * separate canvases, the same "overlay instead of tabs" idea ReverbPanel
 * used for its three space sizes. Three GainReductionMeters below read
 * MultibandCompressorEffect.getReductionDb() - real per-band native
 * telemetry, one DynamicsCompressorNode per band.
 */
export function MultibandPanel({
  target,
  effectId,
  params,
  onChange,
}: {
  target: EffectTarget;
  effectId: string;
  params: MultibandCompressorParams;
  onChange: (params: MultibandCompressorParams) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lowReductionRef = useRef(0);
  const midReductionRef = useRef(0);
  const highReductionRef = useRef(0);

  useRafLoop(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const node = getAudioEngine().getEffectNode(target, effectId) as MultibandCompressorEffect | undefined;
    const reduction = typeof node?.getReductionDb === "function" ? node.getReductionDb() : { low: 0, mid: 0, high: 0 };
    lowReductionRef.current = reduction.low;
    midReductionRef.current = reduction.mid;
    highReductionRef.current = reduction.high;

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

    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    const bands: { key: "low" | "mid" | "high"; band: MultibandBandParams }[] = [
      { key: "low", band: params.low },
      { key: "mid", band: params.mid },
      { key: "high", band: params.high },
    ];
    for (const { key, band } of bands) {
      ctx.strokeStyle = BAND_COLOR[key];
      ctx.lineWidth = 2;
      ctx.beginPath();
      const steps = 100;
      for (let i = 0; i <= steps; i++) {
        const inputDb = DB_MIN + (i / steps) * (DB_MAX - DB_MIN);
        const outputDb = compressorTransferDb(inputDb, band.thresholdDb, band.ratio, DEFAULT_KNEE_DB);
        const x = dbToFrac(inputDb) * w;
        const y = h - dbToFrac(outputDb) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.font = "9px monospace";
    let legendX = 4;
    for (const { key } of bands) {
      ctx.fillStyle = BAND_COLOR[key];
      ctx.fillText(BAND_LABEL[key], legendX, 10);
      legendX += ctx.measureText(BAND_LABEL[key]).width + 10;
    }
  }, true);

  const bandEditor = (key: "low" | "mid" | "high", band: MultibandBandParams, reductionRef: React.RefObject<number>) => (
    <div key={key} className="rounded border border-line p-1.5">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase text-bone-2">
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: BAND_COLOR[key] }} />
        {BAND_LABEL[key]}
      </div>
      <GainReductionMeter reductionRef={reductionRef} label="Red." />
      <ParamSlider label="Umbral" value={band.thresholdDb} min={-60} max={0} step={0.5} unit=" dB" onChange={(v) => onChange({ ...params, [key]: { ...band, thresholdDb: v } })} />
      <ParamSlider label="Ratio" value={band.ratio} min={1} max={20} step={0.5} unit=":1" onChange={(v) => onChange({ ...params, [key]: { ...band, ratio: v } })} />
      <ParamSlider label="Makeup" value={band.makeupDb} min={0} max={24} step={0.5} unit=" dB" onChange={(v) => onChange({ ...params, [key]: { ...band, makeupDb: v } })} />
    </div>
  );

  return (
    <div className="space-y-2">
      <canvas ref={canvasRef} className="block w-full rounded bg-ink" style={{ height: HEIGHT }} />
      <ParamSlider label="Grave/Medio" value={params.lowMidFreq} min={40} max={1000} step={10} unit=" Hz" decimals={0} onChange={(v) => onChange({ ...params, lowMidFreq: v })} />
      <ParamSlider label="Medio/Agudo" value={params.midHighFreq} min={500} max={10000} step={100} unit=" Hz" decimals={0} onChange={(v) => onChange({ ...params, midHighFreq: v })} />
      <ParamSlider label="Ataque" value={params.attackMs} min={0.1} max={100} step={0.1} unit=" ms" onChange={(v) => onChange({ ...params, attackMs: v })} />
      <ParamSlider label="Liberación" value={params.releaseMs} min={10} max={1000} step={5} unit=" ms" onChange={(v) => onChange({ ...params, releaseMs: v })} />
      {bandEditor("low", params.low, lowReductionRef)}
      {bandEditor("mid", params.mid, midReductionRef)}
      {bandEditor("high", params.high, highReductionRef)}
    </div>
  );
}
