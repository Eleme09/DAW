"use client";

import { useRef, useState } from "react";
import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { useProjectStore } from "@/state/projectStore";
import { fxChipLabel } from "@/lib/fx/catalog";
import { faderDbToPos, faderPosToDb } from "@/lib/audio/faderLaw";
import type { Track } from "@/types/project";
import { MeterBar } from "../MeterBar";
import { BottomSheet } from "../BottomSheet";
import { AutoMixSheet } from "./AutoMixSheet";
import { MASTER_STYLES, TARGET_INFO } from "@/lib/mastering/masterChain";
import { SendSlots } from "./SendSlots";
import { MicIcon, MoreIcon, ChevronRightIcon, PlusIcon, MixIcon, FxChainIcon } from "../icons";


/**
 * Phone Mix View, laid out like BandLab's (user's own screenshot of it):
 * one compact solid-color card per track -
 *   row 1: number · name · Fx pill · [M | S] · ⋯
 *   row 2: long thin volume line with a white thumb · pan knob with L/R
 * - then AutoMix (our mix assistant), Mastering, and the master volume
 * BELOW the tracks. A narrow column on the right keeps each track's icon
 * (+ Fx badge) and the add-track button, as in BandLab.
 */
export function MobileMixView({ onAddTrack }: { onAddTrack: () => void }) {
  const tracks = useProjectStore((s) => s.project.tracks);
  const masterVolumeDb = useProjectStore((s) => s.project.masterVolumeDb);
  const setMasterVolume = useProjectStore((s) => s.setMasterVolume);
  const selectTrack = useProjectStore((s) => s.selectTrack);
  const setEffectsRackMode = useProjectStore((s) => s.setEffectsRackMode);
  const setMobileView = useProjectStore((s) => s.setMobileView);
  const [menuTrackId, setMenuTrackId] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const menuTrack = tracks.find((t) => t.id === menuTrackId) ?? null;

  function openTrackFx(trackId: string) {
    selectTrack(trackId);
    setEffectsRackMode("track");
    setMobileView("effects");
  }

  return (
    <div className="flex min-h-0 flex-1 gap-1.5 overflow-y-auto bg-ink p-1.5">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {tracks.map((track, i) => (
          <TrackCard
            key={track.id}
            index={i + 1}
            track={track}
            onOpenFx={() => openTrackFx(track.id)}
            onMore={() => setMenuTrackId(track.id)}
          />
        ))}

        <button
          onClick={() => setAssistantOpen(true)}
          className="flex h-14 items-center gap-3 rounded-xl bg-surf px-4 text-left"
        >
          <MixIcon className="h-5 w-5 text-bone-2" />
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold leading-tight text-bone">Automezcla</span>
            <span className="block text-xs text-bone-3">Niveles, paneo y reverb en un toque</span>
          </span>
          <ChevronRightIcon className="ml-auto h-5 w-5 text-bone-3" />
        </button>

        <MasteringRow onOpen={() => setMobileView("mastering")} />

        <div className="flex h-14 items-center gap-3 rounded-xl bg-surf px-4">
          <SpeakerIcon className="h-5 w-5 shrink-0 text-bone-2" />
          <div className="relative min-w-0 flex-1">
            <LineFader valueDb={masterVolumeDb} onChange={setMasterVolume} label="Master" thumb="ring" />
            <div className="pointer-events-none absolute inset-x-0 bottom-1.5 h-1 overflow-hidden rounded-full opacity-70">
              <MeterBar analyser={getAudioEngine().getMasterAnalyser()} vertical={false} />
            </div>
          </div>
          <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-bone-2">{masterVolumeDb.toFixed(1)} dB</span>
        </div>
      </div>

      {/* Columna derecha: ícono de cada pista (+ Fx si tiene) y botón de nueva pista */}
      <div className="flex w-12 shrink-0 flex-col gap-1.5">
        {tracks.map((track) => (
          <button
            key={track.id}
            onClick={() => selectTrack(track.id)}
            title={track.name}
            className="flex h-[84px] flex-col items-center justify-center gap-1"
          >
            <MicIcon className="h-6 w-6" style={{ color: track.color }} />
            {track.inserts.length > 0 && (
              <span className="flex h-5 w-7 items-center justify-center rounded-full text-ink" style={{ background: track.color }} title="Tiene efectos">
                <FxChainIcon className="h-3.5 w-3.5" />
              </span>
            )}
          </button>
        ))}
        <button
          onClick={onAddTrack}
          aria-label="Nueva pista"
          title="Nueva pista"
          className="flex h-14 items-center justify-center rounded-xl bg-surf text-bone"
        >
          <PlusIcon className="h-6 w-6" />
        </button>
      </div>

      <TrackMenu track={menuTrack} onClose={() => setMenuTrackId(null)} />
      <AutoMixSheet open={assistantOpen} onClose={() => setAssistantOpen(false)} />
    </div>
  );
}

