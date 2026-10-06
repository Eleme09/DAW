"use client";

import { FX_CATALOG } from "@/lib/fx/catalog";
import type { EffectType } from "@/types/effects";
import type { CoverPattern, FxCover } from "@/types/fxPresets";

/** Small square "faceplate" for an effect (library rows, the chain strip):
 * the effect's own panel colour with a glyph of what it does. */
export function FxTile({ type, size = 44, dim = false }: { type: EffectType; size?: number; dim?: boolean }) {
  if (type === "pitchCorrection") return <div style={{ width: size, height: size }} className="rounded-lg bg-surf-3" />;
  const { skin } = FX_CATALOG[type];
  const a = skin.accent;
  const ink = skin.light ? "#1b1b1d" : "#f2ede4";
  const glyph = (() => {
    switch (type) {
      case "eq":
        return (
          <>
            <path d="M4 26 C 10 26, 11 14, 16 14 S 22 30, 27 22 S 33 10, 36 10" stroke={a} strokeWidth={2.4} fill="none" />
            <circle cx={16} cy={14} r={2.6} fill="#ff6b6b" />
            <circle cx={27} cy={22} r={2.6} fill="#c58bff" />
          </>
        );
      case "compressor":
        return (
          <>
            <rect x={8} y={7} width={24} height={14} rx={2} fill="#f3e9cf" />
            <line x1={20} y1={21} x2={14} y2={10} stroke="#1b1b1d" strokeWidth={1.2} />
            <circle cx={13} cy={29} r={4} fill="#2a2a2c" />
            <circle cx={27} cy={29} r={4} fill="#2a2a2c" />
          </>
        );
      case "multibandCompressor":
        return [8, 18, 28].map((x, i) => <rect key={x} x={x} y={12 + i * 3} width={6} height={20 - i * 3} rx={1.5} fill={a} opacity={0.6 + i * 0.2} />);
      case "limiter":
        return (
          <>
            <line x1={5} y1={12} x2={35} y2={12} stroke={a} strokeWidth={2} />
            <path d="M5 30 L11 18 L15 26 L19 12 L23 12 L26 24 L30 14 L35 30" stroke={ink} strokeWidth={1.8} fill="none" />
          </>
        );
      case "clipper":
        return <path d="M4 28 L12 28 L14 10 L26 10 L28 28 L36 28" stroke={a} strokeWidth={2.4} fill="none" />;
      case "noiseGate":
        return (
          <>
            <rect x={8} y={8} width={10} height={24} rx={1.5} fill={ink} opacity={0.25} />
            <rect x={22} y={8} width={10} height={24} rx={1.5} fill={a} />
          </>
        );
      case "deesser":
        return (
          <text x={20} y={27} textAnchor="middle" fontSize={18} fontWeight={800} fill={a} fontFamily="ui-sans-serif,system-ui">
            S
          </text>
        );
      case "saturation":
        return (
          <>
            <rect x={14} y={6} width={12} height={22} rx={6} fill="none" stroke={ink} strokeWidth={1.6} />
            <path d="M17 22 Q20 12 23 22" stroke={a} strokeWidth={2} fill="none" style={{ filter: `drop-shadow(0 0 3px ${a})` }} />
            <rect x={12} y={28} width={16} height={5} rx={1} fill={ink} opacity={0.5} />
          </>
        );
      case "exciter":
        return [10, 20, 30].map((x, i) => <path key={x} d={`M${x} 30 L${x} ${18 - i * 4}`} stroke={a} strokeWidth={2.4} strokeLinecap="round" />);
      case "reverb":
        return [6, 11, 16].map((r) => <circle key={r} cx={20} cy={20} r={r} fill="none" stroke={a} strokeOpacity={1 - r / 22} strokeWidth={2} />);
      case "delay":
        return [6, 15, 23, 30].map((x, i) => <rect key={x} x={x} y={20 - (14 - i * 3)} width={4} height={(14 - i * 3) * 2} rx={2} fill={i === 0 ? ink : a} opacity={i === 0 ? 1 : 1 - i * 0.2} />);
      case "chorus":
        return (
          <>
            <path d="M4 20 Q12 10 20 20 T36 20" stroke={a} strokeWidth={2.2} fill="none" />
            <path d="M4 24 Q12 14 20 24 T36 24" stroke={a} strokeWidth={1.4} strokeOpacity={0.5} fill="none" />
          </>
        );
      case "flanger":
        return <path d="M4 20 Q8 6 12 20 T20 20 T28 20 T36 20" stroke={a} strokeWidth={2.2} fill="none" />;
      case "autoPan":
        return (
          <>
            <path d="M8 20 L32 20" stroke={ink} strokeOpacity={0.3} strokeWidth={2} />
            <circle cx={27} cy={20} r={5} fill={a} />
          </>
        );
      case "stereoWidth":
        return <path d="M20 32 L6 10 M20 32 L34 10" stroke={a} strokeWidth={2.4} strokeLinecap="round" />;
      case "vocoder":
        return [6, 11, 16, 21, 26, 31].map((x, i) => <rect key={x} x={x} y={30 - [8, 16, 22, 14, 18, 10][i]} width={3.5} height={[8, 16, 22, 14, 18, 10][i]} fill={a} />);
      case "pitchShift":
        return (
          <>
            <path d="M5 27 Q 9 21, 13 27 T 21 27" stroke={ink} strokeOpacity={0.45} strokeWidth={2} fill="none" />
            <path d="M19 15 Q 23 9, 27 15 T 35 15" stroke={a} strokeWidth={2.4} fill="none" />
            <path d="M13 21 L 20 14 M 20 14 L 15.5 14.5 M 20 14 L 19.5 18.5" stroke={a} strokeWidth={1.8} strokeLinecap="round" fill="none" />
          </>
        );
    }
  })();
  return (
    <div className="shrink-0 overflow-hidden rounded-[10px]" style={{ width: size, height: size, background: skin.panel, opacity: dim ? 0.45 : 1, boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)" }}>
      <svg viewBox="0 0 40 40" width={size} height={size}>
        {glyph}
      </svg>
    </div>
  );
}

const PATTERNS: Record<CoverPattern, (from: string, to: string) => React.ReactNode> = {
  waves: (_f, t) =>
    [0, 1, 2, 3, 4, 5].map((i) => <path key={i} d={`M-10 ${30 + i * 14} Q 25 ${10 + i * 14} 50 ${30 + i * 14} T 110 ${30 + i * 14}`} stroke={t} strokeOpacity={0.55} strokeWidth={3} fill="none" />),
  rings: (_f, t) => [12, 24, 36, 48, 60].map((r) => <circle key={r} cx={70} cy={30} r={r} stroke={t} strokeOpacity={0.5} strokeWidth={3} fill="none" />),
  grid: (_f, t) => (
    <>
      {[20, 40, 60, 80].map((v) => (
        <g key={v}>
          <line x1={v} y1={0} x2={v} y2={100} stroke={t} strokeOpacity={0.4} strokeWidth={1.5} />
          <line x1={0} y1={v} x2={100} y2={v} stroke={t} strokeOpacity={0.4} strokeWidth={1.5} />
        </g>
      ))}
      <circle cx={60} cy={40} r={6} fill={t} />
    </>
  ),
  diagonal: (_f, t) => [-60, -30, 0, 30, 60, 90].map((o) => <line key={o} x1={o} y1={100} x2={o + 100} y2={0} stroke={t} strokeOpacity={0.5} strokeWidth={9} />),
  dots: (_f, t) =>
    [15, 35, 55, 75].flatMap((y) => [15, 35, 55, 75].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r={((x + y) % 40) / 10 + 2.5} fill={t} fillOpacity={0.55} />)),
  bars: (_f, t) => [10, 24, 38, 52, 66, 80].map((x, i) => <rect key={x} x={x} y={100 - [40, 70, 55, 85, 45, 65][i]} width={9} height={[40, 70, 55, 85, 45, 65][i]} rx={3} fill={t} fillOpacity={0.65} />),
  noise: (_f, t) =>
    Array.from({ length: 70 }, (_, i) => {
      const x = (i * 37) % 100;
      const y = (i * 61) % 100;
      return <rect key={i} x={x} y={y} width={4} height={4} fill={t} fillOpacity={((i * 13) % 10) / 14 + 0.15} />;
    }),
};

