"use client";

import { useRef, useState } from "react";

interface KnobProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** Value restored on double-click/double-tap. Defaults to the range midpoint. */
  defaultValue?: number;
  label?: string;
  unit?: string;
  decimals?: number;
  /** Visual diameter in px. The actual hit area is always >= 44px regardless. */
  size?: number;
  /** Drag distance (px) needed to sweep the full range - higher = finer control. */
  throwPx?: number;
  /** Gesture boundaries - used by automation write/touch/latch recording to
   * know exactly when a drag starts/ends, distinct from onChange (which
   * fires on every intermediate value during the drag). Optional/no-op for
   * every other caller. */
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

const START_ANGLE = -135;
const SWEEP_DEGREES = 270;
const LONG_PRESS_MS = 550;

function valueToAngle(value: number, min: number, max: number): number {
  const pct = max === min ? 0 : (value - min) / (max - min);
  return START_ANGLE + pct * SWEEP_DEGREES;
}

function polarPoint(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** SVG arc path from `startAngle` to `endAngle` (degrees, 0 = up, clockwise),
 * always sweeping clockwise through the shorter or longer way as implied by
 * the angle difference - built for a fixed -135..+135 knob range, not a
 * general-purpose arbitrary-arc helper. */
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  if (endAngle <= startAngle) return "";
  const start = polarPoint(cx, cy, r, startAngle);
  const end = polarPoint(cx, cy, r, endAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

/** Rotary knob: vertical drag to change value (long throw by default - the
 * spec's "fine drag via long travel", not a modifier key), double-click/tap
 * to reset, press-and-hold to type an exact value. Renders as SVG (a knob
 * is a small discrete widget - canvas is reserved for continuously
 * redrawn visualizations like meters/curves/waveforms). */
export function Knob({
  value,
  min,
  max,
  onChange,
  defaultValue,
  label,
  unit = "",
  decimals = 1,
  size = 40,
  throwPx = 150,
  onDragStart,
  onDragEnd,
}: KnobProps) {
  const dragRef = useRef<{ startY: number; startValue: number; moved: boolean } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const angle = valueToAngle(clamp(value), min, max);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;

  function clearLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function beginDrag(e: React.PointerEvent) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startValue: value, moved: false };
    onDragStart?.();
    longPressTimer.current = setTimeout(() => {
      setEditValue(value.toFixed(decimals));
      setEditing(true);
    }, LONG_PRESS_MS);
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const deltaY = drag.startY - e.clientY;
    if (Math.abs(deltaY) > 3) {
      drag.moved = true;
      clearLongPress();
    }
    const deltaPct = deltaY / throwPx;
    onChange(clamp(drag.startValue + deltaPct * (max - min)));
  }

  function onPointerUp(e: React.PointerEvent) {
    clearLongPress();
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    onDragEnd?.();
  }

  function handleDoubleClick() {
    onChange(clamp(defaultValue ?? (min + max) / 2));
  }

  function commitEdit() {
    const parsed = Number(editValue);
    if (Number.isFinite(parsed)) onChange(clamp(parsed));
    setEditing(false);
  }

  const hitSize = Math.max(44, size);

  return (
    <div className="flex select-none flex-col items-center gap-1" style={{ width: hitSize }}>
      <div
        onPointerDown={beginDrag}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={handleDoubleClick}
        title={`${label ? label + ": " : ""}${value.toFixed(decimals)}${unit} — drag to adjust, double-click to reset, hold to type a value`}
        className="relative flex cursor-ns-resize items-center justify-center active:cursor-grabbing"
        style={{ width: hitSize, height: hitSize, touchAction: "none" }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <path
            d={describeArc(cx, cy, r, START_ANGLE, START_ANGLE + SWEEP_DEGREES)}
            fill="none"
            stroke="#34343a"
            strokeWidth={3}
            strokeLinecap="round"
          />
          <path d={describeArc(cx, cy, r, START_ANGLE, angle)} fill="none" stroke="#f2ede4" strokeWidth={3} strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={r - 6} fill="#111112" />
          <line
            x1={cx}
            y1={cy}
            x2={polarPoint(cx, cy, r - 4, angle).x}
            y2={polarPoint(cx, cy, r - 4, angle).y}
            stroke="#f2ede4"
            strokeWidth={2}
            strokeLinecap="round"
          />
        </svg>
      </div>
      {label && <span className="truncate text-[9px] text-bone-2">{label}</span>}
      {editing ? (
        <input
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-12 rounded bg-surf px-1 text-center text-[10px] text-bone outline-none ring-1 ring-bone"
        />
      ) : (
        <span className="font-mono text-[9px] tabular-nums text-bone-2">
          {value.toFixed(decimals)}
          {unit}
        </span>
      )}
    </div>
  );
}
