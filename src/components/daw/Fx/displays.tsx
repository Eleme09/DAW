"use client";

import { useRef } from "react";
import { useRafLoop } from "@/hooks/useRafLoop";
import { reverbDecayEnvelopeDb } from "@/audio-engine/effects/impulseResponse";
import { makeSaturationCurve } from "@/audio-engine/effects/curves";
import type { FxSkin } from "@/lib/fx/catalog";
import type { ReverbParams, SaturationParams } from "@/types/effects";

/**
 * The "screen" at the top of each face: what the effect is doing, drawn -
 * an analog VU for the compressors (CLA-2A), the reverb tail (Pro-R), the
 * echoes, the saturation curve, the LFO. Live readings come from the
 * engine through `read` callbacks polled once per frame.
 */

// ------------------------------------------------------------------ VU meter

/** VU scale marks (dB) and where they sit on the 0..1 needle travel. */
const VU_MARKS: [number, number][] = [
  [-20, 0],
  [-10, 0.25],
  [-7, 0.38],
  [-5, 0.48],
  [-3, 0.6],
  [-2, 0.67],
  [-1, 0.74],
  [0, 0.82],
  [1, 0.88],
  [2, 0.94],
  [3, 1],
];

function vuPos(db: number): number {
  if (db <= VU_MARKS[0][0]) return 0;
  for (let i = 1; i < VU_MARKS.length; i++) {
    const [d1, p1] = VU_MARKS[i];
    const [d0, p0] = VU_MARKS[i - 1];
    if (db <= d1) return p0 + ((db - d0) / (d1 - d0)) * (p1 - p0);
  }
  return 1;
}

/**
 * Analog VU showing gain reduction (needle rests on 0 and falls left as
 * the compressor works), with VU ballistics (~300 ms). `read` returns the
 * reduction in dB (<= 0).
 */
