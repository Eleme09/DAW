"use client";

import { useRef } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import type { AutoPanEffect } from "@/audio-engine/effects/AutoPanEffect";
import { useRafLoop } from "@/hooks/useRafLoop";
import type { EffectTarget } from "@/state/projectStore";
import type { AutoPanParams } from "@/types/effects";
import { ParamSlider } from "./ParamSlider";

const HEIGHT = 100;

/** Same exact-LFO-phase pattern as Chorus/FlangerPanel (see their doc
 * comments) - AutoPanEffect.getLfoPhase(). No reference product named in
 * the brief for AutoPan. Curve is pan position (-1 L..+1 R) over one LFO
 * cycle, with a dot at the real current phase. */
export function AutoPanPanel({
  target,
  effectId,
  params,
  onChange,
}: {
  target: EffectTarget;
  effectId: string;
  params: AutoPanParams;
  onChange: (params: AutoPanParams) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useRafLoop(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const node = getAudioEngine().getEffectNode(target, effectId) as AutoPanEffect | undefined;
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
    const panToY = (pan: number) => h / 2 - pan * (h / 2 - 6);

    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "9px monospace";
    ctx.fillText("I", 2, 10);
    ctx.fillText("C", 2, h / 2 - 2);
    ctx.fillText("D", 2, h - 3);

    ctx.strokeStyle = "#f2ede4";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const steps = 120;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const pan = params.depth * Math.sin(2 * Math.PI * t);
      const x = t * w;
      const y = panToY(pan);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const curPan = params.depth * Math.sin(2 * Math.PI * phase);
    ctx.fillStyle = "#7ad692";
    ctx.beginPath();
    ctx.arc(phase * w, panToY(curPan), 4, 0, Math.PI * 2);
    ctx.fill();
  }, true);

  return (
    <div className="space-y-2">
      <canvas ref={canvasRef} className="block w-full rounded bg-ink" style={{ height: HEIGHT }} />
      <ParamSlider label="Velocidad" value={params.rateHz} min={0.05} max={8} step={0.05} unit=" Hz" decimals={2} onChange={(v) => onChange({ ...params, rateHz: v })} />
      <ParamSlider label="Profundidad" value={params.depth * 100} min={0} max={100} step={1} unit="%" decimals={0} onChange={(v) => onChange({ ...params, depth: v / 100 })} />
    </div>
  );
}
