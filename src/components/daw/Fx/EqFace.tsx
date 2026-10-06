"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { WEB_AUDIO_FILTER_TYPE } from "@/audio-engine/effects/EqEffect";
import { useRafLoop } from "@/hooks/useRafLoop";
import type { FxSkin } from "@/lib/fx/catalog";
import type { EqBand, EqParams } from "@/types/effects";
import { FxKnob, Pills, fmt } from "./kit";

/**
 * Prisma (EQ): Pro-Q's curve (one coloured node per band, the real combined
 * response over a live spectrum) laid out like the phone EQ reference
 * (curve on top, band chips, the selected band's controls underneath).
 * Drag a node: left/right = frequency, up/down = gain. Tap empty space to
 * add a band there.
 */

const F_MIN = 20;
const F_MAX = 20000;
const G_RANGE = 18;
const H = 200;
const MAX_BANDS = 8;
const STEPS = 200;

export const BAND_COLORS = ["#f2b84b", "#ff6b6b", "#c58bff", "#4fd1c5", "#6fb3ff", "#8fe388", "#ff9ad5", "#ffd166"];

const TYPES: { id: EqBand["type"]; label: string }[] = [
  { id: "highpass", label: "Corte graves" },
  { id: "lowshelf", label: "Graves" },
  { id: "peaking", label: "Campana" },
  { id: "highshelf", label: "Agudos" },
  { id: "lowpass", label: "Corte agudos" },
];

const fx = (f: number) => Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN);
const xf = (x: number) => F_MIN * Math.pow(F_MAX / F_MIN, Math.min(1, Math.max(0, x)));
const gy = (g: number) => 0.5 - g / (2 * G_RANGE);
const yg = (y: number) => (0.5 - y) * 2 * G_RANGE;
const hasGain = (t: EqBand["type"]) => t === "peaking" || t === "lowshelf" || t === "highshelf";

const FREQS: Float32Array<ArrayBuffer> = Float32Array.from({ length: STEPS }, (_, i) => xf(i / (STEPS - 1)));

let responseCtx: OfflineAudioContext | null = null;
function responseOf(bands: EqBand[], freqs: Float32Array<ArrayBuffer>): { total: Float32Array; each: Float32Array[] } {
  if (!responseCtx) responseCtx = new OfflineAudioContext(1, 1, 44100);
  const total = new Float32Array(freqs.length);
  const each: Float32Array[] = [];
  const mag = new Float32Array(freqs.length);
  const ph = new Float32Array(freqs.length);
  for (const b of bands) {
    const db = new Float32Array(freqs.length);
    if (b.enabled) {
      const f = responseCtx.createBiquadFilter();
      f.type = WEB_AUDIO_FILTER_TYPE[b.type];
      f.frequency.value = b.freq;
      f.Q.value = b.q;
      f.gain.value = b.gainDb;
      f.getFrequencyResponse(freqs, mag, ph);
      for (let i = 0; i < freqs.length; i++) {
        db[i] = 20 * Math.log10(Math.max(1e-6, mag[i]));
        total[i] += db[i];
      }
    }
    each.push(db);
  }
  return { total, each };
}

function analyserFor(target: string): AnalyserNode | null {
  const e = getAudioEngine();
  if (target === "master") return e.getMasterAnalyser();
  return e.getTrackAnalyser(target) ?? e.getBusAnalyser(target);
}

