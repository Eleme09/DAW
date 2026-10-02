"use client";

import { useEffect, useRef } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import type { DelayEffect } from "@/audio-engine/effects/DelayEffect";
import { divisionToMs, msToClosestDivision, TEMPO_DIVISIONS } from "@/audio-engine/effects/tempoGrid";
import { computePeakDb } from "@/audio-engine/loudness";
import { useRafLoop } from "@/hooks/useRafLoop";
import { useProjectStore } from "@/state/projectStore";
import type { EffectTarget } from "@/state/projectStore";
import type { DelayParams } from "@/types/effects";
import { ParamSlider } from "./ParamSlider";

const HEIGHT = 170;
const TIME_WINDOW_MS = 2500; // canvas shows echoes out to this point
const MAX_TAPS = 10;
const AMP_MIN_DB = -36;

/**
 * Soundtoys EchoBoy-style pairing per the FASE 10F reference table: "ecos
 * sobre rejilla de tempo, divisiones musicales, realimentación visual".
 * The echo taps are exact math from the live params - tap N lands at
 * `timeMs * N` with amplitude `feedback^(N-1)` (the ideal decay a feedback
 * delay line produces; the real lowpass in the feedback loop shapes each
 * repeat's spectrum too, which this doesn't attempt to simulate - it's a
 * peak-envelope diagram, not a signal capture, same honesty tradeoff as
 * ReverbPanel's decay curve). The tempo grid comes from the project's
 * real BPM (useProjectStore), not a guessed/fixed tempo. Tapping a grid
 * line snaps `timeMs` to that musical division. The small live level bar
 * is real telemetry from DelayEffect's own wetAnalyser, proving the
 * echoes are actually audible right now.
 */
export function DelayPanel({
  target,
  effectId,
  params,
  onChange,
}: {
  target: EffectTarget;
  effectId: string;
  params: DelayParams;
  onChange: (params: DelayParams) => void;
}) {
  const bpm = useProjectStore((s) => s.project.bpm);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wetDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  // Already had real X-axis interactivity (tap-to-snap timeMs to a tempo
  // division) - extended here to a full XY pad: X still sets time the same
  // way, Y now sets feedback directly (top of the canvas = near-max
  // feedback, bottom = none), matching the same "more height = more
  // repeats" reading the echo-tap bars already draw with. filterFreq/mix
  // don't have an honest position on this chart (it's a time/amplitude
  // diagram, neither axis is frequency or dry/wet) - they stay knob-only.
  const onChangeRef = useRef(onChange);
  const paramsRef = useRef(params);
  const bpmRef = useRef(bpm);
  useEffect(() => {
    onChangeRef.current = onChange;
    paramsRef.current = params;
    bpmRef.current = bpm;
  }, [onChange, params, bpm]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draggingRef = { current: false };

    function applyFromPoint(clientX: number, clientY: number) {
      const rect = canvas!.getBoundingClientRect();
      const ms = ((clientX - rect.left) / rect.width) * TIME_WINDOW_MS;
      const { ms: snappedMs } = msToClosestDivision(ms, bpmRef.current);
      const feedback = Math.min(0.95, Math.max(0, (rect.height - (clientY - rect.top)) / rect.height));
      onChangeRef.current({ ...paramsRef.current, timeMs: Math.round(snappedMs), feedback });
    }

    function onPointerDown(e: PointerEvent) {
      draggingRef.current = true;
      canvas!.setPointerCapture(e.pointerId);
      applyFromPoint(e.clientX, e.clientY);
    }
    function onPointerMove(e: PointerEvent) {
      if (!draggingRef.current) return;
      applyFromPoint(e.clientX, e.clientY);
    }
    function endDrag() {
      draggingRef.current = false;
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endDrag);
      canvas.removeEventListener("pointercancel", endDrag);
    };
  }, []);

  useRafLoop(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const node = getAudioEngine().getEffectNode(target, effectId) as DelayEffect | undefined;
    const wetAnalyser = typeof node?.getWetAnalyser === "function" ? node.getWetAnalyser() : null;
    let wetPeakDb = -Infinity;
    if (wetAnalyser) {
      if (!wetDataRef.current || wetDataRef.current.length !== wetAnalyser.fftSize) {
        wetDataRef.current = new Float32Array(wetAnalyser.fftSize);
      }
      wetAnalyser.getFloatTimeDomainData(wetDataRef.current);
      wetPeakDb = computePeakDb(wetDataRef.current);
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
    const msToX = (ms: number) => (ms / TIME_WINDOW_MS) * w;

    // Tempo grid, real project BPM.
    ctx.font = "8px monospace";
    for (const division of TEMPO_DIVISIONS) {
      const ms = divisionToMs(division.beats, bpm);
      if (ms > TIME_WINDOW_MS) continue;
      const x = msToX(ms);
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillText(division.label, x + 1, h - 2);
    }

    // Echo taps: exact geometric decay from timeMs/feedback.
    for (let n = 1; n <= MAX_TAPS; n++) {
      const tapMs = params.timeMs * n;
      if (tapMs > TIME_WINDOW_MS) break;
      const amp = Math.pow(params.feedback, n - 1);
      const ampDb = 20 * Math.log10(Math.max(1e-6, amp));
      const frac = Math.max(0, Math.min(1, (ampDb - AMP_MIN_DB) / -AMP_MIN_DB));
      const barH = frac * h;
      const x = msToX(tapMs);
      ctx.fillStyle = n === 1 ? "#f2ede4" : "rgba(242,237,228,0.5)";
      ctx.fillRect(x - 1.5, h - barH, 3, barH);
    }

    // Live wet-path level, real telemetry.
    if (Number.isFinite(wetPeakDb)) {
      const frac = Math.max(0, Math.min(1, (wetPeakDb - AMP_MIN_DB) / -AMP_MIN_DB));
      ctx.fillStyle = "rgba(122,214,146,0.5)";
      ctx.fillRect(w - 6, h - frac * h, 4, frac * h);
    }
  }, true);

  const closest = msToClosestDivision(params.timeMs, bpm);

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="block w-full cursor-crosshair rounded bg-ink"
        style={{ height: HEIGHT, touchAction: "none" }}
        title="Arrastra: horizontal fija el tiempo a la rejilla, vertical fija el feedback"
      />
      <p className="text-[9px] text-bone-3">Arrastra: horizontal ajusta el tiempo a una división musical ({bpm} BPM), vertical ajusta el feedback. Más cercana ahora: {closest.division.label}.</p>
      <ParamSlider label="Tiempo" value={params.timeMs} min={10} max={2000} step={10} unit=" ms" decimals={0} onChange={(v) => onChange({ ...params, timeMs: v })} />
      <ParamSlider label="Feedback" value={params.feedback * 100} min={0} max={95} step={1} unit="%" decimals={0} onChange={(v) => onChange({ ...params, feedback: v / 100 })} />
      <ParamSlider label="Tono" value={params.filterFreq} min={500} max={12000} step={100} unit=" Hz" decimals={0} onChange={(v) => onChange({ ...params, filterFreq: v })} />
      <ParamSlider label="Mezcla" value={params.mix * 100} min={0} max={100} step={1} unit="%" decimals={0} onChange={(v) => onChange({ ...params, mix: v / 100 })} />
    </div>
  );
}
