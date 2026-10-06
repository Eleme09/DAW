"use client";

import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "@/state/projectStore";
import { detectTrackKey } from "@/lib/audio/autoKey";
import {
  AUTOPITCH_ALGORITHMS,
  AUTOPITCH_CATEGORIES,
  AUTOPITCH_RECIPES,
  AUTOPITCH_RECIPE_BY_ID,
  AUTOPITCH_SCALES,
  NOTE_NAMES_ES,
  autoPitchKeyLabel,
  type AutoPitchAlgorithm,
  type AutoPitchCategory,
  type AutoPitchSettings,
} from "@/types/autoPitch";
import type { Track } from "@/types/project";
import { AutoPitchKnob } from "./AutoPitchKnob";
import { AutoPitchPresetIcon } from "./AutoPitchIcons";
import { MicIcon, CloseIcon, ChevronDownIcon, TuneIcon } from "../icons";

/**
 * BandLab's AutoPitch panel (user's recordings): opens under the ruler when
 * the AutoPitch pill is tapped. Header: track · key pill · settings · close.
 * Body: the Level knob (or the AutoPitch settings card), then the four
 * category tabs and the scrolling preset row. The key pill drops down the
 * note row, the scale row and "Detectar automáticamente la clave".
 */
export function AutoPitchPanel() {
  const track = useProjectStore((s) => s.project.tracks.find((t) => t.id === s.selectedTrackId) ?? null);
  const setMobileView = useProjectStore((s) => s.setMobileView);
  const setAutoPitch = useProjectStore((s) => s.setAutoPitch);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);

  if (!track) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-bone-3">
        Toca una pista de voz para usar AutoPitch.
      </div>
    );
  }
  const ap = track.autoPitch;
  if (!ap) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <button onClick={() => setAutoPitch(track.id, {})} className="h-11 rounded-full bg-bone px-5 text-sm font-semibold text-ink">
          Activar AutoPitch en {track.name}
        </button>
      </div>
    );
  }

  const update = (patch: Partial<AutoPitchSettings>) => setAutoPitch(track.id, patch);
  const recipe = AUTOPITCH_RECIPE_BY_ID[ap.presetId];

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ink">
      <div className="flex h-14 shrink-0 items-center gap-2 px-3">
        <MicIcon className="h-6 w-6 shrink-0" style={{ color: track.color }} />
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-bone">{track.name}</span>
        <button
          onClick={() => {
            setKeyOpen((o) => !o);
            setSettingsOpen(false);
          }}
          aria-expanded={keyOpen}
          title="Tonalidad y escala de AutoPitch"
          className={`flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[15px] ${keyOpen ? "bg-bone text-ink" : "bg-surf-2 text-bone"}`}
        >
          {autoPitchKeyLabel(ap)}
          <ChevronDownIcon className={`h-4 w-4 transition-transform ${keyOpen ? "rotate-180" : ""}`} />
        </button>
        <button
          onClick={() => {
            setSettingsOpen((o) => !o);
            setKeyOpen(false);
          }}
          aria-label="Ajustes de AutoPitch"
          aria-pressed={settingsOpen}
          className={`flex h-9 w-12 items-center justify-center rounded-full ${settingsOpen ? "bg-bone text-ink" : "bg-surf-2 text-bone"}`}
        >
          <TuneIcon className="h-4 w-4 rotate-90" />
        </button>
        <button onClick={() => setMobileView("timeline")} aria-label="Cerrar AutoPitch" className="flex h-9 w-9 items-center justify-center text-bone-2">
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden">
        {settingsOpen ? (
          <SettingsCard settings={ap} onChange={update} />
        ) : (
          <div className={keyOpen ? "opacity-30" : ""}>
            <AutoPitchKnob category={recipe.category} level={ap.level} enabled={ap.enabled} onChange={(level) => update({ level })} />
          </div>
        )}
        {keyOpen && <KeyDropdown track={track} settings={ap} onChange={update} />}
      </div>

      <PresetBrowser settings={ap} onChange={update} />
    </div>
  );
}

