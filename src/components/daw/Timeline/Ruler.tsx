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
      {ticks.map((s) => {
        const isMajor = s % 5 === 0;
        return (
          <div
            key={s}
            className={`absolute top-0 h-full pl-1 text-[10px] ${
              isMajor ? "border-l border-neutral-700 text-neutral-400" : "border-l border-neutral-900 text-transparent"
            }`}
            style={{ left: s * PIXELS_PER_SECOND }}
          >
            {isMajor ? `${s}s` : ""}
          </div>
        );
      })}
    </div>
  );
}
