"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { useProjectStore } from "@/state/projectStore";
import { MASTER_STYLES, MASTER_STYLE_ORDER, TARGET_INFO, targetLufsOf } from "@/lib/mastering/masterChain";
import { measureMaster, type DryMixCache } from "@/lib/mastering/measureMaster";
import { createMasteringSettings, type MasterStyle, type MasterTarget, type MasteringSettings } from "@/types/project";
import { Knob } from "../ui/Knob";
import { BackIcon, ChevronRightIcon } from "../icons";

const TARGETS: MasterTarget[] = ["plataformas", "fuerte", "maximo"];

/** One colour per style, from the same energy palette as Núcleo. */
const STYLE_COLOR: Record<MasterStyle, string> = {
  equilibrio: "#3ee8c4",
  peso: "#ff8a3d",
  brillo: "#ffe066",
  calido: "#ff5d73",
  abierto: "#7fd1ff",
  amplio: "#a98bff",
  epico: "#4da3ff",
  golpe: "#ff3d7f",
};

/**
 * Masterizar (Mezcla → Masterizar): the last step, automatic but yours.
 * Pick a style and where it should land; the app measures the song's
 * loudest 30 s and sets the gain into the chain and the limiter so the
 * master hits that loudness - every time something changes. "Antes" plays
 * the mix without mastering AT THE SAME LOUDNESS, so the comparison is about
 * the sound, not the volume. The master's own Fx stay one tap away.
 */
