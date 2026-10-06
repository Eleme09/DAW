"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import type { EffectType } from "@/types/effects";

/**
 * Cover art for each effect: a small animated scene in a 200x120 box (the
 * plugin card's header shows it wide; tiles crop the middle 120x120, so
 * the subject sits in x 40-160). Motion is plain CSS (globals.css, `fxa-*`):
 * slow, transform/opacity only, off with `animated={false}` and under
 * prefers-reduced-motion. No SVG filters - blur repaints are what costs on
 * an iPhone - glows are radial gradients.
 */

export type SceneType = Exclude<EffectType, "pitchCorrection">;

type U = (key: string) => string;

/** Deterministic PRNG so stars land in the same place on every render. */
function prng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function Stars({ seed, n, color = "#ffffff", twinkle = 0.35, maxY = 120 }: { seed: number; n: number; color?: string; twinkle?: number; maxY?: number }) {
  const r = prng(seed);
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const x = r() * 200;
        const y = r() * maxY;
        const size = 0.35 + r() * r() * 1.4;
        const o = 0.3 + r() * 0.6;
        const tw = r() < twinkle;
        const style: CSSProperties | undefined = tw ? { animationDuration: `${2.4 + r() * 3.2}s`, animationDelay: `${(-r() * 5).toFixed(2)}s` } : undefined;
        return <circle key={i} cx={x} cy={y} r={size} fill={color} opacity={o} className={tw ? "fxa-tw" : undefined} style={style} />;
      })}
    </g>
  );
}

