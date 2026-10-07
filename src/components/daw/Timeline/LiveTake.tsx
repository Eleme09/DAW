"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { useProjectStore } from "@/state/projectStore";

/** Width of each canvas tile, in CSS px. */
const TILE_PX = 1024;

/**
 * The take being recorded, drawn as it grows - BandLab paints it in a pale
 * tint of the track color starting at the record point, with the incoming
 * waveform drawn inside it live (user's recording). Peaks come from the
 * recording analyser once per frame; it's a picture of what's coming in,
 * the real clip replaces it when recording stops.
 *
 * Drawn on fixed-size tiles, only the newest peak each frame: it used to
 * resize one canvas to the whole take and repaint every peak 60 times a
 * second - a canvas of several MB rebuilt every frame by the end of a
 * one-minute take, all on the main thread while recording.
 */
export function LiveTake({ color, height }: { color: string; height: number }) {
  const start = useProjectStore((s) => s.recordStartTime);
  const currentTime = useProjectStore((s) => s.currentTime);
  const pps = useProjectStore((s) => s.pixelsPerSecond);
  const peaks = useRef<{ t: number; peak: number }[]>([]);
  /** Peaks already painted (peaks[0..drawn) ). */
  const drawn = useRef(0);
  const tiles = useRef<(HTMLCanvasElement | null)[]>([]);
  // With the Cycle on, each lap starts a new take at the cycle start.
  const [lapStart, setLapStart] = useState<number | null>(null);

  const from = start === null ? null : lapStart ?? start;
  const width = from === null ? 0 : Math.max(0, (currentTime - from) * pps);
  const tileCount = Math.max(1, Math.ceil(width / TILE_PX));

  // what the painter needs, readable from the animation frame without
  // restarting it
  const view = useRef({ from, pps, height, color });
  useLayoutEffect(() => {
    view.current = { from, pps, height, color };
  });

  /** Paints the peaks not painted yet; stops at one whose tile isn't on
   * screen yet (it's there next frame). */
  const paintNew = useCallback(() => {
    const { from: f, pps: p, height: h, color: c } = view.current;
    if (f === null) return;
    const mid = h / 2;
    while (drawn.current < peaks.current.length) {
      const { t, peak } = peaks.current[drawn.current];
      const x = (t - f) * p;
      if (x >= 0) {
        const i = Math.floor(x / TILE_PX);
        const ctx = tiles.current[i]?.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = c;
        const ph = Math.max(1, peak * mid);
        ctx.fillRect(x - i * TILE_PX, mid - ph, 2, ph * 2);
      }
      drawn.current++;
    }
  }, []);

  useEffect(() => {
    peaks.current = [];
    drawn.current = 0;
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
          drawn.current = 0;
          for (const c of tiles.current) c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
          setLapStart(useProjectStore.getState().project.loop.startTime);
        }
        lastT = t;
        peaks.current.push({ t, peak });
        paintNew();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [start, paintNew]);

  // zoom, lane height, colour or start changed: repaint everything once
  useEffect(() => {
    for (const c of tiles.current) c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    drawn.current = 0;
    paintNew();
  }, [pps, height, color, from, paintNew]);

  /** Sizes a tile's backing store once, when it appears (not every frame). */
  const tileRef = (i: number) => (canvas: HTMLCanvasElement | null) => {
    tiles.current[i] = canvas;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(TILE_PX * dpr);
    const h = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawn.current = Math.min(drawn.current, firstPeakAt(i));
    }
    paintNew();
  };

  /** Index of the first peak that falls on tile i (to repaint a new tile). */
  function firstPeakAt(i: number): number {
    const { from: f, pps: p } = view.current;
    if (f === null) return 0;
    const t0 = f + (i * TILE_PX) / p;
    const list = peaks.current;
    let k = list.length;
    while (k > 0 && list[k - 1].t >= t0) k--;
    return k;
  }

  if (from === null || width <= 0) return null;
  return (
    <div
      className="pointer-events-none absolute top-1 overflow-hidden rounded-md"
      style={{ left: from * pps, width, height, background: `color-mix(in srgb, ${color} 30%, white)` }}
    >
      {Array.from({ length: tileCount }, (_, i) => (
        <canvas key={i} ref={tileRef(i)} className="absolute top-0" style={{ left: i * TILE_PX, width: TILE_PX, height }} />
      ))}
    </div>
  );
}
