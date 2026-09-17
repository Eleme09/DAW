"use client";

import { useCallback } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { CurveEditor, type CurvePoint } from "../ui/CurveEditor";
import { ParamSlider } from "./ParamSlider";

const WIDTH = 300;
const HEIGHT = 110;
const FREQ_MIN = 20;
const FREQ_MAX = 20000;
const GAIN_MIN = -24;
const GAIN_MAX = 12;
const RESPONSE_STEPS = 100;

function freqToX(freq: number): number {
  return Math.log10(freq / FREQ_MIN) / Math.log10(FREQ_MAX / FREQ_MIN);
}
function xToFreq(x: number): number {
  return FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, Math.min(1, Math.max(0, x)));
}
function gainToY(db: number): number {
  return (Math.min(GAIN_MAX, Math.max(GAIN_MIN, db)) - GAIN_MIN) / (GAIN_MAX - GAIN_MIN);
}

interface FilterCurveEditorProps {
  cutoff: number;
  resonance: number;
  onChange: (patch: { filterCutoff: number; filterResonance: number }) => void;
}

/**
 * Synth "filtro con curva" per the brief's point 3. The response curve
 * comes from a real (throwaway, never connected to the audio graph)
 * BiquadFilterNode.getFrequencyResponse() call, the same exact-math
 * technique EqPanel already uses - not a redrawn approximation of what a
 * lowpass does.
 *
 * The one draggable node's x is cutoff frequency; its y is locked to the
 * curve's own real response height at that exact frequency (computed
 * with the same getFrequencyResponse call, not estimated) so the node
 * visibly rides the curve as it's dragged, instead of floating at a
 * height that means something else. Resonance/Q gets its own slider
 * below rather than sharing the node's y-axis - mapping Q onto "how far
 * above the curve" would need an approximate peak-height formula instead
 * of this exact one, for a control that isn't what the brief asked for
 * dragging on the curve in the first place (cutoff is).
 */
export function FilterCurveEditor({ cutoff, resonance, onChange }: FilterCurveEditorProps) {
  const drawBackground = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.font = "9px monospace";
      for (const f of [100, 1000, 10000]) {
        const x = freqToX(f) * width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x + 2, height - 2);
      }
      const zeroY = height - gainToY(0) * height;
      ctx.beginPath();
      ctx.moveTo(0, zeroY);
      ctx.lineTo(width, zeroY);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.stroke();
    },
    []
  );

  const audioCtx = getAudioEngine().getContext();
  let cutoffDb = 0;
  if (audioCtx) {
    const filter = audioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    filter.Q.value = resonance;
    const freqs = new Float32Array(RESPONSE_STEPS);
    for (let i = 0; i < RESPONSE_STEPS; i++) freqs[i] = xToFreq(i / (RESPONSE_STEPS - 1));
    const magOut = new Float32Array(RESPONSE_STEPS);
    const phaseOut = new Float32Array(RESPONSE_STEPS);
    filter.getFrequencyResponse(freqs, magOut, phaseOut);
    cutoffDb = 20 * Math.log10(Math.max(1e-6, magOut[Math.round(freqToX(cutoff) * (RESPONSE_STEPS - 1))]));
  }

  const curveDrawBackground = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      drawBackground(ctx, width, height);
      const ctx2 = getAudioEngine().getContext();
      if (!ctx2) return;
      const filter = ctx2.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = cutoff;
      filter.Q.value = resonance;
      const freqs = new Float32Array(RESPONSE_STEPS);
      for (let i = 0; i < RESPONSE_STEPS; i++) freqs[i] = xToFreq(i / (RESPONSE_STEPS - 1));
      const magOut = new Float32Array(RESPONSE_STEPS);
      const phaseOut = new Float32Array(RESPONSE_STEPS);
      filter.getFrequencyResponse(freqs, magOut, phaseOut);

      ctx.strokeStyle = "#f2ede4";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < RESPONSE_STEPS; i++) {
        const db = 20 * Math.log10(Math.max(1e-6, magOut[i]));
        const x = (i / (RESPONSE_STEPS - 1)) * width;
        const y = height - gainToY(db) * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    },
    [drawBackground, cutoff, resonance]
  );

  const points: CurvePoint[] = [{ id: "cutoff", x: freqToX(cutoff), y: gainToY(cutoffDb) }];

  function handlePointsChange(next: CurvePoint[]) {
    onChange({ filterCutoff: Math.round(xToFreq(next[0].x)), filterResonance: resonance });
  }

  return (
    <div className="space-y-1">
      <CurveEditor
        width={WIDTH}
        height={HEIGHT}
        points={points}
        onPointsChange={handlePointsChange}
        drawBackground={curveDrawBackground}
        drawCurve={false}
      />
      <p className="text-[9px] text-bone-3">Corte {cutoff >= 1000 ? `${(cutoff / 1000).toFixed(1)}k` : cutoff.toFixed(0)} Hz</p>
      <ParamSlider
        label="Resonancia"
        value={resonance}
        min={0.1}
        max={20}
        step={0.1}
        onChange={(v) => onChange({ filterCutoff: cutoff, filterResonance: v })}
      />
    </div>
  );
}
