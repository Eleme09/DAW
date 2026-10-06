"use client";

import { useRef } from "react";
import { FADER_MIN_DB as MIN_DB, faderDbToPos, faderPosToDb } from "@/lib/audio/faderLaw";
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
  const drag = useRef<{ start: number; startPos: number } | null>(null);
  const horizontal = orientation === "horizontal";
  const trackLength = length ?? height;
  // Drag maps 1:1 to the visible track (the thumb tracks the finger on
  // every strip size), through the fader law (lib/audio/faderLaw.ts):
  // 0 dB at 79 % of the travel, halfway -12 dB.
  function beginDrag(e: React.PointerEvent) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { start: horizontal ? e.clientX : e.clientY, startPos: faderDbToPos(valueDb) };
    onDragStart?.();
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const pos = horizontal ? e.clientX : e.clientY;
    // Horizontal: moving right increases the value, same sign as moving
    // up does for vertical - both are "toward the loud end" of the travel.
    const delta = ((horizontal ? 1 : -1) * (pos - drag.current.start)) / Math.max(1, trackLength);
    onChange(Math.round(faderPosToDb(drag.current.startPos + delta) * 10) / 10);
  }

  function onPointerUp(e: React.PointerEvent) {
    drag.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    onDragEnd?.();
  }

  const pct = faderDbToPos(valueDb) * 100;
  const zeroPct = faderDbToPos(0) * 100;
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
          {/* Línea delgada uniforme + perilla circular, no una barra de
             progreso rellena con un pulgar rectangular - confirmado contra
             captura real del fader horizontal del Mixer de BandLab. */}
          <div className="pointer-events-none absolute inset-y-0 left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-white/30" />
          <div className="pointer-events-none absolute top-1/2 h-2 w-px -translate-y-1/2 bg-white/40" style={{ left: `${zeroPct}%` }} />
          <div
            className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow"
            style={{ left: `calc(${pct}% - 8px)` }}
          />
        </div>
        {showScale && (
          <div className="relative shrink-0" style={{ width: trackLength, height: 12 }}>
            {SCALE_MARKS.map(({ db, label: markLabel }) => {
              const markPct = faderDbToPos(db) * 100;
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
        <div className="pointer-events-none absolute inset-x-0 bottom-0 top-0 left-1/2 w-px -translate-x-1/2 bg-white/30" />
        <div
          className="pointer-events-none absolute left-1/2 h-px w-2 -translate-x-1/2 bg-white/40"
          style={{ bottom: `${zeroPct}%` }}
        />
        <div
          className="pointer-events-none absolute left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-white shadow"
          style={{ bottom: `calc(${pct}% - 8px)` }}
        />
      </div>
      {showScale && (
        <div className="relative shrink-0" style={{ height: trackLength, width: 18 }}>
          {SCALE_MARKS.map(({ db, label: markLabel }) => {
            const markPct = faderDbToPos(db) * 100;
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
