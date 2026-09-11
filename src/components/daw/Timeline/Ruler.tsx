"use client";

import { PIXELS_PER_SECOND, RULER_HEIGHT } from "./constants";

interface RulerProps {
  width: number;
  onSeek: (time: number) => void;
}

export function Ruler({ width, onSeek }: RulerProps) {
  const seconds = Math.ceil(width / PIXELS_PER_SECOND);
  const ticks = Array.from({ length: seconds + 1 }, (_, i) => i);

  return (
    <div
      className="relative shrink-0 cursor-pointer border-b border-neutral-800 bg-neutral-950"
      style={{ width, height: RULER_HEIGHT }}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek(Math.max(0, (e.clientX - rect.left) / PIXELS_PER_SECOND));
      }}
    >
      {ticks.map((s) => (
        <div
          key={s}
          className="absolute top-0 h-full border-l border-neutral-800 pl-1 text-[10px] text-neutral-500"
          style={{ left: s * PIXELS_PER_SECOND }}
        >
          {s % 5 === 0 ? `${s}s` : ""}
        </div>
      ))}
    </div>
  );
}
