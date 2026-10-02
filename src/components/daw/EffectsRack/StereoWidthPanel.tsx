"use client";

import { useEffect, useRef, useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import type { StereoWidthEffect } from "@/audio-engine/effects/StereoWidthEffect";
import { computeStereoCorrelation } from "@/audio-engine/stereoAnalysis";
import { useRafLoop } from "@/hooks/useRafLoop";
import type { EffectTarget } from "@/state/projectStore";
import type { StereoWidthParams } from "@/types/effects";
import { ParamSlider } from "./ParamSlider";

const HEIGHT = 200;
const POINTS_DRAWN = 512; // subset of the analyser buffer, plenty for a scatter and cheap to draw every frame

/**
 * iZotope Ozone Imager-style pairing per the FASE 10F reference table:
 * "vectorscopio y correlación estéreo". Both come from StereoWidthEffect's
 * own leftAnalyser/rightAnalyser, tapped inline right where L and R are
 * actually summed post-width (see its doc comment) - genuinely
 * synchronized per-channel data, which a track/master analyser (mono-
 * summed, one channel) can't provide at all regardless of tap point.
 * The dot cloud is plotted mid/side rotated (mono content draws a
 * vertical line, out-of-phase content draws a horizontal line) - the
 * standard vectorscope orientation.
 */
export function StereoWidthPanel({
  target,
  effectId,
  params,
  onChange,
}: {
  target: EffectTarget;
  effectId: string;
  params: StereoWidthParams;
  onChange: (params: StereoWidthParams) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const leftDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const rightDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const [correlation, setCorrelation] = useState(1);

  // The vectorscope was the largest canvas of the 15 audited (zona 2/3) but
  // a pure readout - dragging it did nothing. Width already visibly spreads
  // the dot cloud horizontally in real time (the analysers are tapped post-
  // width, see the doc comment above), so distance-from-center is the
  // natural control axis: drag to where you want the cloud's edge to sit.
  // Same stable-listener-plus-refs structure as the other draggable-chart
  // hooks in this folder, kept inline (not a `useDraggableX` variant) since
  // the center-relative mapping here doesn't match their left-to-right
  // min/max convention.
  const paramsRef = useRef(params);
  const onChangeRef = useRef(onChange);
  const draggingRef = useRef(false);
  useEffect(() => {
    paramsRef.current = params;
    onChangeRef.current = onChange;
  }, [params, onChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function widthFromClientX(clientX: number): number {
      const rect = canvas!.getBoundingClientRect();
      const cx = rect.width / 2;
      const scale = Math.min(rect.width, rect.height) / 2 - 6;
      const dist = Math.abs(clientX - rect.left - cx);
      return scale > 0 ? Math.min(2, Math.max(0, dist / scale)) : 1;
    }

    function onPointerDown(e: PointerEvent) {
      draggingRef.current = true;
      canvas!.setPointerCapture(e.pointerId);
      onChangeRef.current({ ...paramsRef.current, width: widthFromClientX(e.clientX) });
    }
    function onPointerMove(e: PointerEvent) {
      if (!draggingRef.current) return;
      onChangeRef.current({ ...paramsRef.current, width: widthFromClientX(e.clientX) });
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

    const node = getAudioEngine().getEffectNode(target, effectId) as StereoWidthEffect | undefined;
    const leftAnalyser = typeof node?.getLeftAnalyser === "function" ? node.getLeftAnalyser() : null;
    const rightAnalyser = typeof node?.getRightAnalyser === "function" ? node.getRightAnalyser() : null;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || HEIGHT;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const scale = Math.min(w, h) / 2 - 6;

    // Axes: vertical = mono (mid), horizontal = fully out of phase (side).
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, h);
    ctx.moveTo(0, cy);
    ctx.lineTo(w, cy);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "9px monospace";
    ctx.fillText("M", cx + 3, 10);
    ctx.fillText("S", w - 12, cy - 3);

    // Target-width guide lines - visible even with no signal (silence draws
    // an empty scope), so the control's current state is never just blank.
    const targetX = params.width * scale;
    ctx.strokeStyle = "rgba(122,214,146,0.35)";
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(cx - targetX, 0);
    ctx.lineTo(cx - targetX, h);
    ctx.moveTo(cx + targetX, 0);
    ctx.lineTo(cx + targetX, h);
    ctx.stroke();
    ctx.setLineDash([]);

    if (leftAnalyser && rightAnalyser) {
      if (!leftDataRef.current || leftDataRef.current.length !== leftAnalyser.fftSize) {
        leftDataRef.current = new Float32Array(leftAnalyser.fftSize);
      }
      if (!rightDataRef.current || rightDataRef.current.length !== rightAnalyser.fftSize) {
        rightDataRef.current = new Float32Array(rightAnalyser.fftSize);
      }
      leftAnalyser.getFloatTimeDomainData(leftDataRef.current);
      rightAnalyser.getFloatTimeDomainData(rightDataRef.current);
      const left = leftDataRef.current;
      const right = rightDataRef.current;

      setCorrelation(computeStereoCorrelation(left, right));

      ctx.fillStyle = "rgba(122,214,146,0.55)";
      const step = Math.max(1, Math.floor(left.length / POINTS_DRAWN));
      for (let i = 0; i < left.length; i += step) {
        const mid = (left[i] + right[i]) / 2;
        const side = (left[i] - right[i]) / 2;
        // Rotated 45°: side on x, mid on y (mono = vertical line).
        const x = cx + side * scale;
        const y = cy - mid * scale;
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    }
  }, true);

  const corrPct = ((correlation + 1) / 2) * 100;

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="block w-full cursor-ew-resize rounded bg-ink"
        style={{ height: HEIGHT, touchAction: "none" }}
        title="Arrastra para fijar el ancho"
      />
      <div className="flex items-center gap-2">
        <span className="w-24 shrink-0 text-[10px] uppercase tracking-wide text-bone-3">Correlación</span>
        <div className="relative h-2 flex-1 overflow-hidden rounded bg-surf-2">
          <div
            className={`absolute inset-y-0 left-1/2 ${correlation < 0 ? "bg-[#e5243b]" : "bg-[#7ad692]"}`}
            style={{
              width: `${Math.abs(corrPct - 50)}%`,
              left: correlation < 0 ? `${corrPct}%` : "50%",
            }}
          />
        </div>
        <span className="w-10 shrink-0 text-right font-mono text-[11px] text-bone">{correlation.toFixed(2)}</span>
      </div>
      <ParamSlider label="Ancho" value={params.width * 100} min={0} max={200} step={5} unit="%" decimals={0} onChange={(v) => onChange({ ...params, width: v / 100 })} />
    </div>
  );
}