export function VuMeter({ read, label = "Reducción", face = "#f3e9cf" }: { read: () => number; label?: string; face?: string }) {
  const needle = useRef<SVGLineElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  const last = useRef(0);
  const W = 260;
  const H = 120;
  const cx = W / 2;
  const cy = H + 40;
  const r = 140;
  const a0 = -48;
  const a1 = 48;

  useRafLoop(() => {
    const now = performance.now();
    const dt = last.current ? Math.min(0.1, (now - last.current) / 1000) : 0.016;
    last.current = now;
    const target = Math.min(0, read());
    shown.current += (target - shown.current) * (1 - Math.exp(-dt / 0.09));
    const pos = vuPos(shown.current);
    const ang = a0 + pos * (a1 - a0);
    const rad = ((ang - 90) * Math.PI) / 180;
    if (needle.current) {
      needle.current.setAttribute("x2", String(cx + (r - 6) * Math.cos(rad)));
      needle.current.setAttribute("y2", String(cy + (r - 6) * Math.sin(rad)));
    }
    if (readout.current) readout.current.textContent = `${shown.current.toFixed(1)} dB`;
  }, true);

  const at = (pos: number, rr: number) => {
    const ang = a0 + pos * (a1 - a0);
    const rad = ((ang - 90) * Math.PI) / 180;
    return { x: cx + rr * Math.cos(rad), y: cy + rr * Math.sin(rad) };
  };

  return (
    <div className="relative mx-auto w-full max-w-[300px] rounded-xl p-1.5" style={{ background: "#16120c", boxShadow: "inset 0 2px 6px rgba(0,0,0,.8)" }}>
      <div className="relative overflow-hidden rounded-lg" style={{ background: `radial-gradient(ellipse at 50% 120%, #fff6dc 0%, ${face} 55%, #d8c79f 100%)` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
          {VU_MARKS.map(([db, pos]) => {
            const a = at(pos, r - 14);
            const b = at(pos, r - 4);
            const t = at(pos, r - 26);
            return (
              <g key={db}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={db > 0 ? "#b3261e" : "#2a2116"} strokeWidth={db === 0 ? 2 : 1.3} />
                <text x={t.x} y={t.y + 3} textAnchor="middle" fontSize="10" fontFamily="ui-monospace,monospace" fill={db > 0 ? "#b3261e" : "#2a2116"}>
                  {db > 0 ? `+${db}` : db}
                </text>
              </g>
            );
          })}
          <path d={`M ${at(0.82, r - 4).x} ${at(0.82, r - 4).y} A ${r - 4} ${r - 4} 0 0 1 ${at(1, r - 4).x} ${at(1, r - 4).y}`} stroke="#b3261e" strokeWidth={4} fill="none" />
          <text x={cx} y={H - 30} textAnchor="middle" fontSize="13" fontWeight="700" fill="#2a2116" letterSpacing="2">
            VU
          </text>
          <line ref={needle} x1={cx} y1={cy} x2={cx} y2={cy - r} stroke="#1a1410" strokeWidth={1.6} />
          <circle cx={cx} cy={H + 2} r={10} fill="#2a2116" />
        </svg>
        <span className="absolute right-2 top-1.5 text-[9px] font-semibold uppercase tracking-widest text-[#5b4a2f]">{label}</span>
        <span ref={readout} className="absolute bottom-1 right-2 font-mono text-[10px] text-[#3b2f1d]">
          0.0 dB
        </span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ level bar

/** Horizontal live bar (gate envelope vs. threshold, limiter reduction). */
export function LevelBar({ read, min = -60, max = 0, marker, skin, label }: { read: () => number; min?: number; max?: number; marker?: number; skin: FxSkin; label: string }) {
  const fill = useRef<HTMLDivElement>(null);
  const shown = useRef(min);
  useRafLoop(() => {
    const v = Math.max(min, Math.min(max, read()));
    shown.current = v > shown.current ? v : shown.current + (v - shown.current) * 0.12;
    if (fill.current) fill.current.style.width = `${((shown.current - min) / (max - min)) * 100}%`;
  }, true);
  return (
    <div>
      <div className="mb-1 flex justify-between text-[10px] font-semibold uppercase tracking-widest" style={{ color: skin.ink2 }}>
        <span>{label}</span>
        <span>{marker !== undefined ? `${marker.toFixed(0)} dB` : ""}</span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-full" style={{ background: skin.box }}>
        <div ref={fill} className="h-full rounded-full" style={{ width: "0%", background: `linear-gradient(90deg, ${skin.accent}55, ${skin.accent})` }} />
        {marker !== undefined && <div className="absolute top-0 h-full w-0.5 bg-white/80" style={{ left: `${((marker - min) / (max - min)) * 100}%` }} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ reverb

/** The reverb tail as it really is: pre-delay gap, the envelope the impulse
 * response is built with, and the cut tail filters written on it. */
export function DecayDisplay({ params, skin }: { params: ReverbParams; skin: FxSkin }) {
  const W = 320;
  const H = 120;
  const span = Math.max(1.5, params.decaySec * 1.15 + (params.predelayMs ?? 0) / 1000);
  const x = (sec: number) => 8 + (sec / span) * (W - 16);
  const pre = (params.predelayMs ?? 0) / 1000;
  const pts: string[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const db = reverbDecayEnvelopeDb(t, params.sizeType);
    const y = H - 14 - Math.max(0, (db + 60) / 60) * (H - 30) * (0.35 + params.mix * 0.65);
    pts.push(`${x(pre + t * params.decaySec).toFixed(1)},${y.toFixed(1)}`);
  }
  const path = `M ${x(pre)},${H - 14} L ${pts.join(" L ")} L ${x(pre + params.decaySec)},${H - 14} Z`;
  return (
    <div className="relative overflow-hidden rounded-2xl" style={{ background: skin.box }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
        <defs>
          <linearGradient id="decayFill" x1="0" x2="1">
            <stop offset="0%" stopColor={skin.accent} stopOpacity={0.85} />
            <stop offset="100%" stopColor={skin.accent} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={8 + f * (W - 16)} x2={8 + f * (W - 16)} y1={10} y2={H - 14} stroke="rgba(255,255,255,0.06)" />
        ))}
        <line x1={8} x2={8} y1={14} y2={H - 14} stroke="#fff" strokeWidth={3} strokeLinecap="round" />
        <path d={path} fill="url(#decayFill)" />
        <path d={`M ${pts.join(" L ")}`} fill="none" stroke={skin.accent} strokeWidth={1.5} />
        {pre > 0 && (
          <text x={(8 + x(pre)) / 2} y={H - 3} textAnchor="middle" fontSize="9" fill={skin.ink2}>
            {Math.round(pre * 1000)} ms
          </text>
        )}
        <text x={W - 10} y={14} textAnchor="end" fontSize="10" fontWeight="700" fill={skin.ink}>
          {params.decaySec.toFixed(1)} s
        </text>
        <text x={W - 10} y={H - 3} textAnchor="end" fontSize="9" fill={skin.ink2}>
          {`${Math.round(params.lowCutHz ?? 20)} Hz – ${((params.highCutHz ?? 20000) / 1000).toFixed(1)} kHz`}
        </text>
      </svg>
    </div>
  );
}

// ------------------------------------------------------------------ delay

/** The echoes: the voice, then each repeat at its real time and level
 * (feedback^n); ping-pong repeats alternate up (left) and down (right). */
export function EchoDisplay({ timeMs, feedback, mix, pingPong, skin }: { timeMs: number; feedback: number; mix: number; pingPong: boolean; skin: FxSkin }) {
  const W = 320;
  const H = 120;
  const mid = H / 2;
  const span = Math.max(1200, Math.min(4000, timeMs * 8));
  const x = (ms: number) => 10 + (ms / span) * (W - 20);
  const echoes: { t: number; level: number; side: number }[] = [];
  // first repeat drawn by the mix (40-100 % of full height), then each one
  // feedback times the previous - the real decay, readable at low mixes
  let level = 0.4 + 0.6 * Math.min(1, mix * 2);
  for (let n = 1; n <= 16 && n * timeMs <= span; n++) {
    echoes.push({ t: n * timeMs, level, side: pingPong ? (n % 2 === 1 ? -1 : 1) : 0 });
    level *= feedback;
    if (level < 0.03) break;
  }
  return (
    <div className="overflow-hidden rounded-2xl" style={{ background: skin.box }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
        <line x1={6} x2={W - 6} y1={mid} y2={mid} stroke="rgba(255,255,255,0.12)" />
        {pingPong && (
          <>
            <text x={W - 8} y={14} textAnchor="end" fontSize="9" fill={skin.ink2}>
              IZQ
            </text>
            <text x={W - 8} y={H - 6} textAnchor="end" fontSize="9" fill={skin.ink2}>
              DER
            </text>
          </>
        )}
        <rect x={x(0) - 3} y={mid - 44} width={6} height={88} rx={3} fill="#fff" />
        {echoes.map((e, i) => {
          const h = Math.max(3, e.level * (e.side === 0 ? 88 : 44));
          const y = e.side === 0 ? mid - h / 2 : e.side < 0 ? mid - h : mid;
          return <rect key={i} x={x(e.t) - 3} y={y} width={6} height={h} rx={3} fill={skin.accent} opacity={0.4 + 0.6 * e.level} />;
        })}
      </svg>
    </div>
  );
}

// ------------------------------------------------------------------ saturation

/** Input -> output of the waveshaper at the current drive, plus where the
 * clean (1:1) line would be. */
export function TransferDisplay({ tone, driveDb, mix, skin, hard = false, ceilingDb = 0 }: { tone: SaturationParams["tone"]; driveDb: number; mix: number; skin: FxSkin; hard?: boolean; ceilingDb?: number }) {
  const S = 130;
  const curve = hard ? null : makeSaturationCurve(tone);
  const g = Math.pow(10, driveDb / 20);
  const ceil = Math.pow(10, ceilingDb / 20);
  const pts: string[] = [];
  for (let i = 0; i <= 64; i++) {
    const xin = (i / 64) * 2 - 1;
    let wet: number;
    if (hard) wet = Math.max(-ceil, Math.min(ceil, xin));
    else {
      const d = Math.max(-1, Math.min(1, xin * g));
      const idx = Math.round(((d + 1) / 2) * (curve!.length - 1));
      wet = curve![idx] * 0.85;
    }
    const y = hard ? wet : (1 - mix) * xin + mix * wet;
    pts.push(`${((xin + 1) / 2) * S},${S - ((y + 1) / 2) * S}`);
  }
  return (
    <div className="flex items-center justify-center rounded-2xl p-2" style={{ background: skin.box }}>
      <svg viewBox={`0 0 ${S} ${S}`} className="h-28 w-28">
        <rect x={0} y={0} width={S} height={S} rx={10} fill="rgba(0,0,0,0.25)" />
        <line x1={0} y1={S} x2={S} y2={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 4" />
        <line x1={S / 2} y1={0} x2={S / 2} y2={S} stroke="rgba(255,255,255,0.07)" />
        <line x1={0} y1={S / 2} x2={S} y2={S / 2} stroke="rgba(255,255,255,0.07)" />
        <polyline points={pts.join(" ")} fill="none" stroke={skin.accent} strokeWidth={3} strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 6px ${skin.accent})` }} />
      </svg>
    </div>
  );
}

// ------------------------------------------------------------------ modulation

/** A running LFO trace with the real phase from the engine. */
export function LfoDisplay({ readPhase, rateHz, depth, skin, label }: { readPhase: () => number | null; rateHz: number; depth: number; skin: FxSkin; label: string }) {
  const dot = useRef<SVGCircleElement>(null);
  const W = 320;
  const H = 90;
  const mid = H / 2;
  const amp = (H / 2 - 10) * Math.max(0.08, Math.min(1, depth));
  const cycles = 2;
  const pts: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const t = i / 120;
    pts.push(`${10 + t * (W - 20)},${mid - Math.sin(t * cycles * 2 * Math.PI) * amp}`);
  }
  const fallbackStart = useRef(0);
  useRafLoop(() => {
    let ph = readPhase();
    if (ph === null) {
      if (!fallbackStart.current) fallbackStart.current = performance.now();
      ph = (((performance.now() - fallbackStart.current) / 1000) * rateHz) % 1;
    }
    const t = ph / cycles;
    if (dot.current) {
      dot.current.setAttribute("cx", String(10 + t * (W - 20)));
      dot.current.setAttribute("cy", String(mid - Math.sin(t * cycles * 2 * Math.PI) * amp));
    }
  }, true);
  return (
    <div className="overflow-hidden rounded-2xl" style={{ background: skin.box }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
        <line x1={6} x2={W - 6} y1={mid} y2={mid} stroke="rgba(255,255,255,0.1)" />
        <polyline points={pts.join(" ")} fill="none" stroke={skin.accent} strokeOpacity={0.55} strokeWidth={2} />
        <circle ref={dot} r={6} fill={skin.accent} style={{ filter: `drop-shadow(0 0 6px ${skin.accent})` }} />
        <text x={W - 10} y={14} textAnchor="end" fontSize="10" fill={skin.ink2}>
          {label}
        </text>
      </svg>
    </div>
  );
}

/** The stereo field: how far the voice opens to each side. */
export function WidthDisplay({ width, skin }: { width: number; skin: FxSkin }) {
  const W = 320;
  const H = 110;
  const cx = W / 2;
  const cy = H - 8;
  const spread = Math.min(1, width / 2) * 80;
  const pt = (deg: number, r: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return `${cx + r * Math.cos(rad)},${cy + r * Math.sin(rad)}`;
  };
  return (
    <div className="overflow-hidden rounded-2xl" style={{ background: skin.box }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
        <path d={`M ${pt(-80, 96)} A 96 96 0 0 1 ${pt(80, 96)}`} fill="none" stroke="rgba(255,255,255,0.12)" />
        <polygon points={`${cx},${cy} ${pt(-spread, 96)} ${pt(spread, 96)}`} fill={skin.accent} fillOpacity={0.35} stroke={skin.accent} />
        <text x={14} y={H - 8} fontSize="10" fill={skin.ink2}>
          IZQ
        </text>
        <text x={W - 14} y={H - 8} textAnchor="end" fontSize="10" fill={skin.ink2}>
          DER
        </text>
      </svg>
    </div>
  );
}
