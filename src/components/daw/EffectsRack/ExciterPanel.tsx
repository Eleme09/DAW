"use client";

import { useRef } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import type { ExciterEffect } from "@/audio-engine/effects/ExciterEffect";
import { useRafLoop } from "@/hooks/useRafLoop";
import type { EffectTarget } from "@/state/projectStore";
import type { ExciterParams } from "@/types/effects";
import { ParamSlider } from "./ParamSlider";

const HEIGHT = 130;
const FREQ_MIN = 1000;
const FREQ_MAX = 18000;
const SPECTRUM_POINTS = 64;

function freqToX(freq: number): number {
  return Math.log10(freq / FREQ_MIN) / Math.log10(FREQ_MAX / FREQ_MIN);
}

/**
 * No reference product named in the brief for Exciter. Combines the two
 * patterns already established this phase: De-esser's shaded "band above
 * the crossover" (the highpassed band this effect actually drives) and
 * Saturation's before/after spectrum overlay (real per-instance input vs.
 * output, from ExciterEffect's own inline analysers - see its doc
 * comment). The shaded band plus the "después" line rising above "antes"
 * within it is the harmonic "air" this effect adds, made visible.
 */
export function ExciterPanel({
  target,
  effectId,
  params,
  onChange,
}: {
  target: EffectTarget;
  effectId: string;
  params: ExciterParams;
  onChange: (params: ExciterParams) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inFreqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const outFreqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  useRafLoop(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const engine = getAudioEngine();
    const node = engine.getEffectNode(target, effectId) as ExciterEffect | undefined;
    const inputAnalyser = typeof node?.getInputAnalyser === "function" ? node.getInputAnalyser() : null;
    const outputAnalyser = typeof node?.getOutputAnalyser === "function" ? node.getOutputAnalyser() : null;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || HEIGHT;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const crossoverX = Math.min(1, Math.max(0, freqToX(params.freq))) * w;
    ctx.fillStyle = "rgba(224,138,75,0.1)";
    ctx.fillRect(crossoverX, 0, w - crossoverX, h);

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "9px monospace";
    for (const f of [2000, 5000, 10000, 15000]) {
      const x = freqToX(f) * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x + 2, h - 2);
    }

    const nyquist = (engine.getContext()?.sampleRate ?? 44100) / 2;
    const drawSpectrumLine = (analyser: AnalyserNode | null, ref: React.RefObject<Uint8Array<ArrayBuffer> | null>, color: string) => {
      if (!analyser) return;
      if (!ref.current || ref.current.length !== analyser.frequencyBinCount) {
        ref.current = new Uint8Array(analyser.frequencyBinCount);
      }
      analyser.getByteFrequencyData(ref.current);
      const data = ref.current;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let p = 0; p <= SPECTRUM_POINTS; p++) {
        const freq = FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, p / SPECTRUM_POINTS);
        const bin = Math.min(data.length - 1, Math.floor((freq / nyquist) * data.length));
        const x = (p / SPECTRUM_POINTS) * w;
        const y = h - (data[bin] / 255) * h;
        if (p === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    drawSpectrumLine(inputAnalyser, inFreqRef, "rgba(242,237,228,0.4)");
    drawSpectrumLine(outputAnalyser, outFreqRef, "#e08a4b");

    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.beginPath();
    ctx.moveTo(crossoverX, 0);
    ctx.lineTo(crossoverX, h);
    ctx.stroke();

    ctx.textAlign = "right";
    ctx.fillStyle = "#e08a4b";
    ctx.fillText("después", w - 2, 10);
    ctx.fillStyle = "rgba(242,237,228,0.7)";
    ctx.fillText("antes", w - 48, 10);
    ctx.textAlign = "left";
  }, true);

  return (
    <div className="space-y-2">
      <canvas ref={canvasRef} className="block w-full rounded bg-ink" style={{ height: HEIGHT }} />
      <ParamSlider label="Frec" value={params.freq} min={FREQ_MIN} max={FREQ_MAX} step={100} unit=" Hz" decimals={0} onChange={(v) => onChange({ ...params, freq: v })} />
      <ParamSlider label="Drive" value={params.driveDb} min={0} max={24} step={0.5} unit=" dB" onChange={(v) => onChange({ ...params, driveDb: v })} />
      <ParamSlider label="Mezcla" value={params.mix * 100} min={0} max={100} step={1} unit="%" decimals={0} onChange={(v) => onChange({ ...params, mix: v / 100 })} />
    </div>
  );
}
