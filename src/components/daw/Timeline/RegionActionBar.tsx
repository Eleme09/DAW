"use client";

import { useState } from "react";
import { useProjectStore, type ClipEditMode } from "@/state/projectStore";
import { denoiseClip, normalizeGainDb, reverseClip } from "@/lib/audio/clipProcessing";
import type { AudioClip } from "@/types/project";
import {
  TrashIcon,
  CopyIcon,
  SliceIcon,
  LoopIcon,
  HarmonizeIcon,
  MoreIcon,
  ChevronUpIcon,
  ShiftIcon,
  GainIcon,
  NormalizeIcon,
  TransposeIcon,
  StretchIcon,
  FadeIcon,
  DenoiseIcon,
  ReverseIcon,
} from "../icons";

/** Height of the tool bar. */
const BAR_H = 56;

interface RegionActionBarProps {
  /** Top of the selected region's row, in px from the top of the timeline viewport. */
  rowTop: number;
  rowHeight: number;
  minTop: number;
}

/**
 * Tools for the tapped region, floating over the track above it: one bar
 * with an icon and its name under it (readable on a phone, no guessing) -
 *   Borrar · Copiar · Dividir · Loop · Armonizar · Más
 * "Más" opens a grid of the rest: Desplazar, Ganancia, Normalizar,
 * Transponer, Estirar, Fades, Quitar ruido, Al revés. Valued actions open
 * the bottom slider panel (ClipEditPanel); one-shot ones run immediately
 * and say "Listo". With nothing selected but a copied region in the
 * clipboard, a single "Pegar" button shows instead.
 */