/** Mastering row: on/off right here, the style and where it lands, tap to open. */
function MasteringRow({ onOpen }: { onOpen: () => void }) {
  const m = useProjectStore((s) => s.project.mastering);
  const setMastering = useProjectStore((s) => s.setMastering);
  const on = !!m?.enabled;
  return (
    <div className="flex h-14 items-center gap-3 rounded-xl bg-surf pl-4 pr-3" style={on ? { boxShadow: "inset 0 0 0 1px rgba(62,232,196,.35)" } : undefined}>
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <MixIcon className={`h-5 w-5 rotate-90 ${on ? "text-[#3ee8c4]" : "text-bone-2"}`} />
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold leading-tight text-bone">Masterizar</span>
          <span className="flex items-center gap-0.5 truncate text-xs text-bone-3">
            {m ? `${MASTER_STYLES[m.style].label} · ${TARGET_INFO[m.target].label}${m.measured && on ? ` · ${m.measured.masterLufs.toFixed(1)} LUFS` : ""}` : "Automática: estilo y volumen final"}
            <ChevronRightIcon className="h-3.5 w-3.5 shrink-0" />
          </span>
        </span>
      </button>
      <button
        role="switch"
        aria-checked={on}
        aria-label="Masterización encendida"
        onClick={() => (m ? setMastering({ enabled: !on }) : onOpen())}
        className="relative h-7 w-12 shrink-0 rounded-full transition-colors"
        style={{ background: on ? "#3ee8c4" : "#2a2c32" }}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
      </button>
    </div>
  );
}

