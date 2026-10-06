"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { AUTOPITCH_COLORS, AutoPitchKnob } from "./AutoPitchKnob";
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
  // the stage between the header and the presets: the knob fits whatever
  // the phone (an iPhone SE leaves ~250 px for it)
  const [stageH, setStageH] = useState(400);
  const stageObs = useRef<ResizeObserver | null>(null);
  const stageRef = useCallback((el: HTMLDivElement | null) => {
    stageObs.current?.disconnect();
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setStageH(e.contentRect.height));
    ro.observe(el);
    stageObs.current = ro;
  }, []);

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

  const color = AUTOPITCH_COLORS[recipe.category];

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ink">
      <div className="flex h-14 shrink-0 items-center gap-2 px-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: `${track.color}2e` }}>
          <MicIcon className="h-5 w-5" style={{ color: track.color }} />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bone-3">AutoPitch</div>
          <div className="truncate text-[15px] font-semibold text-bone">{track.name}</div>
        </div>
        <button
          onClick={() => {
            setKeyOpen((o) => !o);
            setSettingsOpen(false);
          }}
          aria-expanded={keyOpen}
          title="Tonalidad y escala de AutoPitch"
          className={`flex h-9 items-center gap-1.5 rounded-full pl-3 pr-2.5 text-[14px] font-medium ${keyOpen ? "bg-bone text-ink" : "bg-surf-2 text-bone"}`}
          style={keyOpen ? undefined : { boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)" }}
        >
          <NoteIcon />
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
          className={`flex h-9 w-10 items-center justify-center rounded-full ${settingsOpen ? "bg-bone text-ink" : "bg-surf-2 text-bone"}`}
          style={settingsOpen ? undefined : { boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)" }}
        >
          <TuneIcon className="h-4 w-4 rotate-90" />
        </button>
        <button onClick={() => setMobileView("timeline")} aria-label="Cerrar AutoPitch" className="flex h-9 w-9 items-center justify-center text-bone-2">
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      <div
        ref={stageRef}
        className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden"
        style={{ background: `radial-gradient(ellipse 70% 60% at 50% 40%, ${color}${ap.enabled ? "24" : "0c"} 0%, transparent 70%)` }}
      >
        {settingsOpen ? (
          <SettingsCard settings={ap} color={color} onChange={update} />
        ) : (
          <div className={`flex flex-col items-center transition-opacity ${keyOpen ? "opacity-30" : ""}`}>
            <AutoPitchKnob
              category={recipe.category}
              level={ap.level}
              enabled={ap.enabled}
              onChange={(level) => update({ level })}
              size={Math.max(120, Math.min(216, stageH - (stageH < 300 ? 70 : 112)))}
            />
            <div className="mt-1 px-6 text-center">
              <div className={`text-[22px] font-extrabold tracking-tight ${ap.enabled ? "text-bone" : "text-bone-3"}`}>{ap.enabled ? recipe.label : "AutoPitch apagado"}</div>
              <p className={`mx-auto mt-0.5 line-clamp-2 max-w-[320px] text-[12.5px] leading-snug text-bone-3 ${stageH < 300 ? "hidden" : ""}`}>
                {ap.enabled ? recipe.description : `Toca ${recipe.label} otra vez para encenderlo.`}
              </p>
            </div>
          </div>
        )}
        {keyOpen && <KeyDropdown track={track} settings={ap} onChange={update} />}
      </div>

      <PresetBrowser settings={ap} onChange={update} />
    </div>
  );
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 opacity-70" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </svg>
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
  const color = AUTOPITCH_COLORS[category];
  return (
    <div className="shrink-0 pb-3">
      <div className="mx-3 mb-3 flex rounded-2xl bg-surf-2 p-1" style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,.05)" }}>
        {AUTOPITCH_CATEGORIES.map((c) => {
          const active = c.id === category;
          const col = AUTOPITCH_COLORS[c.id];
          return (
            <button
              key={c.id}
              onClick={() => pickCategory(c.id)}
              aria-pressed={active}
              className={`h-9 flex-1 rounded-xl text-[13px] font-semibold transition-colors ${active ? "text-white" : "text-bone-3"}`}
              style={active ? { background: `linear-gradient(180deg, ${col}, ${col}c0)`, boxShadow: `0 4px 14px ${col}50` } : undefined}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <div ref={rowRef} className="flex gap-2 overflow-x-auto px-3 pt-1 [scrollbar-width:none]">
        {presets.map((r) => {
          const selected = r.id === settings.presetId;
          const on = selected && settings.enabled;
          const circle: React.CSSProperties = on
            ? { background: `radial-gradient(circle at 35% 28%, ${color}, ${color}99 70%)`, color: "#fff", boxShadow: `0 0 0 2px #0a0a0a, 0 0 0 4px ${color}, 0 8px 20px ${color}55` }
            : selected
              ? { background: "#34363c", color: "#c9cacf", boxShadow: "0 0 0 2px #0a0a0a, 0 0 0 4px #4d5058" }
              : { background: "#1b1c20", color: "#8f919a", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.07)" };
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
              className="flex w-[70px] shrink-0 flex-col items-center gap-1.5 pt-1"
            >
              <span className="relative flex h-[58px] w-[58px] items-center justify-center rounded-full transition-shadow" style={circle}>
                <AutoPitchPresetIcon presetId={r.id} className="h-7 w-7" />
                {selected && !settings.enabled && <span className="absolute -bottom-1.5 rounded-full bg-[#4d5058] px-1.5 text-[9px] font-bold tracking-wider text-white">OFF</span>}
              </span>
              <span className={`h-8 text-center text-[12px] leading-tight ${selected ? "font-semibold text-bone" : "text-bone-3"}`}>{r.label}</span>
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

  const box = "absolute inset-x-3 top-1 z-20 rounded-2xl border border-white/10 bg-[#17181c] p-2 shadow-2xl";

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

function SettingsCard({ settings, color, onChange }: { settings: AutoPitchSettings; color: string; onChange: (p: Partial<AutoPitchSettings>) => void }) {
  const pct = Math.round(settings.harmonyMix * 100);
  return (
    <div className="mx-3 max-h-[calc(100%-16px)] w-[calc(100%-24px)] overflow-y-auto rounded-3xl border border-white/10 bg-[#141518] px-4 pb-4 pt-3 shadow-2xl [scrollbar-width:none]">
      <div className="text-center text-[16px] font-bold text-bone">Ajustes de AutoPitch</div>
      <div className="mt-3 flex items-center justify-between">
        <div>
          <div className="text-[14px] font-semibold text-bone">Mezcla de armonías</div>
          <div className="text-[11.5px] text-bone-3">Volumen de las voces extra frente a tu voz</div>
        </div>
        <span className="rounded-lg bg-black/40 px-2.5 py-1 text-[14px] font-semibold tabular-nums text-bone">{pct} %</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={pct}
        onChange={(e) => onChange({ harmonyMix: Number(e.target.value) / 100 })}
        aria-label="Mezcla de armonías"
        className="mt-3 w-full"
        style={{ accentColor: color }}
      />
      <div className="mt-3 text-[14px] font-semibold text-bone">Algoritmo</div>
      <div className="mt-2 flex flex-col gap-1.5" role="radiogroup" aria-label="Algoritmo">
        {AUTOPITCH_ALGORITHMS.map((a) => {
          const active = a.id === settings.algorithm;
          return (
            <button
              key={a.id}
              role="radio"
              aria-checked={active}
              onClick={() => onChange({ algorithm: a.id as AutoPitchAlgorithm })}
              className="flex items-start gap-3 rounded-2xl px-3 py-2 text-left"
              style={{ background: active ? `${color}1f` : "rgba(255,255,255,.03)", boxShadow: active ? `inset 0 0 0 1.5px ${color}` : "inset 0 0 0 1px rgba(255,255,255,.06)" }}
            >
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2" style={{ borderColor: active ? color : "#5b5e66" }}>
                {active && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-bone">{a.label}</span>
                {active && <span className="mt-0.5 block text-[11.5px] leading-snug text-bone-3">{a.help}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
