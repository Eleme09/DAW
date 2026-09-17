"use client";

import { useRef } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import type { DeEsserEffect } from "@/audio-engine/effects/DeEsserEffect";
import { useRafLoop } from "@/hooks/useRafLoop";
import type { EffectTarget } from "@/state/projectStore";
import type { DeEsserParams } from "@/types/effects";
import { ParamSlider } from "./ParamSlider";
import { GainReductionMeter } from "./GainReductionMeter";

const FREQ_MIN = 2000;
const FREQ_MAX = 16000;
const HEIGHT = 130;
const SPECTRUM_BARS = 32;

function freqToX(freq: number): number {
  return Math.log10(freq / FREQ_MIN) / Math.log10(FREQ_MAX / FREQ_MIN);
}

/**
 * FabFilter Pro-DS-style pairing per the FASE 10F reference table: "banda
 * de detección visible sobre el espectro". The spectrum comes from
 * DeEsserEffect's own inline `inputAnalyser` (see its doc comment) - the
 * real signal arriving at THIS instance, before the split/compression, so
 * the shaded "detection band" region genuinely lines up with what's
 * feeding the sibilance compressor right now (a post-chain track/master
 * analyser would already show the ducked result). The reduction meter is
 * the sibilance compressor's own native `.reduction`.
 */
export function DeEsserPanel({
  target,
  effectId,
  params,
  onChange,
}: {
  target: EffectTarget;
  effectId: string;
  params: DeEsserParams;
  onChange: (params: DeEsserParams) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const reductionRef = useRef(0);

  useRafLoop(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const engine = getAudioEngine();
    const node = engine.getEffectNode(target, effectId) as DeEsserEffect | undefined;
    reductionRef.current = typeof node?.getReductionDb === "function" ? node.getReductionDb() : 0;
    const analyser = typeof node?.getInputAnalyser === "function" ? node.getInputAnalyser() : null;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || HEIGHT;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Detection band shading - everything above the crossover freq, the
    // region the sibilance compressor actually acts on.
    const crossoverX = Math.min(1, Math.max(0, freqToX(params.freq))) * w;
    const reducingNow = reductionRef.current < -0.1;
    ctx.fillStyle = reducingNow ? "rgba(229,36,59,0.12)" : "rgba(242,237,228,0.06)";
    ctx.fillRect(crossoverX, 0, w - crossoverX, h);

    // Spectrum, real per-instance data from the inline analyser.
    const nyquist = (engine.getContext()?.sampleRate ?? 44100) / 2;
    if (analyser) {
      if (!freqDataRef.current || freqDataRef.current.length !== analyser.frequencyBinCount) {
        freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      }
      analyser.getByteFrequencyData(freqDataRef.current);
      const freqData = freqDataRef.current;
      for (let bar = 0; bar < SPECTRUM_BARS; bar++) {
        const f0 = FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, bar / SPECTRUM_BARS);
        const f1 = FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, (bar + 1) / SPECTRUM_BARS);
        const bin0 = Math.floor((f0 / nyquist) * freqData.length);
        const bin1 = Math.max(bin0 + 1, Math.floor((f1 / nyquist) * freqData.length));
        let sum = 0;
        let count = 0;
        for (let i = bin0; i < bin1 && i < freqData.length; i++) {
          sum += freqData[i];
          count++;
        }
        const avg = count > 0 ? sum / count : 0;
        const barH = (avg / 255) * h;
        const x0 = (bar / SPECTRUM_BARS) * w;
        const x1 = ((bar + 1) / SPECTRUM_BARS) * w;
        ctx.fillStyle = x0 >= crossoverX ? "#e5243b" : "rgba(242,237,228,0.5)";
        ctx.fillRect(x0, h - barH, Math.max(1, x1 - x0 - 1), barH);
      }
    }

    // Crossover line + label.
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.beginPath();
    ctx.moveTo(crossoverX, 0);
    ctx.lineTo(crossoverX, h);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "9px monospace";
    const freqLabel = params.freq >= 1000 ? `${(params.freq / 1000).toFixed(1)}k` : `${params.freq.toFixed(0)}`;
    ctx.fillText(`${freqLabel} Hz`, crossoverX + 3, 10);
  }, true);

  return (
    <div className="space-y-2">
      <canvas ref={canvasRef} className="block w-full rounded bg-ink" style={{ height: HEIGHT }} />
      <GainReductionMeter reductionRef={reductionRef} />
      <ParamSlider label="Frec" value={params.freq} min={FREQ_MIN} max={FREQ_MAX} step={100} unit=" Hz" decimals={0} onChange={(v) => onChange({ ...params, freq: v })} />
      <ParamSlider label="Umbral" value={params.thresholdDb} min={-60} max={0} step={0.5} unit=" dB" onChange={(v) => onChange({ ...params, thresholdDb: v })} />
      <ParamSlider label="Ratio" value={params.ratio} min={1} max={20} step={0.5} unit=":1" onChange={(v) => onChange({ ...params, ratio: v })} />
    </div>
  );
}
