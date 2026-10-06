"use client";

import { useId } from "react";
import { FX_CATALOG } from "@/lib/fx/catalog";
import type { EffectType } from "@/types/effects";
import type { CoverPattern, FxCover } from "@/types/fxPresets";
import { FxArt } from "./scenes";

/** Square cover of an effect (library rows, the chain strip): the middle
 * of its scene (scenes.tsx), animated where there is room to look at it. */
export function FxTile({ type, size = 44, dim = false, animated = false }: { type: EffectType; size?: number; dim?: boolean; animated?: boolean }) {
  if (type === "pitchCorrection") return <div style={{ width: size, height: size }} className="rounded-lg bg-surf-3" />;
  const { skin } = FX_CATALOG[type];
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-[12px]"
      style={{ width: size, height: size, background: skin.panel, opacity: dim ? 0.4 : 1, filter: dim ? "grayscale(1)" : undefined, boxShadow: `0 2px 10px rgba(0,0,0,.35), inset 0 0 0 1px rgba(255,255,255,.1)` }}
    >
      <FxArt type={type} animated={animated && !dim} className="block h-full w-full" />
      <div className="pointer-events-none absolute inset-0 rounded-[12px]" style={{ background: "linear-gradient(160deg, rgba(255,255,255,.16) 0%, rgba(255,255,255,0) 42%)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.1)" }} />
    </div>
  );
}

/** Pattern layer of a preset cover, drawn in white over the two-colour
 * gradient (viewBox 100x100). `u` makes gradient ids unique per cover. */
