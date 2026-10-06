"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useProjectStore } from "@/state/projectStore";
import { FX_CATALOG } from "@/lib/fx/catalog";
import type { EffectInstance } from "@/types/effects";
import type { FxContext } from "./FxPanel";
import { CoverArt, FxTile } from "./art";
import { FxArt } from "./scenes";
import { BlendSlider } from "./BlendSlider";
import { EffectFace } from "./faces";
import { KnobDefs } from "./kit";
import { BackIcon, TrashIcon } from "../icons";

/**
 * The chain: a strip of the effects in order (tap to open, + to add), the
 * selected effect's face underneath on its own panel - BandLab's editor
 * with our faces.
 */
export function ChainEditor({
  ctx,
  selected,
  onSelect,
  onBack,
  onAdd,
  onSave,
}: {
  ctx: FxContext;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onBack: () => void;
  onAdd: () => void;
  onSave: () => void;
}) {
  const trackId = useProjectStore((s) => s.selectedTrackId);
  const setFxBlend = useProjectStore((s) => s.setFxBlend);
  const updateEffectParams = useProjectStore((s) => s.updateEffectParams);
  const toggleEffectBypass = useProjectStore((s) => s.toggleEffectBypass);
  const removeEffect = useProjectStore((s) => s.removeEffect);
  const moveEffect = useProjectStore((s) => s.moveEffect);
  const [info, setInfo] = useState(false);
  // A knob drag fires pointer events faster than the screen (120 Hz on recent
  // iPhones); each store update re-renders and re-syncs the audio graph.
  // Coalesce them: at most one update per animation frame, the latest wins.
  const pendingParams = useRef<{ id: string; params: EffectInstance["params"] } | null>(null);
  const frame = useRef(0);
  const sendParams = useCallback(
    (id: string, params: EffectInstance["params"]) => {
      if (pendingParams.current && pendingParams.current.id !== id) updateEffectParams(ctx.target, pendingParams.current.id, pendingParams.current.params);
      pendingParams.current = { id, params };
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        const p = pendingParams.current;
        pendingParams.current = null;
        if (p) updateEffectParams(ctx.target, p.id, p.params);
      });
    },
    [ctx.target, updateEffectParams]
  );
  useEffect(
    () => () => {
      // flush on unmount so the last knob position is never lost
      if (frame.current) cancelAnimationFrame(frame.current);
      const p = pendingParams.current;
      if (p) updateEffectParams(ctx.target, p.id, p.params);
    },
    [ctx.target, updateEffectParams]
  );
  const strip = useRef<HTMLDivElement>(null);

  const { inserts, target, preset, dirty, isTrack } = ctx;
  const current: EffectInstance | null = inserts.find((e) => e.id === selected) ?? inserts[0] ?? null;
  const index = current ? inserts.indexOf(current) : -1;
  const entry = current && current.type !== "pitchCorrection" ? FX_CATALOG[current.type] : null;
  // only when another effect is selected - not on every knob move (the effect
  // object changes with each param update)
  const currentId = current?.id;
  useEffect(() => {
    if (!currentId) return;
    strip.current?.querySelector(`[data-fx="${currentId}"]`)?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }, [currentId]);
  const name = isTrack ? (preset ? `${preset.name}${dirty ? "*" : ""}` : "Personalizado") : ctx.title;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <KnobDefs />
      <div className="flex h-12 shrink-0 items-center gap-2 px-2">
        <button onClick={onBack} aria-label="Volver" className="flex h-10 w-10 items-center justify-center rounded-full text-bone">
          <BackIcon className="h-5 w-5" />
        </button>
        {isTrack && <CoverArt cover={preset?.cover ?? null} size={26} className={`shrink-0 !rounded-md ${dirty ? "opacity-50" : ""}`} />}
        <span className="flex-1 truncate text-[15px] font-semibold text-bone">{name}</span>
        {isTrack && (dirty || (!preset && inserts.length > 0)) && (
          <button onClick={onSave} className="h-8 rounded-full bg-bone px-4 text-[13px] font-semibold text-ink">
            Guardar
          </button>
        )}
      </div>

      {isTrack && trackId && (
        <div className="shrink-0 px-4">
          <BlendSlider value={ctx.blend} onChange={(v) => setFxBlend(trackId, v)} disabled={inserts.length === 0} />
        </div>
      )}

      {/* tira de efectos */}
      <div className="mt-2 flex shrink-0 items-center gap-2 border-b border-line px-3 pb-3 pt-1">
        <div ref={strip} className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1" style={{ scrollbarWidth: "none" }}>
          {inserts.map((e) => (
            <button
              key={e.id}
              data-fx={e.id}
              onClick={() => onSelect(e.id)}
              aria-label={e.type === "pitchCorrection" ? "Afinación" : FX_CATALOG[e.type].name}
              aria-pressed={current?.id === e.id}
              className={`shrink-0 rounded-[12px] p-[2px] ${current?.id === e.id ? "bg-bone" : "bg-transparent"}`}
            >
              <FxTile type={e.type} size={46} dim={e.bypassed} />
            </button>
          ))}
        </div>
        <button onClick={onAdd} aria-label="Añadir efecto" className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-[12px] bg-surf-2 text-2xl text-bone">
          +
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 pt-3">
        {!current ? (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surf-2 text-lg font-bold italic text-bone">Fx</div>
            <h3 className="mt-4 text-[17px] font-semibold text-bone">Añade tu primer efecto</h3>
            <p className="mt-1 text-[13px] text-bone-2">Ecualizador, compresión, saturación, reverb y más para darle forma a tu voz.</p>
            <button onClick={onAdd} className="mt-5 h-10 rounded-full bg-bone px-6 text-[14px] font-semibold text-ink">
              Explorar efectos
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl" style={{ background: entry?.skin.panel ?? "#18181a", boxShadow: "0 10px 30px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.08)" }}>
            {/* encabezado del plugin: su portada animada, nombre y controles encima */}
            <div className="relative h-[116px] overflow-hidden">
              {current.type !== "pitchCorrection" && (
                <FxArt type={current.type} animated={!current.bypassed} className={`absolute inset-0 h-full w-full transition-[filter,opacity] ${current.bypassed ? "opacity-60 grayscale" : ""}`} />
              )}
              <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,.42) 0%, rgba(0,0,0,0) 34%, rgba(0,0,0,0) 50%, rgba(0,0,0,.62) 100%)" }} />
              <div className="relative flex items-center gap-1.5 px-3 pt-3">
                <Switch on={!current.bypassed} onClick={() => toggleEffectBypass(target, current.id)} color={entry?.skin.accent ?? "#f2ede4"} />
                <HeroButton onClick={() => setInfo((v) => !v)} label="Qué hace" active={info}>
                  <span className="text-[13px] font-bold">i</span>
                </HeroButton>
                <div className="flex-1" />
                <HeroButton onClick={() => moveEffect(target, current.id, -1)} disabled={index <= 0} label="Mover antes">
                  ‹
                </HeroButton>
                <HeroButton onClick={() => moveEffect(target, current.id, 1)} disabled={index >= inserts.length - 1} label="Mover después">
                  ›
                </HeroButton>
                <HeroButton
                  onClick={() => {
                    const next = inserts[index + 1] ?? inserts[index - 1] ?? null;
                    removeEffect(target, current.id);
                    onSelect(next?.id ?? null);
                  }}
                  label="Quitar efecto"
                >
                  <TrashIcon className="h-4 w-4" />
                </HeroButton>
              </div>
              <div className="absolute inset-x-0 bottom-0 px-4 pb-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/75" style={{ textShadow: "0 1px 6px rgba(0,0,0,.6)" }}>
                  {entry?.kind ?? "Efecto"}
                  {current.bypassed && <span className="ml-2 rounded bg-white/20 px-1.5 py-px tracking-[0.12em]">Apagado</span>}
                </div>
                <div className="truncate text-[26px] font-extrabold leading-tight tracking-tight text-white" style={{ textShadow: "0 2px 14px rgba(0,0,0,.55)" }}>
                  {entry?.name ?? "Afinación"}
                </div>
              </div>
            </div>
            <div className="h-px" style={{ background: `linear-gradient(90deg, transparent, ${entry?.skin.accent ?? "#f2ede4"}, transparent)` }} />
            {info && entry && (
              <p className="px-4 pt-3 text-[13px] leading-snug" style={{ color: entry.skin.ink }}>
                {entry.description}
              </p>
            )}
            <div className={`p-3 pt-4 ${current.bypassed ? "opacity-50" : ""}`}>
              <EffectFace effect={current} target={target} onParams={(p) => sendParams(current.id, p)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Switch({ on, onClick, color }: { on: boolean; onClick: () => void; color: string }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      aria-label={on ? "Apagar efecto" : "Encender efecto"}
      className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
      style={{ background: on ? color : "rgba(0,0,0,0.45)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.25)" }}
    >
      <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: on ? 22 : 2 }} />
    </button>
  );
}

function HeroButton({ onClick, label, disabled, active, children }: { onClick: () => void; label: string; disabled?: boolean; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`flex h-8 w-8 items-center justify-center rounded-full text-[17px] leading-none text-white disabled:opacity-30 ${active ? "bg-white/35" : "bg-black/35"}`}
      style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,.18)" }}
    >
      {children}
    </button>
  );
}
