"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useProjectStore, type EffectTarget } from "@/state/projectStore";
import { createEffectInstance, type EffectInstance, type EffectType } from "@/types/effects";
import { serializeChain, type FxChainPreset } from "@/types/fxPresets";
import { FACTORY_FX_PRESETS } from "@/lib/fx/factoryPresets";
import { deleteUserFxPreset, listUserFxPresets, loadFxFavorites, saveFxFavorites, saveUserFxPreset } from "@/lib/storage/fxPresetStore";
import { PresetBrowser } from "./PresetBrowser";
import { ChainEditor } from "./ChainEditor";
import { EffectLibrary } from "./EffectLibrary";
import { PresetDetails } from "./PresetDetails";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * The +Fx panel, on BandLab's structure (videos 2026-10-06):
 *  presets  - grid of chain presets by style, the track's current one with
 *             its Blend, Crear / Guardar  (timeline stays visible above)
 *  chain    - the chain as a strip of effects, the selected one's face
 *  library  - every effect by category, tap to add
 *  details  - name, description and cover when saving
 * Tracks get the whole flow; buses and the master (from the mixer) open
 * straight in the chain editor - presets are a track thing, as in BandLab.
 */

export type FxView = "presets" | "chain" | "library" | "details";

export interface FxContext {
  target: EffectTarget;
  isTrack: boolean;
  title: string;
  inserts: EffectInstance[];
  /** Preset the chain came from (factory or user), if any. */
  preset: FxChainPreset | null;
  /** Unsaved edits on top of the preset, or a hand-built chain. */
  dirty: boolean;
  blend: number;
  allPresets: FxChainPreset[];
  userPresets: FxChainPreset[];
  favorites: string[];
  toggleFavorite: (id: string) => void;
}