const PATTERNS: Record<CoverPattern, (from: string, u: (k: string) => string) => React.ReactNode> = {
  waves: () =>
    [0, 1, 2, 3, 4, 5].map((i) => <path key={i} d={`M-10 ${30 + i * 14} Q 25 ${10 + i * 14} 50 ${30 + i * 14} T 110 ${30 + i * 14}`} stroke="#fff" strokeOpacity={0.5 - i * 0.05} strokeWidth={2.6} fill="none" />),
  rings: () => [12, 24, 36, 48, 60].map((r, i) => <circle key={r} cx={70} cy={30} r={r} stroke="#fff" strokeOpacity={0.55 - i * 0.08} strokeWidth={2.6} fill="none" />),
  grid: () => (
    <>
      {[20, 40, 60, 80].map((v) => (
        <g key={v}>
          <line x1={v} y1={0} x2={v} y2={100} stroke="#fff" strokeOpacity={0.3} strokeWidth={1.2} />
          <line x1={0} y1={v} x2={100} y2={v} stroke="#fff" strokeOpacity={0.3} strokeWidth={1.2} />
        </g>
      ))}
      <circle cx={60} cy={40} r={9} fill="#fff" fillOpacity={0.25} />
      <circle cx={60} cy={40} r={4.5} fill="#fff" />
    </>
  ),
  diagonal: () => [-60, -30, 0, 30, 60, 90].map((o, i) => <line key={o} x1={o} y1={100} x2={o + 100} y2={0} stroke="#fff" strokeOpacity={0.18 + (i % 2) * 0.22} strokeWidth={9} />),
  dots: () => [15, 35, 55, 75].flatMap((y) => [15, 35, 55, 75].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r={((x + y) % 40) / 10 + 2.5} fill="#fff" fillOpacity={0.5} />)),
  bars: () => [10, 24, 38, 52, 66, 80].map((x, i) => <rect key={x} x={x} y={100 - [40, 70, 55, 85, 45, 65][i]} width={9} height={[40, 70, 55, 85, 45, 65][i]} rx={3} fill="#fff" fillOpacity={0.55} />),
  noise: () =>
    Array.from({ length: 70 }, (_, i) => {
      const x = (i * 37) % 100;
      const y = (i * 61) % 100;
      return <rect key={i} x={x} y={y} width={4} height={4} fill="#fff" fillOpacity={((i * 13) % 10) / 16 + 0.1} />;
    }),
  nebula: (_f, u) => (
    <>
      <defs>
        <radialGradient id={u("n")}>
          <stop offset="0" stopColor="#fff" stopOpacity={0.55} />
          <stop offset="1" stopColor="#fff" stopOpacity={0} />
        </radialGradient>
      </defs>
      <ellipse cx={40} cy={44} rx={44} ry={26} fill={`url(#${u("n")})`} transform="rotate(-20 40 44)" />
      <ellipse cx={66} cy={64} rx={34} ry={20} fill={`url(#${u("n")})`} opacity={0.7} />
      {STARS.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity={0.5 + (i % 3) * 0.2} />
      ))}
      <path d="M52 50 L53.2 46.8 L56.4 45.6 L53.2 44.4 L52 41.2 L50.8 44.4 L47.6 45.6 L50.8 46.8 Z" fill="#fff" transform="translate(-4 4)" />
    </>
  ),
  orbit: () => (
    <>
      {[22, 34, 46].map((r, i) => (
        <circle key={r} cx={50} cy={50} r={r} stroke="#fff" strokeOpacity={0.45 - i * 0.1} strokeWidth={1.2} strokeDasharray={i === 1 ? "2 3" : undefined} fill="none" />
      ))}
      <circle cx={50} cy={50} r={11} fill="#fff" fillOpacity={0.9} />
      {[0, 1, 2, 3].map((i) => {
        const a = (-30 - i * 22) * (Math.PI / 180);
        return <circle key={i} cx={50 + 34 * Math.cos(a)} cy={50 + 34 * Math.sin(a)} r={4.2 - i * 0.8} fill="#fff" opacity={1 - i * 0.25} />;
      })}
      <circle cx={50 + 46 * Math.cos(2.4)} cy={50 + 46 * Math.sin(2.4)} r={2.4} fill="#fff" opacity={0.7} />
    </>
  ),
  aurora: (_f, u) => (
    <>
      <defs>
        <linearGradient id={u("a")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={0} />
          <stop offset="1" stopColor="#fff" stopOpacity={0.6} />
        </linearGradient>
      </defs>
      {STARS.slice(0, 8).map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y * 0.5} r={r * 0.8} fill="#fff" opacity={0.7} />
      ))}
      <path d="M-5 30 C20 14 40 40 60 22 S90 14 105 26 L105 52 C88 40 74 54 58 48 S20 40 -5 60 Z" fill={`url(#${u("a")})`} />
      <path d="M-5 46 C24 32 44 58 66 40 S92 36 105 46 L105 64 C90 56 76 68 60 62 S24 56 -5 72 Z" fill={`url(#${u("a")})`} opacity={0.7} />
      <path d="M-5 100 L-5 82 L16 72 L30 80 L48 66 L64 78 L80 70 L105 82 L105 100 Z" fill="#000" fillOpacity={0.35} />
    </>
  ),
  horizon: (from) => (
    <>
      <circle cx={50} cy={62} r={26} fill="#fff" fillOpacity={0.85} />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={20} y={64 + i * 6} width={60} height={1.6 + i * 0.9} fill={from} />
      ))}
      <rect x={0} y={88} width={100} height={12} fill="#000" fillOpacity={0.3} />
      <line x1={0} y1={88} x2={100} y2={88} stroke="#fff" strokeOpacity={0.7} strokeWidth={1} />
      <line x1={0} y1={30} x2={100} y2={30} stroke="#fff" strokeOpacity={0.4} strokeWidth={1} strokeDasharray="3 3" />
    </>
  ),
  prism: () => (
    <>
      <path d="M0 62 L42 54 L42 56 L0 66 Z" fill="#fff" fillOpacity={0.8} />
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={`M56 ${52 + i} L100 ${24 + i * 14} L100 ${33 + i * 14} L56 ${53 + i} Z`} fill="#fff" fillOpacity={0.2 + i * 0.12} />
      ))}
      <path d="M50 30 L66 64 L34 64 Z" fill="#fff" fillOpacity={0.22} stroke="#fff" strokeWidth={1.4} strokeLinejoin="round" />
    </>
  ),
  dunes: () =>
    [0, 1, 2, 3].map((i) => (
      <path key={i} d={`M-5 ${48 + i * 14} C20 ${36 + i * 14} 40 ${58 + i * 14} 62 ${46 + i * 14} S90 ${40 + i * 14} 105 ${50 + i * 14} L105 110 L-5 110 Z`} fill="#fff" fillOpacity={0.1 + i * 0.08} />
    )),
};