export function RegionActionBar({ rowTop, rowHeight, minTop }: RegionActionBarProps) {
  const selectedClip = useProjectStore((s) => s.selectedClip);
  const clip = useProjectStore((s) =>
    s.selectedClip
      ? s.project.tracks.find((t) => t.id === s.selectedClip!.trackId)?.clips.find((c) => c.id === s.selectedClip!.clipId) ?? null
      : null
  );
  const clipEditMode = useProjectStore((s) => s.clipEditMode);
  const clipboard = useProjectStore((s) => s.clipboard);
  const selectedTrackId = useProjectStore((s) => s.selectedTrackId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const top = rowTop - BAR_H - 4 >= minTop ? rowTop - BAR_H - 4 : rowTop + rowHeight + 6;

  if (clipEditMode) return null;

  if (!selectedClip || !clip) {
    if (!clipboard || !selectedTrackId) return null;
    return (
      <div data-keep-region="" className="pointer-events-none absolute right-2 z-40" style={{ top: Math.max(minTop, rowTop - 48) }}>
        <button
          onClick={() => {
            useProjectStore.getState().pasteClip();
            useProjectStore.getState().showToast("Pegado");
          }}
          className="pointer-events-auto flex h-11 items-center rounded-2xl border border-white/10 bg-[#141518] px-5 text-sm font-semibold text-bone shadow-lg"
        >
          Pegar
        </button>
      </div>
    );
  }

  const store = () => useProjectStore.getState();

  async function runRender(work: (c: AudioClip) => Promise<Partial<AudioClip>>) {
    if (!clip || busy) return;
    setMenuOpen(false);
    setBusy(true);
    store().showToast("Procesando…");
    try {
      const patch = await work(clip);
      store().updateClip(clip.trackId, clip.id, patch);
      store().showToast("Listo");
    } catch (err) {
      store().showToast(err instanceof Error ? err.message : "No se pudo procesar");
    } finally {
      setBusy(false);
    }
  }

  function openMode(mode: ClipEditMode) {
    setMenuOpen(false);
    store().setClipEditMode(mode);
  }

  const tool = "flex h-full w-[50px] flex-col items-center justify-center gap-0.5 rounded-xl text-bone active:bg-white/10 disabled:opacity-30";
  const toolLabel = "text-[9.5px] font-medium leading-none text-bone-2";

  const menu: { label: string; Icon: typeof ShiftIcon; action: () => void }[] = [
    { label: "Desplazar", Icon: ShiftIcon, action: () => openMode("shift") },
    { label: "Ganancia", Icon: GainIcon, action: () => openMode("gain") },
    {
      label: "Normalizar",
      Icon: NormalizeIcon,
      action: () =>
        void runRender(async (c) => {
          const gainDb = await normalizeGainDb(c);
          if (gainDb === null) throw new Error("La región está en silencio");
          return { gainDb };
        }),
    },
    { label: "Transponer", Icon: TransposeIcon, action: () => openMode("transpose") },
    { label: "Estirar", Icon: StretchIcon, action: () => openMode("stretch") },
    { label: "Fades", Icon: FadeIcon, action: () => openMode("fade") },
    { label: "Quitar ruido", Icon: DenoiseIcon, action: () => void runRender(denoiseClip) },
    { label: "Al revés", Icon: ReverseIcon, action: () => void runRender(reverseClip) },
  ];

  return (
    <div data-keep-region="" className="absolute right-2 z-40 flex flex-col items-end gap-1.5" style={{ top }}>
      <div
        className="flex items-center gap-0.5 rounded-2xl border border-white/10 bg-[#141518]/95 p-1 shadow-[0_10px_30px_rgba(0,0,0,.55)] backdrop-blur"
        style={{ height: BAR_H }}
      >
        <button
          onClick={() => {
            store().removeClip(clip.trackId, clip.id);
            store().selectClip(null);
          }}
          disabled={busy}
          aria-label="Eliminar región"
          title="Borrar"
          className={tool}
        >
          <TrashIcon className="h-5 w-5" />
          <span className={toolLabel}>Borrar</span>
        </button>
        <button
          onClick={() => {
            store().copyClip(clip.trackId, clip.id);
            store().showToast("Copiado — toca una pista y Pegar");
          }}
          disabled={busy}
          aria-label="Copiar región"
          title="Copiar"
          className={tool}
        >
          <CopyIcon className="h-5 w-5" />
          <span className={toolLabel}>Copiar</span>
        </button>
        <button
          onClick={() => {
            const { currentTime } = store();
            if (clip.loopLengthSec) return store().showToast("Quita el loop para dividir");
            if (currentTime <= clip.startTime || currentTime >= clip.startTime + clip.duration)
              return store().showToast("Pon la línea de reproducción sobre la región");
            store().splitClipAtPlayhead();
            store().selectClip(null);
          }}
          disabled={busy}
          aria-label="Dividir en la línea de reproducción"
          title="Dividir"
          className={tool}
        >
          <SliceIcon className="h-5 w-5" />
          <span className={toolLabel}>Dividir</span>
        </button>
        <button onClick={() => openMode("loop")} disabled={busy} aria-label="Loop" title="Loop" className={tool}>
          <LoopIcon className="h-5 w-5" />
          <span className={toolLabel}>Loop</span>
        </button>
        <button onClick={() => openMode("harmonize")} disabled={busy} aria-label="Armonizar" title="Armonizar" className={tool}>
          <HarmonizeIcon className="h-5 w-5" />
          <span className={toolLabel}>Armonizar</span>
        </button>
        <span className="mx-0.5 h-8 w-px bg-white/10" />
        <button
          onClick={() => setMenuOpen((o) => !o)}
          disabled={busy}
          aria-label={menuOpen ? "Cerrar menú" : "Más acciones"}
          aria-expanded={menuOpen}
          className={`${tool} ${menuOpen ? "bg-white/10" : ""}`}
        >
          {menuOpen ? <ChevronUpIcon className="h-5 w-5" /> : <MoreIcon className="h-5 w-5" />}
          <span className={toolLabel}>{menuOpen ? "Menos" : "Más"}</span>
        </button>
      </div>

      {menuOpen && (
        <div className="grid w-[320px] grid-cols-4 gap-1 rounded-2xl border border-white/10 bg-[#141518]/95 p-1.5 shadow-[0_14px_36px_rgba(0,0,0,.6)] backdrop-blur">
          {menu.map(({ label, Icon, action }) => (
            <button
              key={label}
              onClick={action}
              className="flex h-[62px] flex-col items-center justify-center gap-1.5 rounded-xl bg-white/[0.04] px-1 text-center text-bone active:bg-white/10"
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="text-[10.5px] font-medium leading-tight text-bone-2">{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