export function EqFace({ params, onChange, skin, target }: { params: EqParams; onChange: (p: EqParams) => void; skin: FxSkin; target: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(340);
  const [selected, setSelected] = useState<string | null>(params.bands[0]?.id ?? null);
  const drag = useRef<{ id: string } | null>(null);
  const spectrum = useRef<Float32Array | null>(null);
  const bands = params.bands;
  const sel = bands.find((b) => b.id === selected) ?? null;
  const selIndex = sel ? bands.indexOf(sel) : -1;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const resp = useMemo(() => responseOf(bands, FREQS), [bands]);

  useRafLoop(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(width * dpr)) {
      c.width = Math.round(width * dpr);
      c.height = Math.round(H * dpr);
    }
    const g = c.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, H);

    // grid
    g.lineWidth = 1;
    for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
      const x = fx(f) * width;
      g.strokeStyle = "rgba(255,255,255,0.05)";
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, H);
      g.stroke();
      if (f === 100 || f === 1000 || f === 10000) {
        g.fillStyle = "rgba(255,255,255,0.3)";
        g.font = "9px ui-monospace,monospace";
        g.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x + 3, H - 4);
      }
    }
    for (const db of [-12, -6, 0, 6, 12]) {
      const y = gy(db) * H;
      g.strokeStyle = db === 0 ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.05)";
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(width, y);
      g.stroke();
      if (db !== 0) {
        g.fillStyle = "rgba(255,255,255,0.3)";
        g.fillText(`${db > 0 ? "+" : ""}${db}`, 3, y - 3);
      }
    }

    // live spectrum of the track (post-chain)
    const an = analyserFor(target);
    if (an) {
      const bins = new Float32Array(an.frequencyBinCount);
      an.getFloatFrequencyData(bins);
      const nyq = an.context.sampleRate / 2;
      const cols = 96;
      if (!spectrum.current || spectrum.current.length !== cols) spectrum.current = new Float32Array(cols).fill(-100);
      const sp = spectrum.current;
      for (let i = 0; i < cols; i++) {
        const f0 = xf(i / cols);
        const f1 = xf((i + 1) / cols);
        const b0 = Math.max(1, Math.floor((f0 / nyq) * bins.length));
        const b1 = Math.max(b0 + 1, Math.floor((f1 / nyq) * bins.length));
        let m = -120;
        for (let k = b0; k < b1 && k < bins.length; k++) m = Math.max(m, bins[k]);
        sp[i] = m > sp[i] ? m : sp[i] + (m - sp[i]) * 0.15;
      }
      g.beginPath();
      g.moveTo(0, H);
      for (let i = 0; i < cols; i++) {
        const level = Math.max(0, Math.min(1, (sp[i] + 100) / 80));
        g.lineTo(((i + 0.5) / cols) * width, H - level * H * 0.9);
      }
      g.lineTo(width, H);
      g.closePath();
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "rgba(160,170,200,0.28)");
      grad.addColorStop(1, "rgba(160,170,200,0.02)");
      g.fillStyle = grad;
      g.fill();
    }

    // each band's own shape, filled in its colour
    const { total, each } = resp;
    each.forEach((db, bi) => {
      const b = bands[bi];
      if (!b?.enabled) return;
      const col = BAND_COLORS[bi % BAND_COLORS.length];
      g.beginPath();
      g.moveTo(0, gy(0) * H);
      for (let i = 0; i < STEPS; i++) g.lineTo((i / (STEPS - 1)) * width, gy(Math.max(-G_RANGE * 1.2, Math.min(G_RANGE * 1.2, db[i]))) * H);
      g.lineTo(width, gy(0) * H);
      g.closePath();
      g.fillStyle = `${col}${b.id === selected ? "40" : "1c"}`;
      g.fill();
    });

    // combined response
    g.beginPath();
    for (let i = 0; i < STEPS; i++) {
      const x = (i / (STEPS - 1)) * width;
      const y = gy(Math.max(-G_RANGE * 1.3, Math.min(G_RANGE * 1.3, total[i]))) * H;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokeStyle = "#f7f3ea";
    g.lineWidth = 2.2;
    g.shadowColor = "rgba(255,255,255,0.35)";
    g.shadowBlur = 6;
    g.stroke();
    g.shadowBlur = 0;

    // nodes
    bands.forEach((b, bi) => {
      const col = BAND_COLORS[bi % BAND_COLORS.length];
      const x = fx(b.freq) * width;
      const y = (hasGain(b.type) ? gy(b.gainDb) : gy(0)) * H;
      const on = b.id === selected;
      g.beginPath();
      g.arc(x, y, on ? 11 : 8, 0, Math.PI * 2);
      g.fillStyle = b.enabled ? col : "#555";
      g.globalAlpha = b.enabled ? 1 : 0.6;
      g.fill();
      g.globalAlpha = 1;
      g.lineWidth = on ? 3 : 1.5;
      g.strokeStyle = on ? "#fff" : "rgba(0,0,0,0.5)";
      g.stroke();
      g.fillStyle = "#0b0b0d";
      g.font = "bold 9px ui-sans-serif,system-ui";
      g.textAlign = "center";
      g.fillText(String(bi + 1), x, y + 3);
      g.textAlign = "start";
    });
  }, true);

  function pos(e: React.PointerEvent) {
    const r = canvas.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }

  function setBand(id: string, patch: Partial<EqBand>) {
    onChange({ bands: bands.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  }

  return (
    <div>
      <div ref={box} className="relative overflow-hidden rounded-2xl" style={{ background: skin.box, height: H }}>
        <canvas
          ref={canvas}
          style={{ width, height: H, touchAction: "none" }}
          onPointerDown={(e) => {
            const p = pos(e);
            let best: { id: string; d: number } | null = null;
            for (const b of bands) {
              const dx = (fx(b.freq) - p.x) * width;
              const dy = ((hasGain(b.type) ? gy(b.gainDb) : gy(0)) - p.y) * H;
              const d = Math.hypot(dx, dy);
              if (d < 26 && (!best || d < best.d)) best = { id: b.id, d };
            }
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            if (best) {
              setSelected(best.id);
              drag.current = { id: best.id };
            } else if (bands.length < MAX_BANDS) {
              const nb: EqBand = { id: crypto.randomUUID(), type: "peaking", freq: Math.round(xf(p.x)), gainDb: Math.round(yg(p.y) * 2) / 2, q: 1, enabled: true };
              onChange({ bands: [...bands, nb] });
              setSelected(nb.id);
              drag.current = { id: nb.id };
            }
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const p = pos(e);
            const b = bands.find((x) => x.id === d.id);
            if (!b) return;
            setBand(d.id, { freq: Math.round(xf(p.x)), ...(hasGain(b.type) ? { gainDb: Math.round(Math.max(-G_RANGE, Math.min(G_RANGE, yg(p.y))) * 10) / 10 } : {}) });
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        />
      </div>

      {/* band chips */}
      <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
        {bands.map((b, bi) => (
          <button
            key={b.id}
            onClick={() => setSelected(b.id)}
            className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-full px-3 text-xs font-bold"
            style={{
              background: b.id === selected ? BAND_COLORS[bi % BAND_COLORS.length] : "rgba(255,255,255,0.06)",
              color: b.id === selected ? "#0b0b0d" : BAND_COLORS[bi % BAND_COLORS.length],
              opacity: b.enabled ? 1 : 0.5,
            }}
            aria-label={`Banda ${bi + 1}`}
          >
            {bi + 1}
          </button>
        ))}
        {bands.length < MAX_BANDS && (
          <button
            onClick={() => {
              const nb: EqBand = { id: crypto.randomUUID(), type: "peaking", freq: 1000, gainDb: 0, q: 1, enabled: true };
              onChange({ bands: [...bands, nb] });
              setSelected(nb.id);
            }}
            className="flex h-9 shrink-0 items-center rounded-full px-3 text-xs font-semibold"
            style={{ background: "rgba(255,255,255,0.06)", color: skin.ink2 }}
          >
            + Banda
          </button>
        )}
      </div>

      {sel && (
        <div className="mt-2 rounded-2xl p-3" style={{ background: skin.box }}>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold" style={{ color: BAND_COLORS[selIndex % BAND_COLORS.length] }}>
              Banda {selIndex + 1}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setBand(sel.id, { enabled: !sel.enabled })}
                className="rounded-full px-3 py-1 text-[11px] font-semibold"
                style={{ background: sel.enabled ? "rgba(255,255,255,0.1)" : skin.accent, color: sel.enabled ? skin.ink : "#0b0b0d" }}
              >
                {sel.enabled ? "Apagar" : "Encender"}
              </button>
              <button
                onClick={() => {
                  const rest = bands.filter((b) => b.id !== sel.id);
                  onChange({ bands: rest });
                  setSelected(rest[0]?.id ?? null);
                }}
                className="rounded-full px-3 py-1 text-[11px] font-semibold text-[#ff8a8a]"
                style={{ background: "rgba(255,255,255,0.06)" }}
              >
                Quitar
              </button>
            </div>
          </div>
          <div className="mb-3">
            <Pills options={TYPES} value={sel.type} onChange={(t) => setBand(sel.id, { type: t, q: t === "highpass" || t === "lowpass" ? 0.707 : sel.q })} skin={skin} small />
          </div>
          <div className="flex justify-around">
            <FxKnob label="Frecuencia" value={sel.freq} min={20} max={20000} scale="log" onChange={(v) => setBand(sel.id, { freq: Math.round(v) })} skin={skin} format={fmt.hz} defaultValue={1000} />
            {hasGain(sel.type) && (
              <FxKnob label="Ganancia" value={sel.gainDb} min={-18} max={18} bipolar onChange={(v) => setBand(sel.id, { gainDb: Math.round(v * 10) / 10 })} skin={skin} format={fmt.db} defaultValue={0} />
            )}
            <FxKnob label={hasGain(sel.type) ? "Ancho (Q)" : "Resonancia"} value={sel.q} min={0.2} max={12} scale="log" onChange={(v) => setBand(sel.id, { q: Math.round(v * 100) / 100 })} skin={skin} format={fmt.q} defaultValue={hasGain(sel.type) ? 1 : 0.707} />
          </div>
        </div>
      )}
    </div>
  );
}
