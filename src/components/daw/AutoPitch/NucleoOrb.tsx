"use client";

import { useEffect, useRef, useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import type { PitchTelemetry } from "@/audio-engine/autopitch/AutoPitchEffect";
import { NOTE_SHORT_ES, autoPitchLevelLabel, type AutoPitchSettings } from "@/types/autoPitch";
import type { TrackId } from "@/types/project";
import { scalePitchClasses } from "./nucleo";

interface Props {
  trackId: TrackId;
  settings: AutoPitchSettings;
  color: string;
  size: number;
  onLevel: (level: number) => void;
}

/** The pull arc: from lower left, over the top, to lower right. */
const ARC_START = (150 * Math.PI) / 180;
const ARC_SWEEP = (240 * Math.PI) / 180;
/** Pitch reports older than this mean nothing is singing now. */
const STALE_MS = 220;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Núcleo's live view, and its Level control. The twelve pitch classes sit
 * on a ring with the key's tonic on top; the scale's notes are lit energy
 * levels, the others dim. While audio plays through the track, the voice is
 * a particle on that ring at the pitch it is really sung, a beam pulls it
 * to the note Núcleo is taking it to, and that level flares; the core shows
 * the note and how far off the voice came in. The outer arc is the pull
 * (Level): drag anywhere on the orb, up/right for more.
 */
export function NucleoOrb({ trackId, settings, color, size, onLevel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tele = useRef<{ p: PitchTelemetry; at: number } | null>(null);
  const drag = useRef<{ x: number; y: number; start: number } | null>(null);
  const [showValue, setShowValue] = useState(false);
  const hideTimer = useRef<number | null>(null);
  // the drawing loop reads the latest props without restarting
  const live = useRef({ settings, color, size });
  useEffect(() => {
    live.current = { settings, color, size };
  });

  useEffect(() => {
    return getAudioEngine().watchAutoPitch(trackId, (p) => {
      tele.current = { p, at: performance.now() };
    });
  }, [trackId]);

  useEffect(
    () => () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    },
    []
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let raf = 0;
    // displayed values glide toward the reports (they come every ~17 ms)
    let shownIn = -1;
    let shownOut = -1;
    let presence = 0;
    const flare = new Float32Array(12);
    const trail: { x: number; y: number }[] = [];

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const { settings: st, color: col, size: S } = live.current;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const px = Math.round(S * dpr);
      if (canvas.width !== px) {
        canvas.width = px;
        canvas.height = px;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, S, S);
      const [r, g, b] = st.enabled ? hexToRgb(col) : [120, 124, 132];
      const rgba = (a: number) => `rgba(${r},${g},${b},${a})`;
      const c = S / 2;
      const R = S * 0.33;
      const key = ((st.key % 12) + 12) % 12;
      const lit = scalePitchClasses(st);
      const level = st.enabled ? st.level : 0;
      const t = reduce ? 0 : now / 1000;

      // where a (fractional) MIDI pitch sits on the ring: tonic on top
      const angleOf = (midi: number) => -Math.PI / 2 + (2 * Math.PI * (midi - key)) / 12;
      const at = (midi: number, rad: number) => [c + rad * Math.cos(angleOf(midi)), c + rad * Math.sin(angleOf(midi))] as const;

      const rep = tele.current;
      const fresh = !!rep && now - rep.at < STALE_MS && rep.p.v === 1 && rep.p.d !== null && st.enabled;
      presence += ((fresh ? 1 : 0) - presence) * 0.18;
      if (fresh && rep) {
        const d = rep.p.d as number;
        const o = (rep.p.o ?? d) as number;
        // glide in MIDI space, re-anchored on big jumps (no lap around the ring)
        shownIn = shownIn < 0 || Math.abs(d - shownIn) > 3 ? d : shownIn + (d - shownIn) * 0.35;
        shownOut = shownOut < 0 || Math.abs(o - shownOut) > 3 ? o : shownOut + (o - shownOut) * 0.5;
        if (rep.p.t !== null) {
          const pc = ((Math.round(rep.p.t) % 12) + 12) % 12;
          flare[pc] = Math.min(1, flare[pc] + 0.25);
        }
      }
      for (let i = 0; i < 12; i++) flare[i] *= 0.9;

      // field: soft glow, stronger with the pull
      const glow = ctx.createRadialGradient(c, c, S * 0.04, c, c, S * 0.5);
      glow.addColorStop(0, rgba(0.1 + 0.22 * level));
      glow.addColorStop(0.55, rgba(0.04 + 0.06 * level));
      glow.addColorStop(1, rgba(0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, S, S);

      // orbitals around the core, turning slowly; tighter with more pull
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.translate(c, c);
        ctx.rotate(i * (Math.PI / 3) + t * (0.12 + 0.05 * i) * (st.enabled ? 1 : 0));
        ctx.beginPath();
        ctx.ellipse(0, 0, R * (0.62 - 0.12 * level), R * (0.22 - 0.05 * level), 0, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(0.14 + 0.16 * level);
        ctx.stroke();
        // an electron riding each orbital
        const a = t * (0.9 + 0.3 * i) + i * 2;
        const ex = R * (0.62 - 0.12 * level) * Math.cos(a);
        const ey = R * (0.22 - 0.05 * level) * Math.sin(a);
        ctx.beginPath();
        ctx.arc(ex, ey, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = rgba(0.5 + 0.4 * level);
        ctx.fill();
        ctx.restore();
      }

      // the ring of the twelve notes
      ctx.beginPath();
      ctx.arc(c, c, R, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.font = `600 ${Math.max(10, S * 0.042)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let pc = 0; pc < 12; pc++) {
        const [x, y] = at(pc, R);
        if (lit.has(pc)) {
          const f = flare[pc];
          const rad = S * (0.019 + 0.012 * f);
          const halo = ctx.createRadialGradient(x, y, 0, x, y, rad * 3.2);
          halo.addColorStop(0, rgba(0.55 + 0.4 * f));
          halo.addColorStop(1, rgba(0));
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(x, y, rad * 3.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x, y, rad, 0, Math.PI * 2);
          ctx.fillStyle = pc === key ? "#ffffff" : rgba(0.95);
          ctx.fill();
          const [lx, ly] = at(pc, R + S * 0.068);
          ctx.fillStyle = `rgba(255,255,255,${0.42 + 0.5 * f})`;
          ctx.fillText(NOTE_SHORT_ES[pc], lx, ly);
        } else {
          ctx.beginPath();
          ctx.arc(x, y, S * 0.006, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.18)";
          ctx.fill();
        }
      }

      // the voice: a particle where it is sung, pulled to its note
      if (presence > 0.02 && shownIn >= 0) {
        const [vx, vy] = at(shownIn, R * 0.86);
        const [ox, oy] = at(shownOut, R);
        trail.push({ x: vx, y: vy });
        if (trail.length > 14) trail.shift();
        for (let i = 0; i < trail.length; i++) {
          ctx.beginPath();
          ctx.arc(trail[i].x, trail[i].y, 1 + (2.2 * i) / trail.length, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${(0.25 * presence * i) / trail.length})`;
          ctx.fill();
        }
        const beam = ctx.createLinearGradient(vx, vy, ox, oy);
        beam.addColorStop(0, `rgba(255,255,255,${0.5 * presence})`);
        beam.addColorStop(1, rgba(0.9 * presence));
        ctx.strokeStyle = beam;
        ctx.lineWidth = 1 + 2.5 * level;
        ctx.beginPath();
        ctx.moveTo(vx, vy);
        ctx.lineTo(ox, oy);
        ctx.stroke();
        const core = ctx.createRadialGradient(vx, vy, 0, vx, vy, S * 0.04);
        core.addColorStop(0, `rgba(255,255,255,${presence})`);
        core.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(vx, vy, S * 0.04, 0, Math.PI * 2);
        ctx.fill();
      } else {
        trail.length = 0;
        if (presence < 0.02) {
          shownIn = -1;
          shownOut = -1;
        }
      }

      // the core
      const pulse = 1 + (reduce ? 0 : 0.04 * Math.sin(t * 2.2)) + 0.08 * presence;
      const coreR = S * 0.105 * pulse;
      const nucleus = ctx.createRadialGradient(c - coreR * 0.3, c - coreR * 0.35, coreR * 0.1, c, c, coreR);
      nucleus.addColorStop(0, `rgba(${Math.min(255, r + 90)},${Math.min(255, g + 90)},${Math.min(255, b + 90)},0.95)`);
      nucleus.addColorStop(0.6, rgba(0.55 + 0.3 * level));
      nucleus.addColorStop(1, rgba(0.15));
      ctx.fillStyle = nucleus;
      ctx.beginPath();
      ctx.arc(c, c, coreR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#0b0c0f";
      if (presence > 0.5 && rep && rep.p.t !== null && rep.p.d !== null) {
        const note = NOTE_SHORT_ES[((Math.round(rep.p.t) % 12) + 12) % 12];
        const off = Math.round((rep.p.d - rep.p.t) * 100);
        ctx.font = `800 ${S * 0.07}px ui-sans-serif, system-ui, sans-serif`;
        ctx.fillText(note, c, c - S * 0.012);
        ctx.font = `700 ${S * 0.036}px ui-sans-serif, system-ui, sans-serif`;
        ctx.fillText(`${off > 0 ? "+" : off < 0 ? "−" : ""}${Math.abs(off)}¢`, c, c + S * 0.045);
      } else {
        ctx.font = `800 ${S * 0.06}px ui-sans-serif, system-ui, sans-serif`;
        ctx.fillText(NOTE_SHORT_ES[key], c, c);
      }

      // the pull arc
      const RA = S * 0.475;
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(3, S * 0.014);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.arc(c, c, RA, ARC_START, ARC_START + ARC_SWEEP);
      ctx.stroke();
      if (level > 0.001) {
        ctx.strokeStyle = rgba(0.95);
        ctx.beginPath();
        ctx.arc(c, c, RA, ARC_START, ARC_START + ARC_SWEEP * level);
        ctx.stroke();
        const hx = c + RA * Math.cos(ARC_START + ARC_SWEEP * level);
        const hy = c + RA * Math.sin(ARC_START + ARC_SWEEP * level);
        ctx.beginPath();
        ctx.arc(hx, hy, S * 0.017, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  function flashValue() {
    setShowValue(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setShowValue(false), 1500);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!settings.enabled) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, start: settings.level };
    flashValue();
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const delta = (d.y - e.clientY + (e.clientX - d.x)) / 220;
    onLevel(Math.min(1, Math.max(0, Math.round((d.start + delta) * 100) / 100)));
    flashValue();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!settings.enabled) return;
    const step = e.key === "ArrowUp" || e.key === "ArrowRight" ? 0.05 : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -0.05 : 0;
    if (!step) return;
    e.preventDefault();
    onLevel(Math.min(1, Math.max(0, Math.round((settings.level + step) * 100) / 100)));
    flashValue();
  }

  return (
    <div className="flex flex-col items-center">
      <div
        role="slider"
        tabIndex={0}
        aria-label="Fuerza de Núcleo"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(settings.level * 100)}
        aria-disabled={!settings.enabled}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={onKeyDown}
        className="touch-none select-none outline-none"
        style={{ width: size, height: size }}
      >
        <canvas ref={canvasRef} style={{ width: size, height: size }} />
      </div>
      <div className="flex h-6 items-center justify-center">
        {showValue && settings.enabled ? (
          <span className="rounded-full px-3 py-0.5 text-[12.5px] font-bold tabular-nums text-ink" style={{ background: color }}>
            Fuerza {Math.round(settings.level * 100)} %
          </span>
        ) : (
          <span className="text-[12.5px] tracking-wide text-bone-3">
            {autoPitchLevelLabel(settings.level, settings.enabled)}
            {settings.enabled && <span className="tabular-nums text-bone-2"> · {Math.round(settings.level * 100)} %</span>}
          </span>
        )}
      </div>
    </div>
  );
}