function PresetBrowser({ settings, onChange }: { settings: AutoPitchSettings; onChange: (p: Partial<AutoPitchSettings>) => void }) {
  const current = AUTOPITCH_RECIPE_BY_ID[settings.presetId];
  // The tab shown is always the current effect's category: picking another
  // tab switches to that tab's first effect (BandLab does the same).
  const category = current.category;
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const row = rowRef.current;
    const el = row?.querySelector<HTMLElement>(`[data-preset="${settings.presetId}"]`);
    if (row && el) row.scrollTo({ left: Math.max(0, el.offsetLeft - row.clientWidth / 2 + el.clientWidth / 2), behavior: "smooth" });
  }, [settings.presetId, category]);

  function pickCategory(id: AutoPitchCategory) {
    if (current.category !== id) {
      const first = AUTOPITCH_RECIPES.find((r) => r.category === id);
      if (first) onChange({ presetId: first.id, enabled: true });
    }
  }

  const presets = AUTOPITCH_RECIPES.filter((r) => r.category === category);
  return (
    <div className="shrink-0 pb-3">
      <div className="flex justify-center gap-1 px-2 pb-3">
        {AUTOPITCH_CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => pickCategory(c.id)}
            aria-pressed={c.id === category}
            className={`h-10 rounded-lg px-3.5 text-[15px] ${c.id === category ? "bg-surf-2 font-medium text-bone" : "text-bone-3"}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div ref={rowRef} className="flex gap-2.5 overflow-x-auto px-3 [scrollbar-width:none]">
        {presets.map((r) => {
          const selected = r.id === settings.presetId;
          const circle = selected ? (settings.enabled ? "bg-bone text-ink" : "bg-[#4a4d55] text-bone") : "bg-surf-2 text-bone-3";
          return (
            <button
              key={r.id}
              data-preset={r.id}
              // BandLab: tapping the effect that is already selected turns
              // AutoPitch OFF (knob goes grey, "Off"); tapping it again, or
              // another effect, turns it back on.
              onClick={() => onChange(selected ? { enabled: !settings.enabled } : { presetId: r.id, enabled: true })}
              title={selected && settings.enabled ? `${r.description} — toca otra vez para apagar AutoPitch` : r.description}
              aria-pressed={selected && settings.enabled}
              className="flex w-[68px] shrink-0 flex-col items-center gap-1.5"
            >
              <span className={`flex h-16 w-16 items-center justify-center rounded-full ${circle}`}>
                <AutoPitchPresetIcon presetId={r.id} className="h-7 w-7" />
              </span>
              <span className={`h-8 text-center text-[13px] leading-tight ${selected ? "text-bone" : "text-bone-3"}`}>{r.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const BLACK_KEYS = [1, 3, -1, 6, 8, 10];
const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11];

function KeyDropdown({ track, settings, onChange }: { track: Track; settings: AutoPitchSettings; onChange: (p: Partial<AutoPitchSettings>) => void }) {
  const [state, setState] = useState<{ phase: "idle" } | { phase: "detecting" } | { phase: "done"; label: string | null }>({ phase: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const notesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = notesRef.current?.querySelector<HTMLElement>(`[data-note="${settings.key}"]`);
    el?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [settings.key]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function detect() {
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ phase: "detecting" });
    const result = await detectTrackKey(track, controller.signal);
    if (controller.signal.aborted) return;
    if (!result) {
      setState({ phase: "done", label: null });
      return;
    }
    const scale = result.scale === "minor" ? "minor" : "major";
    onChange({ key: result.key, scale });
    setState({ phase: "done", label: autoPitchKeyLabel({ key: result.key, scale }) });
  }

  const box = "absolute inset-x-3 top-0 z-20 rounded-xl bg-[#1c1e23] p-2 shadow-2xl";

  if (state.phase === "detecting") {
    return (
      <div className={box}>
        <div className="flex flex-col items-center gap-3 py-5">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-bone-3 border-t-transparent" />
          <span className="text-[15px] text-bone-3">Detectando clave...</span>
        </div>
        <button
          onClick={() => {
            abortRef.current?.abort();
            setState({ phase: "idle" });
          }}
          className="h-11 w-full rounded-lg bg-surf-2 text-[15px] text-bone"
        >
          Cancelar
        </button>
      </div>
    );
  }

  if (state.phase === "done") {
    return (
      <div className={box}>
        <div className="flex flex-col items-center gap-3 py-5 text-center">
          {state.label ? (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#2f80f6] text-white">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5 10 17l9-10" />
              </svg>
            </span>
          ) : null}
          <span className="px-4 text-[15px] text-bone-3">
            {state.label ? `Clave de pista detectada: ${state.label}` : "No se encontró voz afinable en esta pista. Graba o importa audio primero."}
          </span>
        </div>
        <button onClick={() => setState({ phase: "idle" })} className="h-11 w-full rounded-lg bg-surf-2 text-[15px] font-medium text-bone">
          Hecho
        </button>
      </div>
    );
  }

  const pill = (active: boolean) =>
    `h-10 shrink-0 whitespace-nowrap rounded-lg px-3 text-[15px] ${active ? "bg-surf-3 text-bone" : "text-bone-3"}`;

  return (
    <div className={box}>
      <div ref={notesRef} className="flex overflow-x-auto [scrollbar-width:none]">
        {NOTE_NAMES_ES.map((name, i) => (
          <button key={name} data-note={i} onClick={() => onChange({ key: i })} className={pill(settings.key === i && settings.scale !== "chromatic")}>
            {name}
          </button>
        ))}
      </div>
      <div className="mt-1 flex overflow-x-auto [scrollbar-width:none]">
        {AUTOPITCH_SCALES.map((s) => (
          <button key={s.id} onClick={() => onChange({ scale: s.id })} className={pill(settings.scale === s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      {settings.scale === "custom" && (
        <div className="px-1 pb-1 pt-2">
          <p className="pb-2 text-center text-xs text-bone-3">Toca para personalizar la escala:</p>
          <div className="mx-auto flex max-w-[300px] flex-col gap-1.5">
            <div className="flex justify-center gap-1.5 px-5">
              {BLACK_KEYS.map((pc, i) =>
                pc < 0 ? (
                  <span key={`gap${i}`} className="w-9" />
                ) : (
                  <NoteToggle key={pc} pc={pc} settings={settings} onChange={onChange} />
                )
              )}
            </div>
            <div className="flex justify-center gap-1.5">
              {WHITE_KEYS.map((pc) => (
                <NoteToggle key={pc} pc={pc} settings={settings} onChange={onChange} />
              ))}
            </div>
          </div>
        </div>
      )}
      <button onClick={() => void detect()} className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-surf-2 text-[15px] text-bone">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l11-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="17" cy="16" r="3" />
        </svg>
        Detectar automáticamente la clave
      </button>
    </div>
  );
}

function NoteToggle({ pc, settings, onChange }: { pc: number; settings: AutoPitchSettings; onChange: (p: Partial<AutoPitchSettings>) => void }) {
  const on = (settings.customMask & (1 << pc)) !== 0;
  const label = NOTE_NAMES_ES[pc].split("/")[0];
  return (
    <button
      onClick={() => onChange({ customMask: settings.customMask ^ (1 << pc) })}
      aria-pressed={on}
      title={NOTE_NAMES_ES[pc]}
      className={`flex h-9 w-9 items-center justify-center rounded-md border text-[11px] ${on ? "border-bone text-bone" : "border-line-2 text-bone-3"}`}
    >
      {label}
    </button>
  );
}

function SettingsCard({ settings, onChange }: { settings: AutoPitchSettings; onChange: (p: Partial<AutoPitchSettings>) => void }) {
  const [info, setInfo] = useState(false);
  const algorithm = AUTOPITCH_ALGORITHMS.find((a) => a.id === settings.algorithm) ?? AUTOPITCH_ALGORITHMS[0];
  const pct = Math.round(settings.harmonyMix * 100);
  return (
    <div className="mx-3 w-[calc(100%-24px)] rounded-2xl bg-[#1c1e23] px-4 pb-5 pt-3">
      <div className="relative flex h-11 items-center justify-center">
        <button
          onClick={() => setInfo((v) => !v)}
          aria-label="Qué hace cada ajuste"
          className="absolute left-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-bone text-sm font-bold text-bone"
        >
          i
        </button>
        <span className="text-[17px] font-medium text-bone">Ajustes de AutoPitch</span>
      </div>
      {info && (
        <p className="mt-2 rounded-lg bg-surf-2 p-3 text-xs leading-relaxed text-bone-2">
          Harmony Mix: volumen de las voces armonizadas frente a tu voz. Algorithm: cómo se cambia el tono. {algorithm.help}
        </p>
      )}
      <div className="mt-5 flex items-center justify-between">
        <span className="text-[16px] text-bone-2">Harmony Mix</span>
        <span className="rounded-lg bg-[#15171b] px-3 py-1.5 text-[15px] tabular-nums text-bone">
          {pct} <span className="text-bone-3">%</span>
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={pct}
        onChange={(e) => onChange({ harmonyMix: Number(e.target.value) / 100 })}
        aria-label="Harmony Mix"
        className="mt-4 w-full accent-bone-2"
      />
      <div className="mt-7 flex items-center justify-between gap-3">
        <span className="text-[16px] text-bone-2">Algorithm</span>
        <label className="relative">
          <select
            value={settings.algorithm}
            onChange={(e) => onChange({ algorithm: e.target.value as AutoPitchAlgorithm })}
            aria-label="Algorithm"
            className="h-11 appearance-none rounded-lg bg-[#15171b] pl-4 pr-10 text-[15px] text-bone-2 outline-none"
          >
            {AUTOPITCH_ALGORITHMS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-bone-2" />
        </label>
      </div>
    </div>
  );
}