/** A four-point sparkle centred on (x, y). */
function Sparkle({ x, y, s = 5, color = "#fff", delay = 0, dur = 3.6 }: { x: number; y: number; s?: number; color?: string; delay?: number; dur?: number }) {
  const d = `M0 ${-s} L${s * 0.18} ${-s * 0.18} L${s} 0 L${s * 0.18} ${s * 0.18} L0 ${s} L${-s * 0.18} ${s * 0.18} L${-s} 0 L${-s * 0.18} ${-s * 0.18} Z`;
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d={d} fill={color} className="fxa-tw" style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s` }} />
    </g>
  );
}

function Glow({ id, color, opacity = 0.6 }: { id: string; color: string; opacity?: number }) {
  return (
    <radialGradient id={id}>
      <stop offset="0" stopColor={color} stopOpacity={opacity} />
      <stop offset="1" stopColor={color} stopOpacity={0} />
    </radialGradient>
  );
}

const vars = (o: Record<string, string>, extra?: CSSProperties): CSSProperties => ({ ...(o as CSSProperties), ...extra });
const anim = (dur: number, delay = 0, origin?: string): CSSProperties => ({ animationDuration: `${dur}s`, animationDelay: `${delay}s`, ...(origin ? { transformOrigin: origin } : {}) });
const url = (u: U, k: string) => `url(#${u(k)})`;

function wavePath(y: number, amp: number, len: number, x0 = -40, x1 = 240): string {
  let d = `M${x0} ${y}`;
  for (let x = x0; x < x1; x += len) d += ` q${len / 4} ${-amp} ${len / 2} 0 t${len / 2} 0`;
  return d;
}

const SPECTRUM = ["#ff4d5e", "#ff9f1c", "#ffe14d", "#4dff88", "#4dc3ff", "#9b6bff"];

const SCENES: Record<SceneType, (u: U) => ReactNode> = {
  // Prisma — a beam split into its colours: the EQ's bands.
  eq: (u) => (
    <>
      <defs>
        <linearGradient id={u("bg")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#151c2e" />
          <stop offset="1" stopColor="#05070c" />
        </linearGradient>
        <linearGradient id={u("glass")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity={0.55} />
          <stop offset="0.55" stopColor="#9fb4ff" stopOpacity={0.14} />
          <stop offset="1" stopColor="#ffffff" stopOpacity={0.4} />
        </linearGradient>
        <linearGradient id={u("beam")} x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={0} />
          <stop offset="1" stopColor="#fff" stopOpacity={0.95} />
        </linearGradient>
        <Glow id={u("halo")} color="#f2b84b" opacity={0.35} />
      </defs>
      <rect width="200" height="120" fill={url(u, "bg")} />
      <Stars seed={3} n={28} />
      <circle cx="100" cy="62" r="46" fill={url(u, "halo")} />
      <path d="M0 77 L85 60.5 L85 63.5 L0 84 Z" fill={url(u, "beam")} />
      {SPECTRUM.map((c, i) => {
        const y0 = 55 + i * 1.6;
        const x0 = 100 + (26 * (y0 - 34)) / 48;
        return <path key={c} className="fxa-glow" style={anim(3.4, -i * 0.5)} d={`M${x0} ${y0} L200 ${20 + i * 14} L200 ${33 + i * 14} L${x0} ${y0 + 1.6} Z`} fill={c} opacity={0.85} />;
      })}
      <path d="M100 34 L126 82 L74 82 Z" fill={url(u, "glass")} stroke="#fff" strokeOpacity={0.75} strokeWidth={1.4} strokeLinejoin="round" />
      <path d="M100 34 L92 82" stroke="#fff" strokeOpacity={0.22} strokeWidth={1} />
      <Sparkle x={100} y={34} s={6} delay={-1} />
    </>
  ),

  // Gravedad — a heavy body bending space; what passes falls in. Compression.
  compressor: (u) => (
    <>
      <defs>
        <radialGradient id={u("bg")} cx="0.5" cy="0.45" r="0.75">
          <stop offset="0" stopColor="#2b2620" />
          <stop offset="1" stopColor="#080706" />
        </radialGradient>
        <radialGradient id={u("ball")} cx="0.35" cy="0.3" r="0.75">
          <stop offset="0" stopColor="#fffaf0" />
          <stop offset="0.45" stopColor="#d9cdb0" />
          <stop offset="1" stopColor="#4d473d" />
        </radialGradient>
        <Glow id={u("well")} color="#b3261e" opacity={0.55} />
      </defs>
      <rect width="200" height="120" fill={url(u, "bg")} />
      <Stars seed={7} n={18} color="#f3e9cf" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => {
        const y = 36 + i * 10;
        const d = 18 * Math.exp(-(((y - 64) / 20) ** 2));
        return <path key={i} d={`M-10 ${y} C60 ${y} 72 ${y + d} 100 ${y + d} S140 ${y} 210 ${y}`} stroke="#e8dcc0" strokeOpacity={0.2} strokeWidth={0.8} fill="none" />;
      })}
      {[40, 55, 70, 85, 115, 130, 145, 160].map((x) => (
        <path key={x} d={`M${x} 26 Q${x + (100 - x) * 0.5} 70 ${x} 108`} stroke="#e8dcc0" strokeOpacity={0.14} strokeWidth={0.8} fill="none" />
      ))}
      <ellipse cx="100" cy="70" rx="40" ry="11" fill={url(u, "well")} />
      {[
        [-64, -26],
        [62, -22],
        [-56, 24],
        [66, 20],
        [-30, -36],
        [34, 34],
      ].map(([fx, fy], i) => (
        <g key={i} transform="translate(100 57)">
          <circle r={1.7} fill="#f3e9cf" className="fxa-fall" style={vars({ "--fx": `${fx}px`, "--fy": `${fy}px` }, anim(3.2, -i * 0.55))} />
        </g>
      ))}
      <g transform="rotate(-12 100 57)">
        <path d="M74 57 A26 6 0 0 1 126 57" stroke="#e0453a" strokeOpacity={0.55} strokeWidth={1.6} fill="none" />
      </g>
      <circle cx="100" cy="57" r="15" fill={url(u, "ball")} />
      <g transform="rotate(-12 100 57)">
        <path d="M74 57 A26 6 0 0 0 126 57" stroke="#e0453a" strokeWidth={1.8} fill="none" />
      </g>
    </>
  ),

  // Estratos — three layers of terrain breathing on their own: three bands.
  multibandCompressor: (u) => (
    <>
      <defs>
        <linearGradient id={u("bg")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0c2422" />
          <stop offset="1" stopColor="#030b0b" />
        </linearGradient>
        <Glow id={u("moon")} color="#4fd1c5" opacity={0.45} />
      </defs>
      <rect width="200" height="120" fill={url(u, "bg")} />
      <Stars seed={11} n={24} color="#bff5ef" maxY={60} />
      <circle cx="122" cy="40" r="14" fill={url(u, "moon")} />
      <circle cx="122" cy="40" r="4" fill="#d9fffb" />
      {[
        { y: 52, a: 6, len: 64, fill: "#3fb7ac", o: 0.35, dur: 5 },
        { y: 68, a: 5, len: 52, fill: "#24877e", o: 0.75, dur: 6.5 },
        { y: 84, a: 4, len: 44, fill: "#0f4a45", o: 1, dur: 8 },
      ].map((l, i) => (
        <g key={i} className="fxa-breathe" style={anim(l.dur, -i * 1.3)}>
          <path d={`${wavePath(l.y, l.a, l.len, -40 - i * 11)} L240 140 L-40 140 Z`} fill={l.fill} fillOpacity={l.o} stroke="#4fd1c5" strokeOpacity={0.85 - i * 0.15} strokeWidth={1.2} />
        </g>
      ))}
    </>
  ),

  // Horizonte — a sunset whose light never passes the line: the ceiling.
  limiter: (u) => {
    const r = prng(19);
    return (
      <>
        <defs>
          <linearGradient id={u("bg")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#07060b" />
            <stop offset="0.45" stopColor="#2a0b16" />
            <stop offset="0.62" stopColor="#5e1222" />
          </linearGradient>
          <linearGradient id={u("ground")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1a070b" />
            <stop offset="1" stopColor="#040203" />
          </linearGradient>
          <Glow id={u("sun")} color="#ff4b3a" opacity={0.6} />
          <linearGradient id={u("bar")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#ff8a7a" stopOpacity={0.5} />
          </linearGradient>
        </defs>
        <rect width="200" height="120" fill={url(u, "bg")} />
        <Stars seed={17} n={20} maxY={50} />
        <circle cx="100" cy="76" r="44" fill={url(u, "sun")} />
        <circle cx="100" cy="76" r="17" fill="#ff7448" />
        <circle cx="100" cy="76" r="11" fill="#ffc38a" />
        {Array.from({ length: 13 }, (_, i) => {
          const x = 46 + i * 9;
          const h = 0.3 + r() * 0.6;
          return <rect key={i} x={x - 1.2} y={44} width={2.4} height={32} rx={1.2} fill={url(u, "bar")} opacity={0.55} className="fxa-meter" style={{ ...anim(1 + r() * 0.9, -r() * 2, `${x}px 76px`), transform: `scaleY(${h})` }} />;
        })}
        <line x1="0" y1="43.5" x2="200" y2="43.5" stroke="#ff3b4e" strokeWidth={1.3} strokeDasharray="4 3" />
        <rect y="76" width="200" height="44" fill={url(u, "ground")} />
        <line x1="0" y1="76" x2="200" y2="76" stroke="#ff9a7a" strokeOpacity={0.8} strokeWidth={1} />
      </>
    );
  },

  // Filo — a wave sliced flat, and the glint of the blade that did it.
  clipper: (u) => {
    const pts: string[] = [];
    for (let x = -4; x <= 204; x += 2) pts.push(`${x},${Math.max(46, Math.min(74, 60 - 32 * Math.sin((2 * Math.PI * x) / 56))).toFixed(1)}`);
    const wave = `M${pts.join(" L")}`;
    return (
      <>
        <defs>
          <linearGradient id={u("bg")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#22110a" />
            <stop offset="1" stopColor="#060302" />
          </linearGradient>
          <linearGradient id={u("glint")} x1="0" x2="1">
            <stop offset="0" stopColor="#fff" stopOpacity={0} />
            <stop offset="0.5" stopColor="#fff" stopOpacity={0.55} />
            <stop offset="1" stopColor="#fff" stopOpacity={0} />
          </linearGradient>
          <Glow id={u("ember")} color="#ff7a1a" opacity={0.35} />
        </defs>
        <rect width="200" height="120" fill={url(u, "bg")} />
        <ellipse cx="100" cy="60" rx="80" ry="34" fill={url(u, "ember")} />
        <line x1="0" y1="46" x2="200" y2="46" stroke="#ff7a1a" strokeOpacity={0.35} strokeDasharray="2 3" />
        <line x1="0" y1="74" x2="200" y2="74" stroke="#ff7a1a" strokeOpacity={0.35} strokeDasharray="2 3" />
        <path d={wave} stroke="#ff7a1a" strokeOpacity={0.2} strokeWidth={7} fill="none" strokeLinejoin="round" />
        <path d={wave} stroke="#ffb066" strokeWidth={2.2} fill="none" strokeLinejoin="round" />
        {[42, 70, 98, 126, 154].map((x, i) => (
          <circle key={x} cx={x - 8} cy={i % 2 ? 74 : 46} r={1.6} fill="#fff4e0" className="fxa-tw" style={anim(1.6, -i * 0.37)} />
        ))}
        <g className="fxa-sweep" style={anim(4.2)}>
          <path d="M94 16 L104 16 L92 104 L82 104 Z" fill={url(u, "glint")} />
        </g>
      </>
    );
  },

  // Esclusa — a lock gate that opens to let the wave through.
  noiseGate: (u) => (
    <>
      <defs>
        <linearGradient id={u("bg")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#101a12" />
          <stop offset="1" stopColor="#040705" />
        </linearGradient>
        <linearGradient id={u("door")} x1="0" x2="1">
          <stop offset="0" stopColor="#2e4033" />
          <stop offset="1" stopColor="#18221b" />
        </linearGradient>
        <clipPath id={u("frame")}>
          <rect x="66" y="28" width="68" height="64" rx="3" />
        </clipPath>
      </defs>
      <rect width="200" height="120" fill={url(u, "bg")} />
      <Stars seed={23} n={14} color="#cfe8d5" />
      <path d={wavePath(60, 12, 30)} stroke="#8fb89a" strokeOpacity={0.22} strokeWidth={6} fill="none" />
      <path d={wavePath(60, 12, 30)} stroke="#b9e6c4" strokeWidth={1.8} fill="none" />
      <g clipPath={url(u, "frame")}>
        <g className="fxa-doorL" style={anim(5.5)}>
          <rect x="66" y="28" width="34" height="64" fill={url(u, "door")} />
          <line x1="70" y1="44" x2="98" y2="44" stroke="#8fb89a" strokeOpacity={0.45} />
          <line x1="70" y1="76" x2="98" y2="76" stroke="#8fb89a" strokeOpacity={0.45} />
          <line x1="99.5" y1="28" x2="99.5" y2="92" stroke="#b9e6c4" strokeOpacity={0.7} />
        </g>
        <g className="fxa-doorR" style={anim(5.5)}>
          <rect x="100" y="28" width="34" height="64" fill={url(u, "door")} />
          <line x1="102" y1="44" x2="130" y2="44" stroke="#8fb89a" strokeOpacity={0.45} />
          <line x1="102" y1="76" x2="130" y2="76" stroke="#8fb89a" strokeOpacity={0.45} />
          <line x1="100.5" y1="28" x2="100.5" y2="92" stroke="#b9e6c4" strokeOpacity={0.7} />
        </g>
      </g>
      <rect x="66" y="28" width="68" height="64" rx="3" stroke="#8fb89a" strokeOpacity={0.7} strokeWidth={1.6} fill="none" />
      <circle cx="100" cy="22" r="2.4" fill="#8fff9f" className="fxa-tw" style={anim(5.5)} />
    </>
  ),

  // Sibila — the oracle's S; the hiss drifts off and is cut at the line.
  deesser: (u) => (
    <>
      <defs>
        <radialGradient id={u("bg")} cx="0.5" cy="0.5" r="0.7">
          <stop offset="0" stopColor="#123241" />
          <stop offset="1" stopColor="#04090c" />
        </radialGradient>
        <linearGradient id={u("s")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#dff8ff" />
          <stop offset="1" stopColor="#5ec8e5" />
        </linearGradient>
      </defs>
      <rect width="200" height="120" fill={url(u, "bg")} />
      <Stars seed={29} n={20} color="#c8f2ff" />
      <circle cx="100" cy="60" r="31" stroke="#5ec8e5" strokeOpacity={0.28} fill="none" />
      <circle cx="100" cy="60" r="41" stroke="#5ec8e5" strokeOpacity={0.12} fill="none" />
      <path d="M116 40 C106 31 84 33 86 46 C88 58 116 59 115 74 C114 88 90 90 82 80" stroke="#5ec8e5" strokeOpacity={0.2} strokeWidth={14} fill="none" strokeLinecap="round" />
      <path d="M116 40 C106 31 84 33 86 46 C88 58 116 59 115 74 C114 88 90 90 82 80" stroke={url(u, "s")} strokeWidth={6.5} fill="none" strokeLinecap="round" />
      {[38, 46, 53, 60, 67, 74, 82].map((y, i) => (
        <circle key={y} cx={126 + (i % 3) * 3} cy={y} r={1.3} fill="#dff8ff" className="fxa-hiss" style={anim(2.4, -i * 0.33)} />
      ))}
      <line x1="150" y1="30" x2="150" y2="90" stroke="#5ec8e5" strokeOpacity={0.55} strokeDasharray="3 3" />
    </>
  ),

  // Magma — molten blobs rising from a glowing pool: heat and harmonics.
  saturation: (u) => (
    <>
      <defs>
        <linearGradient id={u("bg")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d0402" />
          <stop offset="1" stopColor="#2a0a03" />
        </linearGradient>
        <radialGradient id={u("blob")}>
          <stop offset="0" stopColor="#fff1c2" />
          <stop offset="0.3" stopColor="#ffb347" />
          <stop offset="0.48" stopColor="#ff6a1f" />
          <stop offset="0.52" stopColor="#ff6a1f" stopOpacity={0.35} />
          <stop offset="1" stopColor="#ff4a10" stopOpacity={0} />
        </radialGradient>
        <radialGradient id={u("pool")} cx="0.5" cy="1" r="0.9">
          <stop offset="0" stopColor="#ffcf6a" />
          <stop offset="0.35" stopColor="#ff6a1f" />
          <stop offset="1" stopColor="#ff4a10" stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect width="200" height="120" fill={url(u, "bg")} />
      <ellipse cx="100" cy="118" rx="110" ry="40" fill={url(u, "pool")} />
      {[
        [78, 70, 9, 5.5],
        [104, 52, 12, 7],
        [124, 78, 7, 4.6],
        [90, 36, 6, 6.2],
        [116, 30, 5, 5],
        [66, 46, 4.5, 6.8],
        [138, 50, 5.5, 5.8],
      ].map(([x, y, rad, dur], i) => (
        <circle key={i} cx={x} cy={y} r={rad * 2} fill={url(u, "blob")} className="fxa-rise" style={anim(dur, -i * 1.1, `${x}px ${y}px`)} />
      ))}
      <path d="M-10 104 Q20 98 50 103 T110 101 T170 104 T230 101 L230 130 L-10 130 Z" fill="#ff7a24" fillOpacity={0.85} />
      <path d="M-10 104 Q20 98 50 103 T110 101 T170 104 T230 101" stroke="#ffe08a" strokeWidth={1.2} fill="none" />
    </>
  ),

  // Aurora — northern lights over the ridge: air and shine on top.
  exciter: (u) => (
    <>
      <defs>
        <linearGradient id={u("bg")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#020611" />
          <stop offset="1" stopColor="#0c2232" />
        </linearGradient>
        {[
          ["a", "#6dffb0"],
          ["b", "#5ee0ff"],
          ["c", "#b88cff"],
        ].map(([k, c]) => (
          <linearGradient key={k} id={u(k)} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c} stopOpacity={0} />
            <stop offset="0.65" stopColor={c} stopOpacity={0.5} />
            <stop offset="1" stopColor={c} stopOpacity={0.95} />
          </linearGradient>
        ))}
      </defs>
      <rect width="200" height="120" fill={url(u, "bg")} />
      <Stars seed={31} n={34} />
      <g className="fxa-sway" style={anim(9, 0, "100px 100px")}>
        <path d="M-20 30 C30 10 70 40 110 20 S180 8 230 26 L230 58 C180 40 150 56 110 50 S30 40 -20 66 Z" fill={url(u, "c")} opacity={0.6} />
      </g>
      <g className="fxa-sway" style={anim(7, -2, "100px 100px")}>
        <path d="M-20 40 C30 18 72 54 112 30 S182 20 230 40 L230 70 C182 52 150 70 112 62 S30 50 -20 80 Z" fill={url(u, "a")} />
      </g>
      <g className="fxa-sway" style={anim(11, -5, "100px 100px")}>
        <path d="M-20 56 C40 40 76 70 116 52 S186 46 230 60 L230 80 C186 66 150 82 116 76 S40 66 -20 90 Z" fill={url(u, "b")} opacity={0.7} />
      </g>
      <path d="M-5 120 L-5 96 L24 84 L44 93 L68 74 L90 90 L112 79 L136 95 L158 82 L180 92 L205 84 L205 120 Z" fill="#02050b" />
    </>
  ),

  // Nebulosa — a slowly turning nebula, stars that breathe: the room.
  reverb: (u) => (
    <>
      <defs>
        <radialGradient id={u("bg")} cx="0.5" cy="0.5" r="0.75">
          <stop offset="0" stopColor="#1c1656" />
          <stop offset="1" stopColor="#04031a" />
        </radialGradient>
        <Glow id={u("v")} color="#8a5cff" opacity={0.6} />
        <Glow id={u("p")} color="#ff6ad5" opacity={0.42} />
        <Glow id={u("b")} color="#4b8bff" opacity={0.5} />
        <Glow id={u("core")} color="#e6e4ff" opacity={0.9} />
      </defs>
      <rect width="200" height="120" fill={url(u, "bg")} />
      <g className="fxa-spin" style={anim(70, 0, "100px 60px")}>
        <ellipse cx="84" cy="54" rx="56" ry="30" fill={url(u, "v")} />
        <ellipse cx="120" cy="68" rx="50" ry="26" fill={url(u, "p")} />
        <ellipse cx="100" cy="46" rx="36" ry="32" fill={url(u, "b")} />
      </g>
      <Stars seed={37} n={50} twinkle={0.45} />
      <Sparkle x={62} y={36} s={4.5} delay={-0.8} />
      <Sparkle x={146} y={80} s={3.8} delay={-2.1} dur={4.4} />
      <Sparkle x={136} y={30} s={3} delay={-3} dur={3} />
      <circle cx="100" cy="60" r="16" fill={url(u, "core")} />
      <g className="fxa-glow" style={anim(4)}>
        <line x1="86" y1="60" x2="114" y2="60" stroke="#fff" strokeOpacity={0.7} strokeWidth={0.6} />
        <line x1="100" y1="48" x2="100" y2="72" stroke="#fff" strokeOpacity={0.7} strokeWidth={0.6} />
      </g>
      <circle cx="100" cy="60" r="2.6" fill="#fff" />
    </>
  ),

  // Órbita — a moon with its echoes trailing behind: the repeats.
  delay: (u) => (
    <>
      <defs>
        <radialGradient id={u("bg")} cx="0.5" cy="0.5" r="0.75">
          <stop offset="0" stopColor="#0d3b42" />
          <stop offset="1" stopColor="#020a0c" />
        </radialGradient>
        <radialGradient id={u("planet")} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#d6fdff" />
          <stop offset="0.5" stopColor="#3ab7c4" />
          <stop offset="1" stopColor="#08424a" />
        </radialGradient>
        <Glow id={u("halo")} color="#7ef0ff" opacity={0.35} />
      </defs>
      <rect width="200" height="120" fill={url(u, "bg")} />
      <Stars seed={41} n={34} color="#dffcff" />
      <circle cx="100" cy="60" r="36" stroke="#7ef0ff" strokeOpacity={0.3} strokeWidth={0.8} strokeDasharray="1.5 3" fill="none" />
      <circle cx="100" cy="60" r="27" fill={url(u, "halo")} />
      <circle cx="100" cy="60" r="13" fill={url(u, "planet")} />
      <g className="fxa-spin" style={anim(9, 0, "100px 60px")}>
        {[0, -26, -52, -78, -104].map((deg, i) => {
          const a = (deg * Math.PI) / 180;
          return <circle key={deg} cx={100 + 36 * Math.cos(a)} cy={60 + 36 * Math.sin(a)} r={4.4 - i * 0.6} fill="#eefcfd" opacity={i === 0 ? 1 : 0.55 / i} />;
        })}
      </g>
    </>
  ),

  // Gemelos — a binary star: two voices circling each other.
  chorus: (u) => (
    <>
      <defs>
        <radialGradient id={u("bg")} cx="0.5" cy="0.5" r="0.75">
          <stop offset="0" stopColor="#0f3329" />
          <stop offset="1" stopColor="#020b09" />
        </radialGradient>
        <Glow id={u("g")} color="#6ff2c2" opacity={0.65} />
      </defs>
      <rect width="200" height="120" fill={url(u, "bg")} />
      <Stars seed={43} n={30} color="#dbfff2" />
      <circle cx="100" cy="60" r="23" stroke="#6ff2c2" strokeOpacity={0.25} strokeDasharray="2 3" fill="none" />
      <circle cx="100" cy="60" r="34" stroke="#6ff2c2" strokeOpacity={0.1} fill="none" />
      <g className="fxa-spin" style={anim(12, 0, "100px 60px")}>
        <line x1="77" y1="60" x2="123" y2="60" stroke="#6ff2c2" strokeOpacity={0.25} />
        <circle cx="77" cy="60" r="15" fill={url(u, "g")} />
        <circle cx="123" cy="60" r="13" fill={url(u, "g")} />
        <circle cx="77" cy="60" r="5" fill="#effff9" />
        <circle cx="123" cy="60" r="4.3" fill="#c3ffe9" />
      </g>
    </>
  ),

  // Cometa — a comet sweeping past: the jet whoosh.
  flanger: (u) => (
    <>
      <defs>
        <linearGradient id={u("bg")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2c0a2a" />
          <stop offset="1" stopColor="#070208" />
        </linearGradient>
        <linearGradient id={u("tail")} x1="1" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ff9be6" stopOpacity={0.95} />
          <stop offset="1" stopColor="#ff6ad5" stopOpacity={0} />
        </linearGradient>
        <linearGradient id={u("ion")} x1="1" y1="1" x2="0" y2="0.5">
          <stop offset="0" stopColor="#9fd3ff" stopOpacity={0.8} />
          <stop offset="1" stopColor="#9fd3ff" stopOpacity={0} />
        </linearGradient>
        <Glow id={u("head")} color="#ffc4f0" opacity={0.85} />
      </defs>
      <rect width="200" height="120" fill={url(u, "bg")} />
      <Stars seed={47} n={36} />
      <path d={wavePath(84, 7, 22)} stroke="#ff6ad5" strokeOpacity={0.2} strokeWidth={1.4} fill="none" />
      <path d={wavePath(92, 5, 16)} stroke="#ff6ad5" strokeOpacity={0.12} strokeWidth={1.2} fill="none" />
      <g className="fxa-comet" style={anim(6)}>
        <path d="M122 50 L34 16 L30 28 L122 58 Z" fill={url(u, "tail")} />
        <path d="M122 53 L46 42 L46 45 L122 56 Z" fill={url(u, "ion")} />
        <circle cx="122" cy="54" r="13" fill={url(u, "head")} />
        <circle cx="122" cy="54" r="3.6" fill="#fff" />
      </g>
    </>
  ),

  // Marea — the moon pulls the sea left and right: the pan.
  autoPan: (u) => (
    <>
      <defs>
        <linearGradient id={u("sky")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d0904" />
          <stop offset="1" stopColor="#2e1c08" />
        </linearGradient>
        <linearGradient id={u("sea")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#10202a" />
          <stop offset="1" stopColor="#03080b" />
        </linearGradient>
        <Glow id={u("moon")} color="#ffb547" opacity={0.5} />
      </defs>
      <rect width="200" height="120" fill={url(u, "sky")} />
      <Stars seed={53} n={22} maxY={70} color="#fff3dc" />
      <circle cx="100" cy="38" r="28" fill={url(u, "moon")} />
      <circle cx="100" cy="38" r="10" fill="#ffe0a3" />
      <circle cx="96" cy="35" r="2" fill="#e8c27a" opacity={0.6} />
      <circle cx="104" cy="41" r="1.4" fill="#e8c27a" opacity={0.6} />
      <rect y="72" width="200" height="48" fill={url(u, "sea")} />
      <g className="fxa-pan" style={anim(3.6)}>
        {[78, 84, 90, 96, 102, 108].map((y, i) => (
          <line key={y} x1={100 - (30 - i * 4.4)} y1={y} x2={100 + (30 - i * 4.4)} y2={y} stroke="#ffcf7a" strokeOpacity={0.65 - i * 0.09} strokeWidth={1.4} strokeLinecap="round" />
        ))}
      </g>
      {[80, 92, 104].map((y, i) => (
        <g key={y} className="fxa-pan" style={anim(3.6 + i * 0.6, -i * 0.4)}>
          <path d={wavePath(y, 3, 40)} stroke="#ffb547" strokeOpacity={0.35 - i * 0.08} strokeWidth={1.2} fill="none" />
        </g>
      ))}
      <line x1="0" y1="72" x2="200" y2="72" stroke="#ffb547" strokeOpacity={0.4} />
    </>
  ),

  // Expansión — rings racing outwards from a point: the stereo field opening.
  stereoWidth: (u) => (
    <>
      <defs>
        <radialGradient id={u("bg")} cx="0.5" cy="0.5" r="0.75">
          <stop offset="0" stopColor="#262059" />
          <stop offset="1" stopColor="#06051a" />
        </radialGradient>
        <Glow id={u("core")} color="#cfc7ff" opacity={0.9} />
      </defs>
      <rect width="200" height="120" fill={url(u, "bg")} />
      <Stars seed={59} n={30} color="#e7e3ff" />
      {[0, 1, 2, 3].map((i) => (
        <ellipse
          key={i}
          cx="100"
          cy="60"
          rx="62"
          ry="22"
          stroke="#a99bff"
          strokeWidth={1.6}
          fill="none"
          vectorEffect="non-scaling-stroke"
          opacity={0.75 - i * 0.15}
          className="fxa-expand"
          style={{ ...anim(4.4, -i * 1.1, "100px 60px"), transform: `scale(${0.3 + i * 0.25})` }}
        />
      ))}
      <path d="M48 52 L38 60 L48 68 M152 52 L162 60 L152 68" stroke="#cfc7ff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" className="fxa-glow" style={anim(4.4)} />
      <circle cx="100" cy="60" r="16" fill={url(u, "core")} />
      <circle cx="100" cy="60" r="3" fill="#fff" />
    </>
  ),

  // Androide — a robot face whose visor is a spectrum: the vocoder.
  vocoder: (u) => {
    const r = prng(61);
    return (
      <>
        <defs>
          <linearGradient id={u("bg")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#04140a" />
            <stop offset="1" stopColor="#010603" />
          </linearGradient>
          <Glow id={u("g")} color="#3dff6a" opacity={0.3} />
        </defs>
        <rect width="200" height="120" fill={url(u, "bg")} />
        {Array.from({ length: 40 }, (_, i) => (
          <line key={i} x1="0" y1={i * 3} x2="200" y2={i * 3} stroke="#3dff6a" strokeOpacity={0.05} />
        ))}
        <circle cx="100" cy="58" r="50" fill={url(u, "g")} />
        <line x1="100" y1="26" x2="100" y2="17" stroke="#3dff6a" strokeOpacity={0.7} strokeWidth={1.4} />
        <circle cx="100" cy="15" r="2.6" fill="#3dff6a" className="fxa-tw" style={anim(1.8)} />
        <rect x="60" y="48" width="6" height="18" rx="2" fill="#0b2412" stroke="#3dff6a" strokeOpacity={0.5} />
        <rect x="134" y="48" width="6" height="18" rx="2" fill="#0b2412" stroke="#3dff6a" strokeOpacity={0.5} />
        <rect x="66" y="26" width="68" height="68" rx="15" fill="#0a1f0f" stroke="#3dff6a" strokeOpacity={0.65} strokeWidth={1.6} />
        <rect x="74" y="40" width="52" height="24" rx="7" fill="#020a04" stroke="#3dff6a" strokeOpacity={0.4} />
        {Array.from({ length: 9 }, (_, i) => {
          const x = 78.5 + i * 5;
          return <rect key={i} x={x} y={44} width={3} height={16} rx={1} fill="#3dff6a" className="fxa-meter" style={{ ...anim(0.8 + r() * 0.8, -r() * 2, `${x}px 60px`), transform: `scaleY(${0.3 + r() * 0.6})` }} />;
        })}
        {[74, 79, 84].map((y) => (
          <line key={y} x1="86" y1={y} x2="114" y2={y} stroke="#3dff6a" strokeOpacity={0.45} strokeWidth={1.4} strokeLinecap="round" />
        ))}
      </>
    );
  },

  // Metamorfo — one shape turning into another: the voice shifting.
  pitchShift: (u) => {
    const poly = (n: number, rad: number, inner?: number) =>
      Array.from({ length: inner ? n * 2 : n }, (_, i) => {
        const a = (i * Math.PI * 2) / (inner ? n * 2 : n) - Math.PI / 2;
        const rr = inner && i % 2 ? inner : rad;
        return `${(100 + rr * Math.cos(a)).toFixed(2)},${(60 + rr * Math.sin(a)).toFixed(2)}`;
      }).join(" ");
    return (
      <>
        <defs>
          <radialGradient id={u("bg")} cx="0.5" cy="0.5" r="0.75">
            <stop offset="0" stopColor="#3b1258" />
            <stop offset="1" stopColor="#0b0313" />
          </radialGradient>
          <linearGradient id={u("a")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffb8f6" />
            <stop offset="1" stopColor="#7a2bff" />
          </linearGradient>
          <linearGradient id={u("b")} x1="1" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffe1fb" />
            <stop offset="1" stopColor="#e46bff" />
          </linearGradient>
          <Glow id={u("halo")} color="#e46bff" opacity={0.45} />
        </defs>
        <rect width="200" height="120" fill={url(u, "bg")} />
        <Stars seed={67} n={30} color="#f5e9ff" />
        <circle cx="100" cy="60" r="44" fill={url(u, "halo")} />
        <circle cx="100" cy="60" r="37" stroke="#e46bff" strokeOpacity={0.3} strokeDasharray="2 4" fill="none" />
        <polygon points={poly(6, 11)} fill="none" stroke="#f5e9ff" strokeOpacity={0.35} transform="translate(-46 -28)" />
        <polygon points={poly(6, 11)} fill="none" stroke="#f5e9ff" strokeOpacity={0.35} transform="translate(46 28)" />
        <g className="fxa-spin" style={anim(26, 0, "100px 60px")}>
          <polygon points={poly(6, 23)} fill={url(u, "a")} className="fxa-morphA" style={anim(6)} />
          <polygon points={poly(6, 28, 12)} fill={url(u, "b")} className="fxa-morphB" style={anim(6)} />
        </g>
        <Sparkle x={100} y={60} s={5} />
      </>
    );
  },
};

/** The animated scene for an effect, filling its box (cropped to fit). */
export function FxArt({ type, animated = true, className = "", style }: { type: SceneType; animated?: boolean; className?: string; style?: CSSProperties }) {
  const raw = useId();
  const base = `fx${raw.replace(/[^a-zA-Z0-9]/g, "")}`;
  const u: U = (k) => `${base}${k}`;
  return (
    <svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice" className={`fxa ${animated ? "" : "fxa-still"} ${className}`} style={style} aria-hidden="true">
      {SCENES[type](u)}
    </svg>
  );
}