function TrackCard({
  index,
  track,
  onOpenFx,
  onMore,
}: {
  index: number;
  track: Track;
  onOpenFx: () => void;
  onMore: () => void;
}) {
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const selectTrack = useProjectStore((s) => s.selectTrack);
  const firstFx = track.inserts[0];

  return (
    <div
      onClick={() => selectTrack(track.id)}
      style={{ background: track.color }}
      className={`flex h-[84px] shrink-0 flex-col justify-center gap-1 rounded-lg px-3 text-white ${track.muted ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span className="w-4 shrink-0 text-sm tabular-nums">{index}</span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{track.name}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenFx();
          }}
          title="Efectos de esta pista"
          className={`flex h-8 max-w-[38%] shrink-0 items-center gap-1 rounded-full px-3 text-sm ${
            firstFx ? "bg-black/25" : "bg-white/20"
          }`}
        >
          <FxChainIcon className="h-4 w-4 shrink-0" />
          {firstFx ? <span className="truncate">{fxChipLabel(track)}</span> : <span className="font-semibold">Efectos</span>}
        </button>
        <div className="flex h-8 shrink-0 items-center rounded-full bg-white/20 text-sm font-semibold">
          <button
            onClick={(e) => {
              e.stopPropagation();
              updateTrack(track.id, { muted: !track.muted });
            }}
            title={track.muted ? "Quitar silencio" : "Silenciar (Mute)"}
            className={`h-8 w-9 rounded-l-full ${track.muted ? "bg-white text-ink" : ""}`}
          >
            M
          </button>
          <span className="h-4 w-px bg-white/40" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              updateTrack(track.id, { solo: !track.solo });
            }}
            title={track.solo ? "Quitar solo" : "Escuchar solo esta pista"}
            className={`h-8 w-9 rounded-r-full ${track.solo ? "bg-white text-ink" : ""}`}
          >
            S
          </button>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMore();
          }}
          aria-label="Más opciones de pista"
          title="Más opciones"
          className="flex h-8 w-8 shrink-0 items-center justify-center"
        >
          <MoreIcon className="h-5 w-5" />
        </button>
      </div>
      <div className="flex items-center gap-3 pl-6">
        <div className="min-w-0 flex-1">
          <LineFader valueDb={track.volumeDb} onChange={(db) => updateTrack(track.id, { volumeDb: db })} label={track.name} />
        </div>
        <PanKnob value={track.pan} onChange={(pan) => updateTrack(track.id, { pan })} />
      </div>
    </div>
  );
}

function TrackMenu({ track, onClose }: { track: Track | null; onClose: () => void }) {
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const removeTrack = useProjectStore((s) => s.removeTrack);
  const moveTrack = useProjectStore((s) => s.moveTrack);
  const trackCount = useProjectStore((s) => s.project.tracks.length);
  // the sheet follows the live track (its order changes as it moves)
  const live = useProjectStore((s) => s.project.tracks.find((t) => t.id === track?.id) ?? null);
  if (!track || !live) return null;
  return (
    <BottomSheet open onClose={onClose} title={track.name}>
      <div className="flex gap-2">
        <button
          onClick={() => moveTrack(live.id, -1)}
          disabled={live.order <= 0}
          aria-label="Subir pista"
          className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-surf-2 text-sm font-medium text-bone disabled:opacity-30"
        >
          <span aria-hidden>↑</span> Subir
        </button>
        <button
          onClick={() => moveTrack(live.id, 1)}
          disabled={live.order >= trackCount - 1}
          aria-label="Bajar pista"
          className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-surf-2 text-sm font-medium text-bone disabled:opacity-30"
        >
          <span aria-hidden>↓</span> Bajar
        </button>
      </div>
      <label className="block text-xs text-bone-3">
        Nombre
        <input
          value={track.name}
          onChange={(e) => updateTrack(track.id, { name: e.target.value })}
          className="mt-1 block min-h-11 w-full rounded-xl bg-surf-2 px-3 text-sm text-bone outline-none"
        />
      </label>
      <SendSlots track={track} />
      <button
        onClick={() => {
          if (window.confirm(`¿Eliminar la pista "${track.name}" y su audio?`)) {
            removeTrack(track.id);
            onClose();
          }
        }}
        className="min-h-11 w-full rounded-xl bg-red-950 text-sm font-semibold text-red-400"
      >
        Eliminar pista
      </button>
    </BottomSheet>
  );
}

/** BandLab's volume line: thin, brighter up to the thumb, white circle thumb.
 * Relative drag (not jump-to-tap) so a touch doesn't yank the level; double
 * tap resets to 0 dB. 44px tall hit area. */
function LineFader({
  valueDb,
  onChange,
  label,
  thumb = "solid",
}: {
  valueDb: number;
  onChange: (db: number) => void;
  label: string;
  thumb?: "solid" | "ring";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; pos: number } | null>(null);
  // fader law (lib/audio/faderLaw.ts): 0 dB at 79 %, halfway -12 dB
  const pct = faderDbToPos(valueDb) * 100;

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current || !ref.current) return;
    const width = ref.current.clientWidth || 1;
    onChange(Math.round(faderPosToDb(drag.current.pos + (e.clientX - drag.current.x) / width) * 10) / 10);
  }

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, pos: faderDbToPos(valueDb) };
      }}
      onPointerMove={onPointerMove}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onDoubleClick={() => onChange(0)}
      title={`${label} — ${valueDb.toFixed(1)} dB (doble toque: 0 dB)`}
      style={{ touchAction: "none" }}
      className="relative h-11 w-full cursor-ew-resize select-none"
    >
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-black/30" />
      <div className="pointer-events-none absolute left-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-white" style={{ width: `${pct}%` }} />
      <div
        className={`pointer-events-none absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full shadow ${
          thumb === "ring" ? "border-2 border-white bg-surf-3" : "bg-white"
        }`}
        style={{ left: `calc(${pct}% - 12px)` }}
      />
    </div>
  );
}

/** BandLab's pan knob: white disc with an indicator line, dotted arc and L/R. */
function PanKnob({ value, onChange }: { value: number; onChange: (pan: number) => void }) {
  const drag = useRef<{ y: number; x: number; v: number } | null>(null);
  const angle = value * 135;
  const ticks = Array.from({ length: 7 }, (_, i) => -135 + i * 45);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { y: e.clientY, x: e.clientX, v: value };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const delta = (drag.current.y - e.clientY + (e.clientX - drag.current.x)) / 120;
        onChange(Math.round(Math.min(1, Math.max(-1, drag.current.v + delta)) * 100) / 100);
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onDoubleClick={() => onChange(0)}
      title={`Paneo ${value === 0 ? "centro" : value < 0 ? `${Math.round(-value * 100)} L` : `${Math.round(value * 100)} R`} (doble toque: centro)`}
      style={{ touchAction: "none" }}
      className="relative h-11 w-11 shrink-0 cursor-ns-resize select-none"
    >
      <svg viewBox="0 0 44 44" className="pointer-events-none absolute inset-0">
        {ticks.map((t) => {
          const r = ((t - 90) * Math.PI) / 180;
          return <circle key={t} cx={22 + 19 * Math.cos(r)} cy={22 + 19 * Math.sin(r)} r={0.9} fill="white" opacity={0.8} />;
        })}
        <circle cx="22" cy="22" r="13" fill="white" />
        <line
          x1="22"
          y1="22"
          x2={22 + 10 * Math.cos(((angle - 90) * Math.PI) / 180)}
          y2={22 + 10 * Math.sin(((angle - 90) * Math.PI) / 180)}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          className="text-[#2f80ed]"
        />
        <text x="3" y="43" fontSize="7" fill="white">L</text>
        <text x="37" y="43" fontSize="7" fill="white">R</text>
      </svg>
    </div>
  );
}

function SpeakerIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 9h3l4-4v14l-4-4H4z" />
      <path d="M15 9v6M18 7v10M21 10v4" />
    </svg>
  );
}