const STARS: [number, number, number][] = [
  [12, 14, 0.9],
  [30, 8, 0.6],
  [84, 12, 1.1],
  [70, 30, 0.6],
  [92, 46, 0.8],
  [18, 70, 0.7],
  [36, 88, 0.6],
  [76, 86, 1],
  [58, 16, 0.5],
  [8, 44, 0.6],
  [46, 74, 0.5],
  [88, 70, 0.6],
];

/** A preset's cover: two colours + a pattern, or the user's photo. A soft
 * light from the top-left and a shade at the bottom give it depth. */
export function CoverArt({ cover, size, className = "" }: { cover: FxCover | null; size?: number; className?: string }) {
  const raw = useId();
  const base = `cv${raw.replace(/[^a-zA-Z0-9]/g, "")}`;
  const u = (k: string) => `${base}${k}`;
  const style = size ? { width: size, height: size } : undefined;
  if (!cover) return <div className={`rounded-xl border border-white/15 bg-transparent ${className}`} style={style} />;
  if (cover.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={cover.dataUrl} alt="" className={`rounded-xl object-cover ${className}`} style={style} />;
  }
  return (
    <div className={`overflow-hidden rounded-xl ${className}`} style={{ ...style, background: `linear-gradient(135deg, ${cover.from}, ${cover.to})`, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.12)" }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
        <defs>
          <radialGradient id={u("light")} cx="0.15" cy="0.1" r="0.8">
            <stop offset="0" stopColor="#fff" stopOpacity={0.32} />
            <stop offset="1" stopColor="#fff" stopOpacity={0} />
          </radialGradient>
          <linearGradient id={u("shade")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.55" stopColor="#000" stopOpacity={0} />
            <stop offset="1" stopColor="#000" stopOpacity={0.32} />
          </linearGradient>
        </defs>
        {PATTERNS[cover.pattern](cover.from, u)}
        <rect width="100" height="100" fill={`url(#${u("light")})`} />
        <rect width="100" height="100" fill={`url(#${u("shade")})`} />
      </svg>
    </div>
  );
}

/** Cover choices offered when saving a preset (BandLab's colour swatches). */
export const COVER_CHOICES: FxCover[] = [
  { kind: "art", from: "#3a1c71", to: "#d76d77", pattern: "nebula" },
  { kind: "art", from: "#ff3d7f", to: "#ffb800", pattern: "horizon" },
  { kind: "art", from: "#0f4a52", to: "#7ef0ff", pattern: "orbit" },
  { kind: "art", from: "#0f2027", to: "#2c5364", pattern: "aurora" },
  { kind: "art", from: "#141e30", to: "#9b6bff", pattern: "prism" },
  { kind: "art", from: "#d1913c", to: "#ffd194", pattern: "dunes" },
  { kind: "art", from: "#11998e", to: "#38ef7d", pattern: "waves" },
  { kind: "art", from: "#1a1a1a", to: "#e5243b", pattern: "diagonal" },
  { kind: "art", from: "#c7c9ff", to: "#2c2f86", pattern: "rings" },
  { kind: "art", from: "#fceabb", to: "#f8b500", pattern: "dots" },
  { kind: "art", from: "#232526", to: "#414345", pattern: "bars" },
  { kind: "art", from: "#7ef0ff", to: "#0a2f35", pattern: "grid" },
];