export function FxPanel({ onClose }: { onClose: () => void }) {
  const mode = useProjectStore((s) => s.effectsRackMode);
  const trackId = useProjectStore((s) => s.selectedTrackId);
  const busId = useProjectStore((s) => s.selectedBusId);
  const track = useProjectStore((s) => s.project.tracks.find((t) => t.id === s.selectedTrackId) ?? null);
  const bus = useProjectStore((s) => s.project.buses.find((b) => b.id === s.selectedBusId) ?? null);
  const masterInserts = useProjectStore((s) => s.project.masterInserts);
  const applyFxPreset = useProjectStore((s) => s.applyFxPreset);
  const setEffectChain = useProjectStore((s) => s.setEffectChain);
  const markFxSaved = useProjectStore((s) => s.markFxSaved);

  const isTrack = mode === "track";
  const target: EffectTarget | null = mode === "master" ? "master" : mode === "bus" ? busId : trackId;
  const inserts = useMemo(() => (mode === "master" ? masterInserts : mode === "bus" ? (bus?.inserts ?? []) : (track?.inserts ?? [])), [mode, masterInserts, bus, track]);
  const title = mode === "master" ? "Master" : mode === "bus" ? (bus?.name ?? "Bus") : (track?.name ?? "Pista");

  const [view, setView] = useState<FxView>(isTrack ? "presets" : "chain");
  const [selectedFx, setSelectedFx] = useState<string | null>(inserts[0]?.id ?? null);
  const [userPresets, setUserPresets] = useState<FxChainPreset[]>([]);
  const [favorites, setFavorites] = useState<string[]>(() => loadFxFavorites());
  const [pending, setPending] = useState<null | { run: () => void }>(null);
  const [editingPreset, setEditingPreset] = useState<FxChainPreset | null>(null);

  const reloadUser = useCallback(async () => setUserPresets(await listUserFxPresets()), []);
  useEffect(() => {
    let alive = true;
    void listUserFxPresets().then((list) => alive && setUserPresets(list));
    return () => {
      alive = false;
    };
  }, []);

  const allPresets = useMemo(() => [...userPresets, ...FACTORY_FX_PRESETS], [userPresets]);
  const fx = track?.fx;
  const preset = isTrack && fx?.presetId ? (allPresets.find((p) => p.id === fx.presetId) ?? null) : null;
  const dirty = isTrack && inserts.length > 0 && (!fx?.baseline || fx.baseline !== serializeChain(inserts));

  const ctx: FxContext | null = target
    ? {
        target,
        isTrack,
        title,
        inserts,
        preset,
        dirty,
        blend: fx?.blend ?? 1,
        allPresets,
        userPresets,
        favorites,
        toggleFavorite: (id) => {
          const next = favorites.includes(id) ? favorites.filter((x) => x !== id) : [...favorites, id];
          setFavorites(next);
          saveFxFavorites(next);
        },
      }
    : null;

  if (!ctx || !target) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-bone-3">
        Selecciona una pista para ver sus efectos.
      </div>
    );
  }

  /** Runs `action`, but first asks to save when the chain has unsaved edits. */
  function guard(action: () => void) {
    if (dirty) setPending({ run: action });
    else action();
  }

  function addEffect(type: EffectType) {
    const inst = createEffectInstance(type);
    const at = selectedFx ? inserts.findIndex((e) => e.id === selectedFx) : -1;
    const next = at >= 0 ? [...inserts.slice(0, at + 1), inst, ...inserts.slice(at + 1)] : [...inserts, inst];
    setEffectChain(target!, next);
    setSelectedFx(inst.id);
    setView("chain");
  }

  async function savePreset(data: Pick<FxChainPreset, "name" | "description" | "cover">, asNew: boolean) {
    if (!track) return;
    const now = new Date().toISOString();
    const base = !asNew && editingPreset && !editingPreset.factory ? editingPreset : null;
    const saved: FxChainPreset = {
      id: base?.id ?? `user.${crypto.randomUUID()}`,
      name: data.name.trim() || "Mi preajuste",
      description: data.description.slice(0, 50),
      cover: data.cover,
      category: "mios",
      effects: structuredClone(track.inserts),
      blend: track.fx?.blend ?? 1,
      factory: false,
      createdAt: base?.createdAt ?? now,
      updatedAt: now,
    };
    await saveUserFxPreset(saved);
    await reloadUser();
    markFxSaved(track.id, saved);
    setEditingPreset(null);
    setView("presets");
  }

  async function removePreset(p: FxChainPreset) {
    if (p.factory) return;
    await deleteUserFxPreset(p.id);
    await reloadUser();
  }

  async function duplicatePreset(p: FxChainPreset) {
    const now = new Date().toISOString();
    await saveUserFxPreset({ ...structuredClone(p), id: `user.${crypto.randomUUID()}`, name: `${p.name} (copia)`, category: "mios", factory: false, createdAt: now, updatedAt: now });
    await reloadUser();
  }

  const body = (() => {
    switch (view) {
      case "presets":
        return (
          <PresetBrowser
            ctx={ctx}
            onClose={() => guard(onClose)}
            onApply={(p) => guard(() => track && applyFxPreset(track.id, p))}
            onEditChain={() => {
              setSelectedFx(inserts[0]?.id ?? null);
              setView("chain");
            }}
            onCreate={() =>
              guard(() => {
                if (track) applyFxPreset(track.id, null);
                setSelectedFx(null);
                setView("chain");
              })
            }
            onSave={() => {
              setEditingPreset(preset && !preset.factory ? preset : null);
              setView("details");
            }}
            onSaveAs={() => {
              setEditingPreset(null);
              setView("details");
            }}
            onEditDetails={(p) => {
              setEditingPreset(p);
              setView("details");
            }}
            onDelete={(p) => void removePreset(p)}
            onDuplicate={(p) => void duplicatePreset(p)}
          />
        );
      case "chain":
        return (
          <ChainEditor
            ctx={ctx}
            selected={selectedFx}
            onSelect={setSelectedFx}
            onBack={() => (isTrack ? setView("presets") : onClose())}
            onAdd={() => setView("library")}
            onSave={() => {
              setEditingPreset(preset && !preset.factory ? preset : null);
              setView("details");
            }}
          />
        );
      case "library":
        return <EffectLibrary favorites={favorites} onToggleFavorite={ctx.toggleFavorite} onPick={addEffect} onCancel={() => setView("chain")} />;
      case "details":
        return (
          <PresetDetails
            initial={editingPreset ?? (preset && !preset.factory ? preset : null)}
            suggestedName={preset ? `${preset.name}${preset.factory ? " (mío)" : ""}` : `Mi preajuste ${userPresets.length + 1}`}
            suggestedCover={preset?.cover ?? null}
            onCancel={() => setView(isTrack ? "presets" : "chain")}
            onSave={(d) => void savePreset(d, !editingPreset)}
          />
        );
    }
  })();

  // the preset grid sits under the timeline; everything else takes the screen
  const full = view !== "presets";
  return (
    <div className={full ? "absolute inset-0 z-30 flex flex-col bg-ink" : "flex h-[66%] shrink-0 flex-col border-t border-line-2 bg-ink"}>
      {body}
      {pending && (
        <ConfirmDialog
          title="Preajuste no guardado"
          message="¿Quieres guardarlo antes de continuar?"
          actions={[
            {
              label: "Guardar",
              onClick: () => {
                setPending(null);
                setEditingPreset(preset && !preset.factory ? preset : null);
                setView("details");
              },
            },
            {
              label: "Descartar",
              onClick: () => {
                const run = pending.run;
                setPending(null);
                run();
              },
            },
            { label: "Cancelar", onClick: () => setPending(null) },
          ]}
        />
      )}
    </div>
  );
}