/** A preset's cover: two colours + a pattern, or the user's photo. */
export function CoverArt({ cover, size, className = "" }: { cover: FxCover | null; size?: number; className?: string }) {
  const style = size ? { width: size, height: size } : undefined;
  if (!cover) return <div className={`rounded-xl border border-white/15 bg-transparent ${className}`} style={style} />;
  if (cover.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={cover.dataUrl} alt="" className={`rounded-xl object-cover ${className}`} style={style} />;
  }
  return (
    <div className={`overflow-hidden rounded-xl ${className}`} style={{ ...style, background: `linear-gradient(135deg, ${cover.from}, ${cover.to})` }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
        {PATTERNS[cover.pattern](cover.from, cover.to === cover.from ? "#fff" : mixLight(cover.to))}
      </svg>
    </div>
  );
}

function mixLight(hex: string): string {
  return /^#[0-9a-f]{6}$/i.test(hex) ? "#ffffff" : hex;
}

/** Cover choices offered when saving a preset (BandLab's colour swatches). */
export const COVER_CHOICES: FxCover[] = [
  { kind: "art", from: "#ff3d7f", to: "#ffb800", pattern: "rings" },
  { kind: "art", from: "#11998e", to: "#38ef7d", pattern: "waves" },
  { kind: "art", from: "#3a1c71", to: "#d76d77", pattern: "waves" },
  { kind: "art", from: "#1a1a1a", to: "#e5243b", pattern: "diagonal" },
  { kind: "art", from: "#0f2027", to: "#2c5364", pattern: "bars" },
  { kind: "art", from: "#fceabb", to: "#f8b500", pattern: "dots" },
  { kind: "art", from: "#c7c9ff", to: "#2c2f86", pattern: "rings" },
  { kind: "art", from: "#d1913c", to: "#ffd194", pattern: "noise" },
  { kind: "art", from: "#7ef0ff", to: "#0a2f35", pattern: "grid" },
];