export function MasteringPanel() {
  const stored = useProjectStore((s) => s.project.mastering);
  const tracks = useProjectStore((s) => s.project.tracks);
  const setMastering = useProjectStore((s) => s.setMastering);
  const setMobileView = useProjectStore((s) => s.setMobileView);
  const setEffectsRackMode = useProjectStore((s) => s.setEffectsRackMode);
  const m: MasteringSettings = stored ?? createMasteringSettings();
  const [measuring, setMeasuring] = useState(false);
  const [failed, setFailed] = useState(false);
  const [comparing, setComparing] = useState(false);
  const run = useRef(0);
  const dryCache = useRef<DryMixCache | null>(null);

  // first open: switch it on
  useEffect(() => {
    if (!useProjectStore.getState().project.mastering) useProjectStore.getState().setMastering({});
  }, []);

  // what the measurement depends on (not its own results)
  const key = useMemo(
    () => JSON.stringify([m.enabled, m.style, m.intensity, m.lowDb, m.midDb, m.highDb, m.target, tracks.map((t) => [t.id, t.volumeDb, t.muted, t.clips.length, t.inserts.length, t.autoPitch?.presetId])]),
    [m.enabled, m.style, m.intensity, m.lowDb, m.midDb, m.highDb, m.target, tracks]
  );

  useEffect(() => {
    if (!m.enabled) return;
    const id = ++run.current;
    const timer = window.setTimeout(async () => {
      setMeasuring(true);
      setFailed(false);
      try {
        const project = useProjectStore.getState().project;
        const settings = project.mastering ?? createMasteringSettings();
        const r = await measureMaster(project, settings, (sid) => getAudioEngine().getBuffer(sid), dryCache);
        if (run.current !== id) return;
        if (r) setMastering(r);
        else setFailed(true);
      } catch {
        if (run.current === id) setFailed(true);
      } finally {
        if (run.current === id) setMeasuring(false);
      }
    }, 700);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    getAudioEngine().setMasteringCompare(comparing);
  }, [comparing]);
  useEffect(() => () => getAudioEngine().setMasteringCompare(false), []);

  const color = STYLE_COLOR[m.style];
  const target = targetLufsOf(m);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ink">
      <div className="flex h-14 shrink-0 items-center gap-2 px-2">
        <button onClick={() => setMobileView("mixer")} aria-label="Volver a la mezcla" className="flex h-10 w-10 items-center justify-center text-bone">
          <BackIcon className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[10px] font-bold uppercase tracking-[0.28em]" style={{ color: m.enabled ? color : "#8f919a" }}>
            Master
          </div>
          <div className="text-[17px] font-bold text-bone">Masterizar</div>
        </div>
        <button
          role="switch"
          aria-checked={m.enabled}
          aria-label="Masterización encendida"
          onClick={() => setMastering({ enabled: !m.enabled })}
          className="relative h-8 w-14 rounded-full transition-colors"
          style={{ background: m.enabled ? color : "#2a2c32" }}
        >
          <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${m.enabled ? "left-7" : "left-1"}`} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
        <EnergyGauge m={m} target={target} color={color} measuring={measuring} failed={failed} />

        <div className="mt-2 flex gap-2">
          <button
            onPointerDown={() => m.enabled && m.measured && setComparing(true)}
            onPointerUp={() => setComparing(false)}
            onPointerLeave={() => setComparing(false)}
            onPointerCancel={() => setComparing(false)}
            disabled={!m.enabled || !m.measured}
            className={`h-11 flex-1 select-none rounded-full text-[13.5px] font-semibold disabled:opacity-40 ${comparing ? "bg-bone text-ink" : "bg-surf-2 text-bone"}`}
            title="Mantén apretado: suena la mezcla sin master, al mismo volumen"
          >
            {comparing ? "Antes (sin master)" : "Mantén para oír antes"}
          </button>
        </div>
        <p className="mt-1 text-center text-[11px] text-bone-3">El «antes» suena al mismo volumen: comparas el sonido, no quién suena más fuerte.</p>

        <h3 className="mt-4 px-1 text-[12px] font-bold uppercase tracking-wider text-bone-2">Estilo</h3>
        <div className="mt-1.5 grid grid-cols-4 gap-2">
          {MASTER_STYLE_ORDER.map((s) => {
            const on = s === m.style;
            const c = STYLE_COLOR[s];
            return (
              <button
                key={s}
                onClick={() => setMastering({ style: s, enabled: true })}
                aria-pressed={on}
                title={MASTER_STYLES[s].hint}
                className="flex flex-col items-center gap-1 rounded-2xl py-2.5"
                style={
                  on
                    ? { background: `radial-gradient(circle at 50% 30%, ${c}33, #0d0e11 75%)`, boxShadow: `inset 0 0 0 1.5px ${c}, 0 0 18px ${c}30`, color: c }
                    : { background: "#141518", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.06)", color: "#9a9ca4" }
                }
              >
                <StyleGlyph style={s} />
                <span className={`text-[11.5px] font-semibold ${on ? "text-bone" : ""}`}>{MASTER_STYLES[s].label}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 px-1 text-[12px] leading-snug text-bone-3">{MASTER_STYLES[m.style].hint}</p>

        <h3 className="mt-4 px-1 text-[12px] font-bold uppercase tracking-wider text-bone-2">Volumen final</h3>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5 rounded-2xl bg-surf-2 p-1">
          {TARGETS.map((t) => (
            <button
              key={t}
              onClick={() => setMastering({ target: t })}
              aria-pressed={m.target === t}
              className={`h-10 rounded-xl text-[13px] font-semibold ${m.target === t ? "bg-bone text-ink" : "text-bone-2"}`}
            >
              {TARGET_INFO[t].label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 px-1 text-[12px] leading-snug text-bone-3">{TARGET_INFO[m.target].hint}</p>

        <h3 className="mt-4 px-1 text-[12px] font-bold uppercase tracking-wider text-bone-2">Intensidad</h3>
        <div className="mt-1 rounded-2xl bg-surf-2 px-4 py-3">
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(m.intensity * 100)}
            onChange={(e) => setMastering({ intensity: Number(e.target.value) / 100 })}
            aria-label="Intensidad del master"
            className="w-full"
            style={{ accentColor: color }}
          />
          <div className="mt-1 flex justify-between text-[11px] text-bone-3">
            <span>Suave</span>
            <span>Normal</span>
            <span>Fuerte</span>
          </div>
        </div>

        <h3 className="mt-4 px-1 text-[12px] font-bold uppercase tracking-wider text-bone-2">Tono</h3>
        <div className="mt-1 flex justify-around rounded-2xl bg-surf-2 py-3">
          <Knob value={m.lowDb} min={-6} max={6} defaultValue={0} label="Graves" unit="dB" decimals={1} size={52} onChange={(v) => setMastering({ lowDb: Math.round(v * 2) / 2 })} />
          <Knob value={m.midDb} min={-6} max={6} defaultValue={0} label="Medios" unit="dB" decimals={1} size={52} onChange={(v) => setMastering({ midDb: Math.round(v * 2) / 2 })} />
          <Knob value={m.highDb} min={-6} max={6} defaultValue={0} label="Agudos" unit="dB" decimals={1} size={52} onChange={(v) => setMastering({ highDb: Math.round(v * 2) / 2 })} />
        </div>

        <button
          onClick={() => {
            setEffectsRackMode("master");
            setMobileView("effects");
          }}
          className="mt-4 flex h-12 w-full items-center gap-2 rounded-2xl bg-surf-2 px-4 text-left text-[13.5px] text-bone-2"
        >
          Efectos del master (avanzado)
          <ChevronRightIcon className="ml-auto h-4 w-4" />
        </button>
        <p className="mt-1.5 px-1 text-[11px] leading-snug text-bone-3">Van antes de la masterización. La exportación suena igual que lo que oyes aquí.</p>
      </div>
    </div>
  );
}

/** Loudness as energy: an arc from silence to the target, the mix's level
 * as a dim mark and the master's as the lit arc, with the numbers. */
function EnergyGauge({ m, target, color, measuring, failed }: { m: MasteringSettings; target: number; color: string; measuring: boolean; failed: boolean }) {
  const lo = -30;
  const hi = -5;
  const frac = (l: number) => Math.min(1, Math.max(0, (l - lo) / (hi - lo)));
  const R = 78;
  const C = 100;
  const arc = (f: number) => {
    const a0 = Math.PI;
    const a1 = Math.PI + Math.PI * f;
    const x0 = C + R * Math.cos(a0);
    const y0 = 100 + R * Math.sin(a0);
    const x1 = C + R * Math.cos(a1);
    const y1 = 100 + R * Math.sin(a1);
    return `M ${x0} ${y0} A ${R} ${R} 0 ${f > 1 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  const meas = m.measured;
  const mark = (l: number) => {
    const a = Math.PI + Math.PI * frac(l);
    return { x1: C + (R - 12) * Math.cos(a), y1: 100 + (R - 12) * Math.sin(a), x2: C + (R + 12) * Math.cos(a), y2: 100 + (R + 12) * Math.sin(a) };
  };
  return (
    <div className="relative mt-1 rounded-3xl px-4 pb-3 pt-2" style={{ background: `radial-gradient(ellipse 80% 90% at 50% 100%, ${color}22, #0d0e11 75%)`, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.06)" }}>
      <svg viewBox="0 0 200 112" className="mx-auto block w-full max-w-[320px]">
        <path d={arc(1)} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={10} strokeLinecap="round" />
        {meas && m.enabled && <path d={arc(frac(meas.masterLufs))} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${color})` }} />}
        {meas && <line {...mark(meas.mixLufs)} stroke="rgba(255,255,255,.45)" strokeWidth={2} strokeLinecap="round" />}
        <line {...mark(target)} stroke="#fff" strokeWidth={2.5} strokeDasharray="3 3" />
        <text x={100} y={78} textAnchor="middle" fill="#f4f3ee" fontSize={26} fontWeight={800}>
          {meas && m.enabled ? meas.masterLufs.toFixed(1) : "—"}
        </text>
        <text x={100} y={95} textAnchor="middle" fill="#9a9ca4" fontSize={10} fontWeight={600} letterSpacing={1.5}>
          LUFS · OBJETIVO {target}
        </text>
      </svg>
      <div className="flex items-center justify-center gap-2 text-[12px] text-bone-3">
        {!m.enabled ? (
          "Apagado: la mezcla sale sin masterizar."
        ) : measuring ? (
          <>
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-bone-3 border-t-transparent" />
            Escuchando la parte más fuerte de tu canción…
          </>
        ) : failed ? (
          "No hay audio que medir todavía."
        ) : meas ? (
          <span className="tabular-nums">
            Tu mezcla {meas.mixLufs.toFixed(1)} → master {meas.masterLufs.toFixed(1)} LUFS · pico {meas.peakDb.toFixed(1)} dB
          </span>
        ) : (
          "Se mide sola al abrir y al cambiar algo."
        )}
      </div>
    </div>
  );
}

/** Small glyphs in the app's energy language, one per style. */
function StyleGlyph({ style }: { style: MasterStyle }) {
  const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
      {style === "equilibrio" && (
        <>
          <ellipse cx={16} cy={16} rx={12} ry={5} {...s} />
          <circle cx={16} cy={16} r={3} fill="currentColor" />
        </>
      )}
      {style === "peso" && (
        <>
          <circle cx={16} cy={18} r={7} fill="currentColor" opacity={0.85} />
          <path d="M5 26h22" {...s} />
          <path d="M9 9l2 3M23 9l-2 3M16 5v4" {...s} opacity={0.6} />
        </>
      )}
      {style === "brillo" && <path d="M16 4v6M16 22v6M4 16h6M22 16h6M8 8l4 4M20 20l4 4M24 8l-4 4M12 20l-4 4" {...s} />}
      {style === "calido" && (
        <>
          <circle cx={16} cy={16} r={6} {...s} />
          <path d="M6 24c3-2 6-2 10 0s7 2 10 0" {...s} opacity={0.7} />
        </>
      )}
      {style === "abierto" && (
        <>
          <circle cx={16} cy={16} r={3} {...s} />
          <circle cx={16} cy={16} r={8} {...s} strokeDasharray="2 3" />
          <circle cx={16} cy={16} r={13} {...s} strokeDasharray="1.5 4" opacity={0.6} />
        </>
      )}
      {style === "amplio" && (
        <>
          <ellipse cx={16} cy={16} rx={13} ry={4} {...s} />
          <path d="M3 16h-1M30 16h-1M7 12l-3 4 3 4M25 12l3 4-3 4" {...s} />
        </>
      )}
      {style === "epico" && (
        <>
          <path d="M4 22c4-10 20-10 24 0" {...s} />
          <circle cx={16} cy={13} r={2.5} fill="currentColor" />
          <path d="M9 26h14" {...s} opacity={0.6} />
        </>
      )}
      {style === "golpe" && <path d="M3 16h6l3-8 4 16 3-12 2 4h8" {...s} />}
    </svg>
  );
}
