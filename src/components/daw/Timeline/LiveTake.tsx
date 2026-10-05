"use client";

import { useEffect, useRef, useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { useProjectStore } from "@/state/projectStore";

/**
 * The take being recorded, drawn as it grows - BandLab paints it in a pale
 * tint of the track color starting at the record point, with the incoming
 * waveform drawn inside it live (user's recording). Peaks come from the
 * recording analyser once per frame; it's a picture of what's coming in,
 * the real clip replaces it when recording stops.
 */
export function LiveTake({ color, height }: { color: string; height: number }) {
  const start = useProjectStore((s) => s.recordStartTime);
  const currentTime = useProjectStore((s) => s.currentTime);
  const pps = useProjectStore((s) => s.pixelsPerSecond);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peaks = useRef<{ t: number; peak: number }[]>([]);
  // With the Cycle on, each lap starts a new take at the cycle start.
  const [lapStart, setLapStart] = useState<number | null>(null);

  useEffect(() => {
    peaks.current = [];
    let frame = 0;
    let lastT = -Infinity;
    const data = new Float32Array(2048);
    const tick = () => {
      const engine = getAudioEngine();
      const analyser = engine.getRecordingAnalyser();
      if (analyser) {
        const buf = data.subarray(0, analyser.fftSize);
        analyser.getFloatTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
        const t = engine.getCurrentTime();
        if (t < lastT - 0.05) {
          peaks.current = [];
          setLapStart(useProjectStore.getState().project.loop.startTime);
        }
        lastT = t;
        peaks.current.push({ t, peak });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [start]);

  const from = start === null ? null : lapStart ?? start;
  const width = from === null ? 0 : Math.max(0, (currentTime - from) * pps);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || from === null) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, width * dpr);
    canvas.height = Math.max(1, height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = color;
    const mid = height / 2;
    for (const { t, peak } of peaks.current) {
      const x = (t - from) * pps;
      if (x < 0 || x > width) continue;
      const h = Math.max(1, peak * mid);
      ctx.fillRect(x, mid - h, 2, h * 2);
    }
  }, [width, height, color, pps, from]);

  if (from === null || width <= 0) return null;
  return (
    <div
      className="pointer-events-none absolute top-1 overflow-hidden rounded-md"
      style={{ left: from * pps, width, height, background: `color-mix(in srgb, ${color} 30%, white)` }}
    >
      <canvas ref={canvasRef} style={{ width, height }} />
    </div>
  );
}
