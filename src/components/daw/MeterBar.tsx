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
/** Just under 0dBFS - real transients round-trip through float rendering
 * slightly under 1.0 even when a source was authored right at 0dB. */
const CLIP_THRESHOLD = 0.98;
/** Roughly matches a classic analog peak-hold ballistic (hold briefly, then
 * fall). Framerate-independent via the measured frame delta, not a fixed
 * per-tick step. */
const PEAK_HOLD_DECAY_DB_PER_SEC = 12;

function dbToPct(db: number): number {
  const clamped = Math.min(METER_MAX_DB, Math.max(METER_MIN_DB, db));
  return ((clamped - METER_MIN_DB) / (METER_MAX_DB - METER_MIN_DB)) * 100;
}

function levelColor(db: number): string {
  if (db > -3) return "#ef4444";
  if (db > -12) return "#eab308";
  return "#22c55e";
}

/** Peak+RMS meter with a decaying peak-hold line and a latching clip
 * indicator (click to reset) - driven directly by refs to avoid re-render
 * churn on every audio frame. */
export function MeterBar({ analyser, vertical = true }: MeterBarProps) {
  const rmsRef = useRef<HTMLDivElement>(null);
  const holdLineRef = useRef<HTMLDivElement>(null);
  const clipLedRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const holdDbRef = useRef(METER_MIN_DB);
  const lastFrameRef = useRef<number | null>(null);
  const clippedRef = useRef(false);

  useRafLoop(() => {
    if (!analyser || !rmsRef.current) return;
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
    const rmsDb = gainToDb(Math.sqrt(sumSquares / dataRef.current.length));
    const peakDb = gainToDb(peakAmp);

    const now = performance.now();
    const dtSec = lastFrameRef.current === null ? 0 : (now - lastFrameRef.current) / 1000;
    lastFrameRef.current = now;
    holdDbRef.current = Math.max(peakDb, holdDbRef.current - PEAK_HOLD_DECAY_DB_PER_SEC * dtSec);

    if (peakAmp >= CLIP_THRESHOLD) clippedRef.current = true;

    const rmsPct = dbToPct(rmsDb);
    const holdPct = dbToPct(holdDbRef.current);
    if (vertical) {
      rmsRef.current.style.height = `${rmsPct}%`;
      if (holdLineRef.current) holdLineRef.current.style.bottom = `${holdPct}%`;
    } else {
      rmsRef.current.style.width = `${rmsPct}%`;
      if (holdLineRef.current) holdLineRef.current.style.left = `${holdPct}%`;
    }
    rmsRef.current.style.background = levelColor(rmsDb);
    if (clipLedRef.current) {
      clipLedRef.current.style.background = clippedRef.current ? "#ef4444" : "#3f3f46";
    }
  }, Boolean(analyser));

  function resetClip(e: React.MouseEvent) {
    e.stopPropagation();
    clippedRef.current = false;
    if (clipLedRef.current) clipLedRef.current.style.background = "#3f3f46";
  }

  return (
    <div className={vertical ? "flex h-full flex-col items-center gap-0.5" : "flex w-full items-center gap-1"}>
      <div
        ref={clipLedRef}
        onClick={resetClip}
        title="Clip indicator - click to reset"
        className="h-1.5 w-1.5 shrink-0 cursor-pointer rounded-full bg-neutral-700"
      />
      <div
        className={
          vertical
            ? "relative w-2 flex-1 overflow-hidden rounded-sm bg-neutral-800"
            : "relative h-2 flex-1 overflow-hidden rounded-sm bg-neutral-800"
        }
      >
        <div
          ref={rmsRef}
          className={
            vertical
              ? "absolute bottom-0 w-full bg-green-500 transition-[height] duration-75"
              : "absolute left-0 h-full bg-green-500 transition-[width] duration-75"
          }
        />
        <div
          ref={holdLineRef}
          className={vertical ? "absolute inset-x-0 h-px bg-white" : "absolute inset-y-0 w-px bg-white"}
          style={vertical ? { bottom: 0 } : { left: 0 }}
        />
      </div>
    </div>
  );
}
