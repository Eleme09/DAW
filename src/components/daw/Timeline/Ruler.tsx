"use client";

import { PIXELS_PER_SECOND, RULER_HEIGHT } from "./constants";
import { barSeconds, beatSeconds } from "@/lib/timing/grid";

interface RulerProps {
  width: number;
  bpm: number;
  timeSignature: [number, number];
  onSeek: (time: number) => void;
}

export function Ruler({ width, bpm, timeSignature, onSeek }: RulerProps) {
  const durationSec = width / PIXELS_PER_SECOND;
  const beatSec = beatSeconds(bpm, timeSignature[1]);
  const barSec = barSeconds(bpm, timeSignature);
  const beatsPerBar = timeSignature[0];
  const beatCount = Math.ceil(durationSec / beatSec) + 1;
  const beats = Array.from({ length: beatCount }, (_, i) => i);

  return (
    <div
      className="relative shrink-0 cursor-pointer border-b border-line bg-ink"
      style={{ width, height: RULER_HEIGHT }}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek(Math.max(0, (e.clientX - rect.left) / PIXELS_PER_SECOND));
      }}
    >
      {beats.map((i) => {
        const isBar = i % beatsPerBar === 0;
        const bar = Math.floor(i / beatsPerBar) + 1;
        return (
          <div
            key={i}
            className={`absolute top-0 h-full pl-1 text-[10px] ${
              isBar ? "border-l border-line-2 text-bone-2" : "border-l border-surf text-transparent"
            }`}
            style={{ left: (i * beatSec * PIXELS_PER_SECOND) }}
          >
            {isBar ? bar : ""}
          </div>
        );
      })}
      <span className="pointer-events-none absolute right-1 top-0.5 text-[9px] text-bone-3" title="Duración del compás">
        {barSec.toFixed(2)}s/compás
      </span>
    </div>
  );
}
