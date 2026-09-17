"use client";

import { useRef } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import type { SaturationEffect } from "@/audio-engine/effects/SaturationEffect";
import { makeSaturationCurve } from "@/audio-engine/effects/curves";
import { useRafLoop } from "@/hooks/useRafLoop";
import type { EffectTarget } from "@/state/projectStore";
import type { SaturationParams } from "@/types/effects";
import { ParamSlider } from "./ParamSlider";

const CURVE_HEIGHT = 90;
const SPECTRUM_HEIGHT = 110;
const FREQ_MIN = 20;
const FREQ_MAX = 20000;
const SPECTRUM_POINTS = 64;

const TONE_LABEL: Record<SaturationParams["tone"], string> = { warm: "cálido", neutral: "neutro", bright: "brillante" };

function freqToX(freq: number): number {
  return Math.log10(freq / FREQ_MIN) / Math.log10(FREQ_MAX / FREQ_MIN);
}

/**
 * Soundtoys Decapitator-style pairing per the FASE 10F reference table:
 * "curva de distorsión + comparación de espectro antes/después". The
 * curve is drawn straight from `makeSaturationCurve(tone)` - the exact
 * samples the live WaveShaperNode uses, not a redrawn approximation. The
 * before/after spectra come from SaturationEffect's own inline analysers
 * (see its doc comment) so the comparison is genuinely this instance's
 * input vs. its output, not whatever the track/master bus looks like
 * after any effects that run after this one.
 */
export function SaturationPanel({
  target,
  effectId,
  params,
  onChange,
}: {
  target: EffectTarget;
  effectId: string;
  params: SaturationParams;
  onChange: (params: SaturationParams) => void;
}) {
  const curveCanvasRef = useRef<HTMLCanvasElement>(null);
  const spectrumCanvasRef = useRef<HTMLCanvasElement>(null);
  const inFreqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const outFreqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  useRafLoop(() => {
    const curveCanvas = curveCanvasRef.current;
    const curveCtx = curveCanvas?.getContext("2d");
    const specCanvas = spectrumCanvasRef.current;
    const specCtx = specCanvas?.getContext("2d");
    if (!curveCanvas || !curveCtx || !specCanvas || !specCtx) return;

    const engine = getAudioEngine();
    const node = engine.getEffectNode(target, effectId) as SaturationEffect | undefined;
    const inputAnalyser = typeof node?.getInputAnalyser === "function" ? node.getInputAnalyser() : null;
    const outputAnalyser = typeof node?.getOutputAnalyser === "function" ? node.getOutputAnalyser() : null;

    // --- Transfer curve, exact samples from the live shaper curve. ---
    const dpr = window.devicePixelRatio || 1;
    const cw = curveCanvas.clientWidth || 300;
    const ch = curveCanvas.clientHeight || CURVE_HEIGHT;
    if (curveCanvas.width !== Math.round(cw * dpr) || curveCanvas.height !== Math.round(ch * dpr)) {
      curveCanvas.width = Math.round(cw * dpr);
      curveCanvas.height = Math.round(ch * dpr);
    }
    curveCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    curveCtx.clearRect(0, 0, cw, ch);
    curveCtx.strokeStyle = "rgba(255,255,255,0.15)";
    curveCtx.setLineDash([3, 3]);
    curveCtx.beginPath();
    curveCtx.moveTo(0, ch);
    curveCtx.lineTo(cw, 0);
    curveCtx.stroke();
    curveCtx.setLineDash([]);
    const curve = makeSaturationCurve(params.tone);
    curveCtx.strokeStyle = "#f2ede4";
    curveCtx.lineWidth = 2;
    curveCtx.beginPath();
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * cw;
      const y = ch - ((curve[i] + 1) / 2) * ch;
      if (i === 0) curveCtx.moveTo(x, y);
      else curveCtx.lineTo(x, y);
    }
    curveCtx.stroke();

    // --- Before/after spectrum comparison. ---
    const sw = specCanvas.clientWidth || 300;
    const sh = specCanvas.clientHeight || SPECTRUM_HEIGHT;
    if (specCanvas.width !== Math.round(sw * dpr) || specCanvas.height !== Math.round(sh * dpr)) {
      specCanvas.width = Math.round(sw * dpr);
      specCanvas.height = Math.round(sh * dpr);
    }
    specCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    specCtx.clearRect(0, 0, sw, sh);
    specCtx.strokeStyle = "rgba(255,255,255,0.08)";
    specCtx.fillStyle = "rgba(255,255,255,0.35)";
    specCtx.font = "9px monospace";
    for (const f of [100, 1000, 10000]) {
      const x = freqToX(f) * sw;
      specCtx.beginPath();
      specCtx.moveTo(x, 0);
      specCtx.lineTo(x, sh);
      specCtx.stroke();
      specCtx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x + 2, sh - 2);
    }

    const nyquist = (engine.getContext()?.sampleRate ?? 44100) / 2;
    const drawSpectrumLine = (analyser: AnalyserNode | null, ref: React.RefObject<Uint8Array<ArrayBuffer> | null>, color: string) => {
      if (!analyser) return;
      if (!ref.current || ref.current.length !== analyser.frequencyBinCount) {
        ref.current = new Uint8Array(analyser.frequencyBinCount);
      }
      analyser.getByteFrequencyData(ref.current);
      const data = ref.current;
      specCtx.strokeStyle = color;
      specCtx.lineWidth = 1.5;
      specCtx.beginPath();
      for (let p = 0; p <= SPECTRUM_POINTS; p++) {
        const freq = FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, p / SPECTRUM_POINTS);
        const bin = Math.min(data.length - 1, Math.floor((freq / nyquist) * data.length));
        const x = (p / SPECTRUM_POINTS) * sw;
        const y = sh - (data[bin] / 255) * sh;
        if (p === 0) specCtx.moveTo(x, y);
        else specCtx.lineTo(x, y);
      }
      specCtx.stroke();
    };
    drawSpectrumLine(inputAnalyser, inFreqRef, "rgba(242,237,228,0.4)");
    drawSpectrumLine(outputAnalyser, outFreqRef, "#e08a4b");

    specCtx.textAlign = "right";
    specCtx.fillStyle = "#e08a4b";
    specCtx.fillText("después", sw - 2, 10);
    specCtx.fillStyle = "rgba(242,237,228,0.7)";
    specCtx.fillText("antes", sw - 48, 10);
    specCtx.textAlign = "left";
  }, true);

  return (
    <div className="space-y-2">
      <canvas ref={curveCanvasRef} className="block w-full rounded bg-ink" style={{ height: CURVE_HEIGHT }} />
      <canvas ref={spectrumCanvasRef} className="block w-full rounded bg-ink" style={{ height: SPECTRUM_HEIGHT }} />
      <div className="flex w-full gap-1 text-[11px]">
        {(["warm", "neutral", "bright"] as const).map((tone) => (
          <button
            key={tone}
            onClick={() => onChange({ ...params, tone })}
            className={`min-h-11 flex-1 rounded px-1 uppercase ${
              params.tone === tone ? "bg-bone text-ink" : "bg-surf-2 text-bone-2"
            }`}
          >
            {TONE_LABEL[tone]}
          </button>
        ))}
      </div>
      <ParamSlider label="Drive" value={params.driveDb} min={0} max={24} step={0.5} unit=" dB" onChange={(v) => onChange({ ...params, driveDb: v })} />
      <ParamSlider label="Mezcla" value={params.mix * 100} min={0} max={100} step={1} unit="%" decimals={0} onChange={(v) => onChange({ ...params, mix: v / 100 })} />
    </div>
  );
}
