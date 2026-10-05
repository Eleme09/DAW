"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AutoPitchCategory } from "@/types/autoPitch";
import { autoPitchLevelLabel } from "@/types/autoPitch";

const SIZE = 240;
const C = SIZE / 2;
const BODY_R = 66;
const START = 135; // degrees, SVG frame (0 = right, clockwise): 7:30 o'clock
const SWEEP = 270;
const INACTIVE = "#33363d";

const COLORS: Record<AutoPitchCategory, string> = {
  essentials: "#2f80f6",
  hipHop: "#f2342a",
  hyperpop: "#ff5b1f",
  sciFi: "#1ec6d6",
};

function polar(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

/** Deterministic 0..1 noise so the Hyperpop spikes don't change per render. */
function hash(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Hip Hop flame: a crescent that thickens clockwise plus flame tongues that
 * lean clockwise at the top right and a small ember, like BandLab's. */
function flameBand(v: number): number {
  return 72 + 13 * Math.pow(v, 1.5);
}

const TONGUES: { v: number; len: number; w: number; lean: number }[] = [
  { v: 0.52, len: 16, w: 0.05, lean: 16 },
  { v: 0.64, len: 30, w: 0.07, lean: 22 },
  { v: 0.77, len: 24, w: 0.065, lean: 20 },
];

function tonguePath(t: { v: number; len: number; w: number; lean: number }): string {
  const deg = (v: number) => START + SWEEP * v;
  const r = flameBand(t.v) - 3;
  const [b1x, b1y] = polar(r, deg(t.v - t.w));
  const [b2x, b2y] = polar(r, deg(t.v + t.w));
  const [tx, ty] = polar(r + t.len, deg(t.v) + t.lean);
  const [c1x, c1y] = polar(r + t.len * 0.6, deg(t.v - t.w) + t.lean * 0.25);
  const [c2x, c2y] = polar(r + t.len * 0.3, deg(t.v + t.w) + t.lean * 0.8);
  const f = (n: number) => n.toFixed(1);
  return `M${f(b1x)} ${f(b1y)} Q${f(c1x)} ${f(c1y)} ${f(tx)} ${f(ty)} Q${f(c2x)} ${f(c2y)} ${f(b2x)} ${f(b2y)} Z`;
}

function Ring({ category, level, enabled }: { category: AutoPitchCategory; level: number; enabled: boolean }) {
  const color = COLORS[category];
  const lit = (v: number) => enabled && v <= level + 1e-6;

  if (category === "hipHop") {
    const band = (from: number, to: number) => {
      const pts: string[] = [];
      const steps = 120;
      for (let i = 0; i <= steps; i++) {
        const v = from + ((to - from) * i) / steps;
        const [x, y] = polar(flameBand(v), START + SWEEP * v);
        pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      for (let i = steps; i >= 0; i--) {
        const v = from + ((to - from) * i) / steps;
        const [x, y] = polar(69, START + SWEEP * v);
        pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      return pts.join(" ");
    };
    const cut = enabled ? level : 0;
    const [ex, ey] = polar(flameBand(0.9) + 12, START + SWEEP * 0.9 + 10);
    return (
      <>
        <polygon points={band(0, 1)} fill={INACTIVE} />
        {cut > 0.001 && <polygon points={band(0, cut)} fill={color} />}
        {TONGUES.map((t) => (
          <path key={t.v} d={tonguePath(t)} fill={lit(t.v) ? color : INACTIVE} />
        ))}
        <circle cx={ex} cy={ey} r={4} fill={lit(0.9) ? color : INACTIVE} />
      </>
    );
  }

  if (category === "sciFi") {
    const wave = (from: number, to: number) => {
      const pts: string[] = [];
      const steps = 240;
      for (let i = 0; i <= steps; i++) {
        const v = from + ((to - from) * i) / steps;
        const r = 80 + (3 + 9 * v) * Math.sin(v * Math.PI * 36);
        const [x, y] = polar(r, START + SWEEP * v);
        pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      return pts.join(" ");
    };
    return (
      <>
        <polyline points={wave(0, 1)} stroke={INACTIVE} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {enabled && level > 0.001 && (
          <polyline points={wave(0, level)} stroke={color} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </>
    );
  }

  // Essentials (even blue ticks growing clockwise) and Hyperpop (ragged spikes)
  const count = category === "hyperpop" ? 58 : 46;
  const ticks = [];
  for (let i = 0; i < count; i++) {
    const v = i / (count - 1);
    const deg = START + SWEEP * v;
    let r1 = 72;
    let r2 = 78 + 14 * v;
    let width = 2 + 2.6 * v;
    if (category === "hyperpop") {
      r1 = 72 + hash(i) * 4 * v;
      r2 = 76 + (6 + 22 * v) * (0.35 + 0.65 * hash(i + 99));
      width = 2.2 + 1.6 * v;
    }
    const [x1, y1] = polar(r1, deg);
    const [x2, y2] = polar(r2, deg);
    ticks.push(
      <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={lit(v) ? color : INACTIVE} strokeWidth={width} strokeLinecap="round" />
    );
  }
  return <>{ticks}</>;
}

interface Props {
  category: AutoPitchCategory;
  level: number;
  enabled: boolean;
  onChange: (level: number) => void;
}

/**
 * BandLab's AutoPitch Level knob: a big dark knob with a white pointer and a
 * ring styled per category (blue ticks, flames, orange spikes, cyan wave)
 * that lights up to the current level. Drag up/down (or sideways) to turn
 * it; while touched it shows the value in a "NN %" box, otherwise the label
 * ("Lo más intenso" at the top, "Off" when AutoPitch is off).
 */
export function AutoPitchKnob({ category, level, enabled, onChange }: Props) {
  const drag = useRef<{ y: number; x: number; start: number } | null>(null);
  const [showValue, setShowValue] = useState(false);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
  }, []);

  const pointer = useMemo(() => {
    const deg = START + SWEEP * (enabled ? level : 0);
    const [x1, y1] = polar(26, deg);
    const [x2, y2] = polar(46, deg);
    return { x1, y1, x2, y2 };
  }, [level, enabled]);

  function flashValue() {
    setShowValue(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setShowValue(false), 1500);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!enabled) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, x: e.clientX, start: level };
    flashValue();
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const delta = (d.y - e.clientY + (e.clientX - d.x)) / 220;
    onChange(Math.min(1, Math.max(0, Math.round((d.start + delta) * 100) / 100)));
    flashValue();
  }

  function onPointerUp() {
    drag.current = null;
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!enabled) return;
    const step = e.key === "ArrowUp" || e.key === "ArrowRight" ? 0.05 : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -0.05 : 0;
    if (!step) return;
    e.preventDefault();
    onChange(Math.min(1, Math.max(0, Math.round((level + step) * 100) / 100)));
    flashValue();
  }

  return (
    <div className="flex flex-col items-center">
      <div
        role="slider"
        tabIndex={0}
        aria-label="Nivel de AutoPitch"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(level * 100)}
        aria-disabled={!enabled}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className="touch-none select-none outline-none"
        style={{ width: 200, height: 200 }}
      >
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={200} height={200}>
          <Ring category={category} level={level} enabled={enabled} />
          <circle cx={C} cy={C} r={BODY_R} fill="#24272e" />
          <circle cx={C} cy={C} r={BODY_R - 1} fill="none" stroke="#2e3139" strokeWidth={2} />
          <line {...pointer} stroke="#f4f4f5" strokeWidth={5} strokeLinecap="round" />
        </svg>
      </div>
      <div className="mt-1 flex h-8 items-center justify-center">
        {showValue && enabled ? (
          <span className="rounded-md bg-[#15171b] px-2.5 py-1 text-sm tabular-nums text-bone">
            {Math.round(level * 100)} <span className="text-bone-3">%</span>
          </span>
        ) : (
          <span className="text-[15px] text-bone-3">{autoPitchLevelLabel(level, enabled)}</span>
        )}
      </div>
    </div>
  );
}
