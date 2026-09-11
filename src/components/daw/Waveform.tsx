"use client";

import { useEffect, useRef } from "react";
import { computePeaks } from "@/audio-engine/waveform";

interface WaveformProps {
  buffer: AudioBuffer | null;
  width: number;
  height: number;
  color?: string;
}

export function Waveform({ buffer, width, height, color = "rgba(255,255,255,0.75)" }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, width * dpr);
    canvas.height = Math.max(1, height * dpr);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    if (!buffer || width <= 0) return;

    const bucketCount = Math.max(1, Math.floor(width));
    const { min, max } = computePeaks(buffer, bucketCount);
    const mid = height / 2;

    ctx.fillStyle = color;
    for (let x = 0; x < bucketCount; x++) {
      const y1 = mid + min[x] * mid;
      const y2 = mid + max[x] * mid;
      ctx.fillRect(x, Math.min(y1, y2), 1, Math.max(1, Math.abs(y2 - y1)));
    }
  }, [buffer, width, height, color]);

  return <canvas ref={canvasRef} style={{ width, height }} className="block" />;
}
