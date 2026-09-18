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
  /** "vertical" (default) is the classic desktop-strip fader - long
   * travel up/down. "horizontal" is the same control turned 90°: long
   * travel left/right, sized by `length` instead of `height` - this is
   * what a per-row mobile mixer channel needs (estudio-ui.html's own
   * "Mezcla" reference: "fader horizontal... en un teléfono nadie mezcla
   * con columnas de escritorio"). Same drag-delta math either way, just
   * projected onto the other axis - not a second implementation. */
  orientation?: "vertical" | "horizontal";
  /** Track length in px along the fader's travel axis - height for
   * vertical, width for horizontal. */
  length?: number;
  /** Gesture boundaries - used by automation write/touch/latch recording to
   * know exactly when a drag starts/ends, distinct from onChange (which
   * fires on every intermediate value during the drag). Optional/no-op for
   * every other caller. */
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

/** Touch-friendly long-throw fader (vertical or horizontal) with a real dB
 * scale. The whole strip (not just the thumb) is the drag target, and the
 * drag is relative-delta based rather than jump-to-pointer, so touch
 * precision doesn't depend on hitting a thin handle exactly. Hit area is
 * >=44px on the cross axis regardless of the visual track thickness, per
 * FASE 9's minimum touch target. */
export function Fader({
  valueDb,
  onChange,
  height = 128,
  label,
  showScale = false,
  orientation = "vertical",
  length,
  onDragStart,
  onDragEnd,
}: FaderProps) {
  const drag = useRef<{ start: number; startDb: number } | null>(null);
  const horizontal = orientation === "horizontal";
  const trackLength = length ?? height;

  function beginDrag(e: React.PointerEvent) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { start: horizontal ? e.clientX : e.clientY, startDb: valueDb };
    onDragStart?.();
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const pos = horizontal ? e.clientX : e.clientY;
    // Horizontal: moving right increases the value, same sign as moving
    // up does for vertical - both are "toward the loud end" of the travel.
    const deltaDb = ((horizontal ? 1 : -1) * (pos - drag.current.start)) / PX_PER_DB;
    onChange(Math.min(MAX_DB, Math.max(MIN_DB, drag.current.startDb + deltaDb)));
  }

  function onPointerUp(e: React.PointerEvent) {
    drag.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    onDragEnd?.();
  }

  const pct = ((Math.min(MAX_DB, Math.max(MIN_DB, valueDb)) - MIN_DB) / (MAX_DB - MIN_DB)) * 100;
  const zeroPct = ((0 - MIN_DB) / (MAX_DB - MIN_DB)) * 100;
  const title = `${label ? label + " — " : ""}${valueDb.toFixed(1)} dB — arrastra para ajustar, doble clic para reiniciar a 0dB`;

  if (horizontal) {
    return (
      <div className="flex flex-col items-stretch gap-1">
        <div
          onPointerDown={beginDrag}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={() => onChange(0)}
          title={title}
          style={{ width: trackLength, height: 44, touchAction: "none" }}
          className="relative flex shrink-0 cursor-ew-resize select-none items-center rounded active:cursor-grabbing"
        >
          <div className="pointer-events-none absolute inset-y-3.5 left-0 right-0 rounded bg-surf" />
          <div className="pointer-events-none absolute inset-y-3 w-px bg-bone-3" style={{ left: `${zeroPct}%` }} />
          <div
            className="pointer-events-none absolute inset-y-3 left-0 rounded-sm bg-bone/25"
            style={{ width: `${pct}%` }}
          />
          <div
            className="pointer-events-none absolute inset-y-1.5 w-2.5 rounded-sm bg-bone shadow"
            style={{ left: `calc(${pct}% - 5px)` }}
          />
        </div>
        {showScale && (
          <div className="relative shrink-0" style={{ width: trackLength, height: 12 }}>
            {SCALE_MARKS.map(({ db, label: markLabel }) => {
              const markPct = ((Math.min(MAX_DB, Math.max(MIN_DB, db)) - MIN_DB) / (MAX_DB - MIN_DB)) * 100;
              return (
                <span
                  key={db}
                  className="pointer-events-none absolute -translate-x-1/2 font-mono text-[8px] tabular-nums text-bone-3"
                  style={{ left: `${markPct}%` }}
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

  return (
    <div className="flex items-stretch gap-1">
      <div
        onPointerDown={beginDrag}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => onChange(0)}
        title={title}
        style={{ height: trackLength, width: 44, touchAction: "none" }}
        className="relative flex shrink-0 cursor-ns-resize select-none flex-col items-center rounded active:cursor-grabbing"
      >
        <div className="pointer-events-none absolute inset-x-3.5 bottom-0 top-0 rounded bg-surf" />
        <div
          className="pointer-events-none absolute inset-x-3 h-px bg-bone-3"
          style={{ bottom: `${zeroPct}%` }}
        />
        <div
          className="pointer-events-none absolute inset-x-3 bottom-0 rounded-sm bg-bone/25"
          style={{ height: `${pct}%` }}
        />
        <div
          className="pointer-events-none absolute inset-x-1.5 h-2.5 rounded-sm bg-bone shadow"
          style={{ bottom: `calc(${pct}% - 5px)` }}
        />
      </div>
      {showScale && (
        <div className="relative shrink-0" style={{ height: trackLength, width: 18 }}>
          {SCALE_MARKS.map(({ db, label: markLabel }) => {
            const markPct = ((Math.min(MAX_DB, Math.max(MIN_DB, db)) - MIN_DB) / (MAX_DB - MIN_DB)) * 100;
            return (
              <span
                key={db}
                className="pointer-events-none absolute -translate-y-1/2 font-mono text-[8px] tabular-nums text-bone-3"
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
