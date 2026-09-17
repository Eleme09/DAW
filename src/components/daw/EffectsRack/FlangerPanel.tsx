"use client";

import { useRef } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { FLANGER_BASE_DELAY_MS, type FlangerEffect } from "@/audio-engine/effects/FlangerEffect";
import { useRafLoop } from "@/hooks/useRafLoop";
import type { EffectTarget } from "@/state/projectStore";
import type { FlangerParams } from "@/types/effects";
import { ParamSlider } from "./ParamSlider";

const HEIGHT = 100;
const MAX_DEPTH_MS = 10;
const Y_MAX_MS = FLANGER_BASE_DELAY_MS + MAX_DEPTH_MS + 1;

/** Same pattern as ChorusPanel (see its doc comment) - exact LFO phase
 * from FlangerEffect.getLfoPhase(), no reference product named in the
 * brief for Flanger either. */
export function FlangerPanel({
  target,
  effectId,
  params,
  onChange,
}: {
  target: EffectTarget;
  effectId: string;
  params: FlangerParams;
  onChange: (params: FlangerParams) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useRafLoop(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const node = getAudioEngine().getEffectNode(target, effectId) as FlangerEffect | undefined;
    const phase = typeof node?.getLfoPhase === "function" ? node.getLfoPhase() : 0;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || HEIGHT;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const msToY = (ms: number) => h - (Math.max(0, ms) / Y_MAX_MS) * h;

    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.beginPath();
    ctx.moveTo(0, msToY(FLANGER_BASE_DELAY_MS));
    ctx.lineTo(w, msToY(FLANGER_BASE_DELAY_MS));
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "9px monospace";
    ctx.fillText(`${FLANGER_BASE_DELAY_MS.toFixed(1)} ms base`, 2, msToY(FLANGER_BASE_DELAY_MS) - 2);

    ctx.strokeStyle = "#f2ede4";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const steps = 120;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const ms = FLANGER_BASE_DELAY_MS + params.depthMs * Math.sin(2 * Math.PI * t);
      const x = t * w;
      const y = msToY(ms);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const curMs = FLANGER_BASE_DELAY_MS + params.depthMs * Math.sin(2 * Math.PI * phase);
    ctx.fillStyle = "#7ad692";
    ctx.beginPath();
    ctx.arc(phase * w, msToY(curMs), 4, 0, Math.PI * 2);
    ctx.fill();
  }, true);

  return (
    <div className="space-y-2">
      <canvas ref={canvasRef} className="block w-full rounded bg-ink" style={{ height: HEIGHT }} />
      <ParamSlider label="Velocidad" value={params.rateHz} min={0.05} max={5} step={0.05} unit=" Hz" decimals={2} onChange={(v) => onChange({ ...params, rateHz: v })} />
      <ParamSlider label="Profundidad" value={params.depthMs} min={0.2} max={MAX_DEPTH_MS} step={0.2} unit=" ms" onChange={(v) => onChange({ ...params, depthMs: v })} />
      <ParamSlider label="Feedback" value={params.feedback * 100} min={0} max={90} step={1} unit="%" decimals={0} onChange={(v) => onChange({ ...params, feedback: v / 100 })} />
      <ParamSlider label="Mezcla" value={params.mix * 100} min={0} max={100} step={1} unit="%" decimals={0} onChange={(v) => onChange({ ...params, mix: v / 100 })} />
    </div>
  );
}
