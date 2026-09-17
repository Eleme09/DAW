"use client";

import { useRef, useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import type { NoiseGateEffect } from "@/audio-engine/effects/NoiseGateEffect";
import { computePeakDb } from "@/audio-engine/loudness";
import { useRafLoop } from "@/hooks/useRafLoop";
import type { EffectTarget } from "@/state/projectStore";
import type { NoiseGateParams } from "@/types/effects";
import { ParamSlider } from "./ParamSlider";

const HEIGHT = 130;
const OPEN_THRESHOLD = 0.5; // envelope above this reads as "open" for the badge
const DB_MIN = -80;
const DB_MAX = 0;
const HISTORY_LEN = 150; // ~2.5s of level history at the RAF-loop's paint rate

function dbToFrac(db: number): number {
  const clamped = Math.min(DB_MAX, Math.max(DB_MIN, Number.isFinite(db) ? db : DB_MIN));
  return (clamped - DB_MIN) / (DB_MAX - DB_MIN);
}

/**
 * FabFilter Pro-G-style pairing per the FASE 10F reference table: "umbral
 * dibujado sobre la señal entrante, indicador de apertura". The waveform is
 * NOT the track's post-chain analyser (that would show near-silence
 * whenever the gate is closed, hiding exactly the signal the threshold
 * line needs to be compared against) - NoiseGateEffect now exposes its own
 * `inputAnalyser`, wired in series right before the worklet, so this reads
 * the real signal arriving at THIS gate instance. The open/closed badge
 * comes from the worklet's own envelope follower, posted over its message
 * port (~20 Hz) - a real applied-gain readout, not a threshold comparison
 * reconstructed on the main thread (which could disagree with the actual
 * attack/release/hold behavior running in the worklet).
 *
 * The level is drawn on a dB y-axis (scrolling peak-dB history) rather
 * than a raw linear waveform: gate thresholds live in the -80..0 dB range,
 * and on a linear -1..1 amplitude axis a signal sitting near a typical
 * -45 dB threshold is a couple of pixels from the centerline - visually
 * indistinguishable from silence. dB scaling is the same convention
 * already used in CompressorPanel/LimiterPanel's canvases.
 */
export function NoiseGatePanel({
  target,
  effectId,
  params,
  onChange,
}: {
  target: EffectTarget;
  effectId: string;
  params: NoiseGateParams;
  onChange: (params: NoiseGateParams) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const historyRef = useRef<number[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [envelope, setEnvelope] = useState(0);

  useRafLoop(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const node = getAudioEngine().getEffectNode(target, effectId) as NoiseGateEffect | undefined;
    const env = typeof node?.getEnvelope === "function" ? node.getEnvelope() : 0;
    setEnvelope(env);
    setIsOpen(env >= OPEN_THRESHOLD);

    const analyser = typeof node?.getInputAnalyser === "function" ? node.getInputAnalyser() : null;
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
    for (const db of [-60, -40, -20, 0]) {
      const y = h - dbToFrac(db) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.fillText(`${db}`, 2, y - 2);
    }

    // Scrolling level history, real per-instance data from the inline analyser.
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

    // Threshold line - the gate opens when the level crosses this.
    const ty = h - dbToFrac(params.thresholdDb) * h;
    ctx.strokeStyle = isOpen ? "rgba(122,214,146,0.7)" : "rgba(229,36,59,0.7)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, ty);
    ctx.lineTo(w, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = isOpen ? "#7ad692" : "#e5243b";
    ctx.fillText(`umbral ${params.thresholdDb.toFixed(0)} dB`, w * 0.5, ty - 3);
  }, true);

  return (
    <div className="space-y-2">
      <canvas ref={canvasRef} className="block w-full rounded bg-ink" style={{ height: HEIGHT }} />
      <div className="flex items-center gap-2">
        <span className="w-24 shrink-0 text-[10px] uppercase tracking-wide text-bone-3">Puerta</span>
        <span
          className={`rounded px-2 py-0.5 font-mono text-[11px] uppercase ${
            isOpen ? "bg-[#7ad692] text-ink" : "bg-surf-2 text-bone-3"
          }`}
        >
          {isOpen ? "Abierta" : "Cerrada"}
        </span>
        <span className="font-mono text-[10px] text-bone-3">{(envelope * 100).toFixed(0)}%</span>
      </div>
      <ParamSlider label="Umbral" value={params.thresholdDb} min={-80} max={0} step={1} unit=" dB" decimals={0} onChange={(v) => onChange({ ...params, thresholdDb: v })} />
      <ParamSlider label="Ataque" value={params.attackMs} min={0.1} max={50} step={0.1} unit=" ms" onChange={(v) => onChange({ ...params, attackMs: v })} />
      <ParamSlider label="Liberación" value={params.releaseMs} min={10} max={1000} step={5} unit=" ms" onChange={(v) => onChange({ ...params, releaseMs: v })} />
      <ParamSlider label="Retención" value={params.holdMs} min={0} max={500} step={5} unit=" ms" onChange={(v) => onChange({ ...params, holdMs: v })} />
    </div>
  );
}
