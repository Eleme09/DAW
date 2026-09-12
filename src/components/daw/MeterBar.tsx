"use client";

import { useRef } from "react";
import { useRafLoop } from "@/hooks/useRafLoop";
import { gainToDb } from "@/audio-engine/dbUtils";

interface MeterBarProps {
  analyser: AnalyserNode | null;
  vertical?: boolean;
}

const METER_MIN_DB = -60;
const METER_MAX_DB = 0;
const SCALE_TICKS_DB = [0, -6, -12, -24, -48, -60];
/** Just under 0dBFS - real transients round-trip through float rendering
 * slightly under 1.0 even when a source was authored right at 0dB. */
const CLIP_THRESHOLD = 0.98;
/** Roughly matches a classic analog peak-hold ballistic (hold briefly, then
 * fall). Framerate-independent via the measured frame delta, not a fixed
 * per-tick step. */
const PEAK_HOLD_DECAY_DB_PER_SEC = 12;
const CLIP_LED_PX = 6;

function dbToFrac(db: number): number {
  const clamped = Math.min(METER_MAX_DB, Math.max(METER_MIN_DB, db));
  return (clamped - METER_MIN_DB) / (METER_MAX_DB - METER_MIN_DB);
}

function levelColor(db: number): string {
  if (db > -3) return "#ef4444";
  if (db > -12) return "#eab308";
  return "#22c55e";
}

/** Canvas peak+RMS meter with a decaying peak-hold line, a drawn dB scale,
 * and a latching clip indicator (click to reset) - FASE 9 (PROMPT_MAESTRO)
 * requires every mixer/master visualization to be canvas-drawn, not CSS
 * bars. Data is fetched every frame via refs (not React state) to avoid
 * re-render churn - only the canvas pixels change per frame. */
export function MeterBar({ analyser, vertical = true }: MeterBarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const holdDbRef = useRef(METER_MIN_DB);
  const lastFrameRef = useRef<number | null>(null);
  const clippedRef = useRef(false);

  useRafLoop(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    let rmsDb = METER_MIN_DB;
    let clipped = clippedRef.current;

    if (analyser) {
      if (!dataRef.current || dataRef.current.length !== analyser.fftSize) {
        dataRef.current = new Float32Array(analyser.fftSize);
      }
      analyser.getFloatTimeDomainData(dataRef.current);
      let peakAmp = 0;
      let sumSquares = 0;
      for (const v of dataRef.current) {
        const abs = Math.abs(v);
        if (abs > peakAmp) peakAmp = abs;
        sumSquares += v * v;
      }
      rmsDb = gainToDb(Math.sqrt(sumSquares / dataRef.current.length));
      const peakDb = gainToDb(peakAmp);

      const now = performance.now();
      const dtSec = lastFrameRef.current === null ? 0 : (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;
      holdDbRef.current = Math.max(peakDb, holdDbRef.current - PEAK_HOLD_DECAY_DB_PER_SEC * dtSec);

      if (peakAmp >= CLIP_THRESHOLD) {
        clippedRef.current = true;
        clipped = true;
      }
    }

    // Track background
    const trackStart = CLIP_LED_PX + 2;
    ctx.fillStyle = "#27272a";
    if (vertical) {
      ctx.fillRect(0, trackStart, w, h - trackStart);
    } else {
      ctx.fillRect(trackStart, 0, w - trackStart, h);
    }

    // dB scale ticks
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    for (const db of SCALE_TICKS_DB) {
      const frac = dbToFrac(db);
      ctx.beginPath();
      if (vertical) {
        const y = h - frac * (h - trackStart);
        ctx.moveTo(0, y);
        ctx.lineTo(2, y);
      } else {
        const x = trackStart + frac * (w - trackStart);
        ctx.moveTo(x, h - 2);
        ctx.lineTo(x, h);
      }
      ctx.stroke();
    }

    // RMS level fill
    const rmsFrac = dbToFrac(rmsDb);
    ctx.fillStyle = levelColor(rmsDb);
    if (vertical) {
      const barH = rmsFrac * (h - trackStart);
      ctx.fillRect(0, h - barH, w, barH);
    } else {
      const barW = rmsFrac * (w - trackStart);
      ctx.fillRect(trackStart, 0, barW, h);
    }

    // Peak-hold line
    if (analyser) {
      const holdFrac = dbToFrac(holdDbRef.current);
      ctx.fillStyle = "#ffffff";
      if (vertical) {
        const y = h - holdFrac * (h - trackStart);
        ctx.fillRect(0, y - 1, w, 1.5);
      } else {
        const x = trackStart + holdFrac * (w - trackStart);
        ctx.fillRect(x - 0.75, 0, 1.5, h);
      }
    }

    // Clip LED
    ctx.fillStyle = clipped ? "#ef4444" : "#3f3f46";
    ctx.beginPath();
    if (vertical) {
      ctx.arc(w / 2, CLIP_LED_PX / 2, CLIP_LED_PX / 2, 0, Math.PI * 2);
    } else {
      ctx.arc(CLIP_LED_PX / 2, h / 2, CLIP_LED_PX / 2, 0, Math.PI * 2);
    }
    ctx.fill();
  }, true);

  function resetClip(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ledX = vertical ? rect.width / 2 : CLIP_LED_PX / 2;
    const ledY = vertical ? CLIP_LED_PX / 2 : rect.height / 2;
    if (Math.hypot(x - ledX, y - ledY) <= CLIP_LED_PX * 1.5) {
      clippedRef.current = false;
    }
  }

  return (
    <canvas
      ref={canvasRef}
      onClick={resetClip}
      title="Medidor de pico/RMS - haz clic en el punto para reiniciar el indicador de clip"
      className={vertical ? "h-full w-3 cursor-pointer rounded-sm" : "h-full w-full cursor-pointer rounded-sm"}
    />
  );
}
