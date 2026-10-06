"use client";

import { useRef, useState, type ReactNode } from "react";
import type { FxSkin } from "@/lib/fx/catalog";

/**
 * Shared parts of every effect face. Each effect keeps its own look (the
 * skin: panel colour, knob material, accent) but the same gestures: drag a
 * knob up/down or left/right, double tap to reset, values always written
 * out in a box under the knob (like BandLab's sliders, readable at arm's
 * length on a phone).
 */

export type Scale = "lin" | "log";

function toNorm(v: number, min: number, max: number, scale: Scale): number {
  if (scale === "log") return Math.log(v / min) / Math.log(max / min);
  return (v - min) / (max - min);
}

function fromNorm(n: number, min: number, max: number, scale: Scale): number {
  const c = Math.min(1, Math.max(0, n));
  if (scale === "log") return min * Math.pow(max / min, c);
  return min + c * (max - min);
}

const START = -135;
const SWEEP = 270;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, to);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  const sweep = to > from ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} ${sweep} ${b.x} ${b.y}`;
}

const KNOB_BODY: Record<FxSkin["knob"], { body: string; rim: string; line: string; cap: string }> = {
  black: { body: "url(#knob-black)", rim: "#3a3a40", line: "#f2ede4", cap: "#1c1c20" },
  chrome: { body: "url(#knob-chrome)", rim: "#6d6c68", line: "#1b1b1d", cap: "#d8d6d0" },
  cream: { body: "url(#knob-cream)", rim: "#9f8f70", line: "#2b1d10", cap: "#efe3c8" },
  white: { body: "url(#knob-white)", rim: "#a9b4c0", line: "#18202a", cap: "#ffffff" },
};

/** Gradients the knobs reference - mounted once per face. */
export function KnobDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        <radialGradient id="knob-black" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#4a4a52" />
          <stop offset="55%" stopColor="#1d1d22" />
          <stop offset="100%" stopColor="#0b0b0d" />
        </radialGradient>
        <radialGradient id="knob-chrome" cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#c9c7c1" />
          <stop offset="80%" stopColor="#8e8c86" />
          <stop offset="100%" stopColor="#5d5b56" />
        </radialGradient>
        <radialGradient id="knob-cream" cx="35%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#fff8e8" />
          <stop offset="60%" stopColor="#e7d7b4" />
          <stop offset="100%" stopColor="#b59e72" />
        </radialGradient>
        <radialGradient id="knob-white" cx="35%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="70%" stopColor="#dfe6ee" />
          <stop offset="100%" stopColor="#aab6c3" />
        </radialGradient>
      </defs>
    </svg>
  );
}

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  skin: FxSkin;
  format: (v: number) => string;
  defaultValue?: number;
  scale?: Scale;
  size?: number;
  /** Arc grows from the centre (pan, gain +-). */
  bipolar?: boolean;
  step?: number;
}

/** Rotary knob. Drag in any direction (up/right = more), long throw so
 * small moves are fine; double tap resets. */
export function FxKnob({ label, value, min, max, onChange, skin, format, defaultValue, scale = "lin", size = 64, bipolar = false, step }: KnobProps) {
  const drag = useRef<{ x: number; y: number; n: number } | null>(null);
  const lastTap = useRef(0);
  const norm = toNorm(Math.min(max, Math.max(min, value)), min, max, scale);
  const angle = START + norm * SWEEP;
  const s = size;
  const c = s / 2;
  const rArc = c - 2;
  const rBody = c - 9;
  const body = KNOB_BODY[skin.knob];
  const centreAngle = START + (bipolar ? 0.5 : 0) * SWEEP;

  function emit(n: number) {
    let v = fromNorm(n, min, max, scale);
    if (step) v = Math.round(v / step) * step;
    onChange(Math.min(max, Math.max(min, v)));
  }

  return (
    <div className="flex select-none flex-col items-center" style={{ width: Math.max(s, 56) }}>
      <span className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: skin.ink2 }}>
        {label}
      </span>
      <div
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowRight") emit(norm + 0.02);
          if (e.key === "ArrowDown" || e.key === "ArrowLeft") emit(norm - 0.02);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          const now = Date.now();
          if (now - lastTap.current < 300 && defaultValue !== undefined) {
            onChange(defaultValue);
            lastTap.current = 0;
            drag.current = null;
            return;
          }
          lastTap.current = now;
          drag.current = { x: e.clientX, y: e.clientY, n: norm };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const delta = (e.clientX - d.x - (e.clientY - d.y)) / 220;
          emit(d.n + delta);
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        className="relative cursor-grab outline-none active:cursor-grabbing"
        style={{ width: s, height: s, touchAction: "none" }}
      >
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <path d={arc(c, c, rArc, START, START + SWEEP)} fill="none" stroke={skin.light ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.12)"} strokeWidth={3} strokeLinecap="round" />
          {Math.abs(angle - centreAngle) > 0.5 && (
            <path
              d={arc(c, c, rArc, Math.min(centreAngle, angle), Math.max(centreAngle, angle))}
              fill="none"
              stroke={skin.accent}
              strokeWidth={3}
              strokeLinecap="round"
            />
          )}
          <circle cx={c} cy={c + 1.5} r={rBody} fill="rgba(0,0,0,0.45)" />
          <circle cx={c} cy={c} r={rBody} fill={body.body} stroke={body.rim} strokeWidth={1} />
          <circle cx={c} cy={c} r={rBody * 0.62} fill={body.cap} opacity={skin.knob === "black" ? 0.55 : 0.35} />
          <line
            x1={polar(c, c, rBody * 0.25, angle).x}
            y1={polar(c, c, rBody * 0.25, angle).y}
            x2={polar(c, c, rBody * 0.9, angle).x}
            y2={polar(c, c, rBody * 0.9, angle).y}
            stroke={body.line}
            strokeWidth={Math.max(2, s * 0.045)}
            strokeLinecap="round"
          />
        </svg>
      </div>
      <span
        className="mt-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] tabular-nums"
        style={{ color: skin.ink, background: skin.light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.07)" }}
      >
        {format(value)}
      </span>
    </div>
  );
}

/** A titled group of controls (Valhalla's boxes). */
export function Box({ title, skin, children, className = "" }: { title?: string; skin: FxSkin; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl px-3 pb-3 pt-2 ${className}`} style={{ background: skin.box, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}>
      {title && (
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: skin.ink2 }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

/** Pill selector (mode, tempo division, ...). */
export function Pills<T extends string>({
  options,
  value,
  onChange,
  skin,
  small = false,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  skin: FxSkin;
  small?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            aria-pressed={on}
            className={`rounded-full font-semibold ${small ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"}`}
            style={{
              background: on ? skin.accent : skin.light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.07)",
              color: on ? (skin.light ? "#fff" : "#0b0b0d") : skin.ink,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Advanced controls, folded away by default. */
export function Advanced({ skin, children }: { skin: FxSkin; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-semibold"
        style={{ color: skin.ink2, background: skin.light ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.04)" }}
      >
        <span>Avanzado</span>
        <span style={{ transform: open ? "rotate(180deg)" : "none" }} className="transition-transform">
          ▾
        </span>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

/** Even row of knobs. */
export function KnobRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-start justify-around gap-y-3">{children}</div>;
}

export const fmt = {
  db: (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`,
  dbInt: (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)} dB`,
  hz: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 1 : 2)} kHz` : `${v.toFixed(0)} Hz`),
  ms: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${v.toFixed(v < 10 ? 1 : 0)} ms`),
  sec: (v: number) => `${v.toFixed(1)} s`,
  pct: (v: number) => `${Math.round(v * 100)} %`,
  ratio: (v: number) => `${v.toFixed(1)}:1`,
  x: (v: number) => `${v.toFixed(2)}x`,
  q: (v: number) => v.toFixed(2),
};
