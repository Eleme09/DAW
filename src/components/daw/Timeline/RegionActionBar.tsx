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
  ChevronRightIcon,
  ShiftIcon,
  GainIcon,
  NormalizeIcon,
  TransposeIcon,
  StretchIcon,
  FadeIcon,
  DenoiseIcon,
  ReverseIcon,
} from "../icons";

interface RegionActionBarProps {
  /** Top of the selected region's row, in px from the top of the timeline viewport. */
  rowTop: number;
  rowHeight: number;
  minTop: number;
}

/**
 * BandLab's Region Action Menu (user's screen recordings): a dark floating
 * pill over the track above the tapped region -
 *   Eliminar · Copiar · Dividir · Loop · Armonizar · ⋯
 * ⋯ turns into ^ and drops the full menu: Cambio, Ganancia, Normalizar,
 * Transponer, Expansión de tiempo, Fade | Eliminación de ruido, Revertir.
 * Valued actions open the bottom slider panel (ClipEditPanel); one-shot
 * ones run immediately and show "Éxito". With nothing selected but a copied
 * region in the clipboard, a single "Pegar" pill shows instead.
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

  const top = rowTop - 52 >= minTop ? rowTop - 52 : rowTop + rowHeight + 6;

  if (clipEditMode) return null;

  if (!selectedClip || !clip) {
    if (!clipboard || !selectedTrackId) return null;
    return (
      <div data-keep-region="" className="pointer-events-none absolute right-2 z-40" style={{ top: Math.max(minTop, rowTop - 52) }}>
        <button
          onClick={() => {
            useProjectStore.getState().pasteClip();
            useProjectStore.getState().showToast("Pegado");
          }}
          className="pointer-events-auto flex h-11 items-center rounded-full bg-surf-2 px-5 text-sm font-semibold text-bone shadow-lg"
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
      store().showToast("Éxito");
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

  const iconBtn = "flex h-11 w-11 items-center justify-center rounded-full text-bone disabled:opacity-30";

  const menu: { label: string; Icon: typeof ShiftIcon; action: () => void; sub?: boolean; divider?: boolean }[] = [
    { label: "Cambio", Icon: ShiftIcon, sub: true, action: () => openMode("shift") },
    { label: "Ganancia", Icon: GainIcon, sub: true, action: () => openMode("gain") },
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
    { label: "Transponer", Icon: TransposeIcon, sub: true, action: () => openMode("transpose") },
    { label: "Expansión de tiempo", Icon: StretchIcon, sub: true, action: () => openMode("stretch") },
    { label: "Fade", Icon: FadeIcon, sub: true, action: () => openMode("fade") },
    { label: "Eliminación de ruido", Icon: DenoiseIcon, divider: true, action: () => void runRender(denoiseClip) },
    { label: "Revertir", Icon: ReverseIcon, action: () => void runRender(reverseClip) },
  ];

  return (
    <div data-keep-region="" className="absolute right-2 z-40 flex flex-col items-end gap-1.5" style={{ top }}>
      <div className="flex items-center gap-1.5">
        <div className="flex h-12 items-center rounded-full bg-[#1c1c1e] px-1 shadow-lg">
          <button
            onClick={() => {
              store().removeClip(clip.trackId, clip.id);
              store().selectClip(null);
            }}
            disabled={busy}
            aria-label="Eliminar región"
            title="Eliminar"
            className={iconBtn}
          >
            <TrashIcon className="h-5 w-5" />
          </button>
          <button
            onClick={() => {
              store().copyClip(clip.trackId, clip.id);
              store().showToast("Copiado — toca una pista y Pegar");
            }}
            disabled={busy}
            aria-label="Copiar región"
            title="Copiar"
            className={iconBtn}
          >
            <CopyIcon className="h-5 w-5" />
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
            className={iconBtn}
          >
            <SliceIcon className="h-5 w-5" />
          </button>
          <button onClick={() => openMode("loop")} disabled={busy} aria-label="Loop" title="Loop" className={iconBtn}>
            <LoopIcon className="h-5 w-5" />
          </button>
          <button onClick={() => openMode("harmonize")} disabled={busy} aria-label="Armonizar" title="Armonizar" className={iconBtn}>
            <HarmonizeIcon className="h-5 w-5" />
          </button>
        </div>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          disabled={busy}
          aria-label={menuOpen ? "Cerrar menú" : "Más acciones"}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1c1c1e] text-bone shadow-lg disabled:opacity-30"
        >
          {menuOpen ? <ChevronUpIcon className="h-5 w-5" /> : <MoreIcon className="h-5 w-5" />}
        </button>
      </div>

      {menuOpen && (
        <div className="w-60 overflow-hidden rounded-2xl bg-[#1c1c1e] py-1 shadow-2xl">
          {menu.map(({ label, Icon, action, sub, divider }) => (
            <button
              key={label}
              onClick={action}
              className={`flex h-11 w-full items-center gap-3 px-4 text-left text-sm text-bone hover:bg-white/5 ${divider ? "mt-1 border-t border-white/10" : ""}`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="flex-1">{label}</span>
              {sub && <ChevronRightIcon className="h-4 w-4 text-bone-3" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
