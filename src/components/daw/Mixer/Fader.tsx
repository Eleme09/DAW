"use client";

import { useRef } from "react";

const MIN_DB = -60;
const MAX_DB = 6;
/** Real dB marks, per PROMPT_MAESTRO FASE 9 section 3 - the bottom of the
 * physical range reads as -inf (the floor), not a literal -60. */
const SCALE_MARKS: { db: number; label: string }[] = [
  { db: 6, label: "+6" },
  { db: 0, label: "0" },
  { db: -6, label: "-6" },
  { db: -12, label: "-12" },
  { db: -24, label: "-24" },
  { db: -48, label: "-48" },
  { db: MIN_DB, label: "-∞" },
];
/** Drag sensitivity - deliberately finer than the visual travel would imply
 * (same delta-based approach as the clip gain handle in ClipView), so a
 * short thumb drag on a narrow mobile strip still gives precise control. */
const PX_PER_DB = 2.5;

interface FaderProps {
  valueDb: number;
  onChange: (db: number) => void;
  height?: number;
  label?: string;
  /** Draws the dB scale alongside the track - off by default for tight
   * spaces (e.g. a mini strip) where a caller already shows the value elsewhere. */
  showScale?: boolean;
}

/** Touch-friendly long-throw vertical fader with a real dB scale. The whole
 * strip (not just the thumb) is the drag target, and the drag is relative-
 * delta based rather than jump-to-pointer, so touch precision doesn't
 * depend on hitting a thin handle exactly. Hit area is 44px wide regardless
 * of the visual track width, per FASE 9's minimum touch target. */
export function Fader({ valueDb, onChange, height = 128, label, showScale = false }: FaderProps) {
  const drag = useRef<{ startY: number; startDb: number } | null>(null);

  function beginDrag(e: React.PointerEvent) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startDb: valueDb };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const deltaDb = (drag.current.startY - e.clientY) / PX_PER_DB;
    onChange(Math.min(MAX_DB, Math.max(MIN_DB, drag.current.startDb + deltaDb)));
  }

  function onPointerUp(e: React.PointerEvent) {
    drag.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }

  const pct = ((Math.min(MAX_DB, Math.max(MIN_DB, valueDb)) - MIN_DB) / (MAX_DB - MIN_DB)) * 100;
  const zeroPct = ((0 - MIN_DB) / (MAX_DB - MIN_DB)) * 100;

  return (
    <div className="flex items-stretch gap-1">
      <div
        onPointerDown={beginDrag}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => onChange(0)}
        title={`${label ? label + " — " : ""}${valueDb.toFixed(1)} dB — drag to adjust, double-click to reset to 0dB`}
        style={{ height, width: 44, touchAction: "none" }}
        className="relative flex shrink-0 cursor-ns-resize select-none flex-col items-center rounded active:cursor-grabbing"
      >
        <div className="pointer-events-none absolute inset-x-3.5 bottom-0 top-0 rounded bg-neutral-900" />
        <div
          className="pointer-events-none absolute inset-x-3 h-px bg-neutral-600"
          style={{ bottom: `${zeroPct}%` }}
        />
        <div
          className="pointer-events-none absolute inset-x-3 bottom-0 rounded-sm bg-cyan-500/25"
          style={{ height: `${pct}%` }}
        />
        <div
          className="pointer-events-none absolute inset-x-1.5 h-2.5 rounded-sm bg-cyan-400 shadow"
          style={{ bottom: `calc(${pct}% - 5px)` }}
        />
      </div>
      {showScale && (
        <div className="relative shrink-0" style={{ height, width: 18 }}>
          {SCALE_MARKS.map(({ db, label: markLabel }) => {
            const markPct = ((Math.min(MAX_DB, Math.max(MIN_DB, db)) - MIN_DB) / (MAX_DB - MIN_DB)) * 100;
            return (
              <span
                key={db}
                className="pointer-events-none absolute -translate-y-1/2 font-mono text-[8px] tabular-nums text-neutral-600"
                style={{ bottom: `${markPct}%` }}
              >
                {markLabel}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
