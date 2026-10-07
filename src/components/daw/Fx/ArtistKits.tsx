"use client";

import { useState } from "react";
import { useProjectStore } from "@/state/projectStore";
import {
  ARTIST_KITS,
  ROLE_LABEL,
  type ArtistKit,
  type KitLayer,
} from "@/lib/fx/artistKits";
import { AUTOPITCH_RECIPE_BY_ID } from "@/types/autoPitch";
import type { FxChainPreset } from "@/types/fxPresets";
import { CoverArt } from "./art";
import { NucleoGlyph } from "../AutoPitch/NucleoGlyph";

/**
 * "Por artista" in the preset sheet: what is documented about how each
 * artist's vocals are made (marked documented vs our reading, with sources)
 * and the tracks to record them that way - the lead chain + Núcleo on the
 * current track, and a track per double / ad-lib layer with its own chain,
 * Núcleo, pan and level.
 */
export function ArtistKits({
  presets,
  onApplyLead,
}: {
  presets: FxChainPreset[];
  onApplyLead: (p: FxChainPreset) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const byId = (id: string) => presets.find((p) => p.id === id);
  const kit = ARTIST_KITS.find((k) => k.id === openId);

  if (!kit) {
    return (
      <div className="space-y-2">
        <p className="px-1 pb-1 text-[12px] leading-snug text-bone-3">
          Cómo se graban y procesan sus voces, según lo que está documentado, y
          las pistas listas para grabarlas así.
        </p>
        {ARTIST_KITS.map((k) => {
          const lead = byId(k.layers[0].presetId);
          return (
            <button
              key={k.id}
              onClick={() => setOpenId(k.id)}
              className="flex w-full items-center gap-3 rounded-2xl bg-surf-2 p-2.5 text-left"
            >
              {lead ? (
                <CoverArt
                  cover={lead.cover}
                  size={52}
                  className="shrink-0 !rounded-xl"
                />
              ) : (
                <div className="h-[52px] w-[52px] shrink-0 rounded-xl bg-surf-3" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-bone">
                  {k.artist}
                </span>
                <span className="block truncate text-[12px] text-bone-3">
                  {k.tagline}
                </span>
                <span className="mt-0.5 block text-[11px] text-bone-2">
                  {k.layers.length} pistas ·{" "}
                  {k.facts.filter((f) => f.sure).length} datos documentados
                </span>
              </span>
              <span className="pr-1 text-bone-3">›</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <KitView
      kit={kit}
      byId={byId}
      onBack={() => setOpenId(null)}
      onApplyLead={onApplyLead}
    />
  );
}

function KitView({
  kit,
  byId,
  onBack,
  onApplyLead,
}: {
  kit: ArtistKit;
  byId: (id: string) => FxChainPreset | undefined;
  onBack: () => void;
  onApplyLead: (p: FxChainPreset) => void;
}) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const lead = kit.layers[0];
  const leadPreset = byId(lead.presetId);

  function applyLead(): boolean {
    const s = useProjectStore.getState();
    const trackId = s.selectedTrackId;
    if (!leadPreset || !trackId) return false;
    onApplyLead(leadPreset);
    s.setAutoPitch(trackId, {
      enabled: true,
      presetId: lead.nucleo,
      level: lead.nucleoLevel,
    });
    return true;
  }

  function createLayer(layer: KitLayer): boolean {
    const preset = byId(layer.presetId);
    if (!preset) return false;
    const s = useProjectStore.getState();
    const t = s.addTrack(layer.name);
    s.applyFxPreset(t.id, preset);
    s.setAutoPitch(t.id, {
      enabled: true,
      presetId: layer.nucleo,
      level: layer.nucleoLevel,
    });
    s.updateTrack(t.id, { pan: layer.pan, volumeDb: layer.volumeDb });
    return true;
  }

  function act(layer: KitLayer) {
    const ok = layer.role === "lead" ? applyLead() : createLayer(layer);
    if (!ok) return;
    setDone((d) => new Set(d).add(layer.name));
    useProjectStore
      .getState()
      .showToast(
        layer.role === "lead"
          ? `${kit.artist}: cadena y Núcleo en esta pista`
          : `Pista «${layer.name}» lista: grábala con el micrófono`,
      );
  }

  function buildAll() {
    const s = useProjectStore.getState();
    const leadTrack = s.selectedTrackId;
    if (leadTrack) applyLead();
    for (const layer of kit.layers.slice(leadTrack ? 1 : 0)) createLayer(layer);
    if (leadTrack) useProjectStore.getState().selectTrack(leadTrack);
    setDone(new Set(kit.layers.map((l) => l.name)));
    s.showToast(`Sesión ${kit.artist}: ${kit.layers.length} pistas listas`);
  }

  return (
    <div className="pb-2">
      <button
        onClick={onBack}
        className="mb-2 flex items-center gap-1 text-[13px] text-bone-2"
      >
        ‹ Artistas
      </button>
      <div className="flex items-center gap-3">
        {leadPreset && (
          <CoverArt
            cover={leadPreset.cover}
            size={60}
            className="shrink-0 !rounded-2xl"
          />
        )}
        <div className="min-w-0">
          <div className="text-[20px] font-extrabold leading-tight text-bone">
            {kit.artist}
          </div>
          <div className="text-[12.5px] text-bone-3">{kit.tagline}</div>
        </div>
      </div>

      <h3 className="mt-4 text-[13px] font-bold uppercase tracking-wider text-bone-2">
        Lo que se sabe
      </h3>
      <ul className="mt-1.5 space-y-1.5">
        {kit.facts.map((f, i) => (
          <li
            key={i}
            className="flex gap-2 text-[12.5px] leading-snug text-bone-2"
          >
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${f.sure ? "bg-[#3ee8c4]/20 text-[#3ee8c4]" : "bg-[#f2b84b]/20 text-[#f2b84b]"}`}
              title={
                f.sure
                  ? "Documentado (el artista o su ingeniero)"
                  : "Guías de mezcla o lectura nuestra"
              }
            >
              {f.sure ? "✓" : "~"}
            </span>
            <span>{f.text}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11px] text-bone-3">
        ✓ dicho por el artista o su ingeniero · ~ guías de mezcla o lectura
        nuestra
      </p>

      <h3 className="mt-4 text-[13px] font-bold uppercase tracking-wider text-bone-2">
        Cómo grabarlo
      </h3>
      <div className="mt-1.5 space-y-2">
        {kit.layers.map((layer) => {
          const preset = byId(layer.presetId);
          const nucleo = AUTOPITCH_RECIPE_BY_ID[layer.nucleo];
          const isDone = done.has(layer.name);
          return (
            <div key={layer.name} className="rounded-2xl bg-surf-2 p-2.5">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10.5px] font-semibold text-bone-2">
                  {ROLE_LABEL[layer.role]}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-bone">
                  {layer.name}
                </span>
                <button
                  onClick={() => act(layer)}
                  className={`h-8 shrink-0 rounded-full px-3 text-[12px] font-semibold ${isDone ? "bg-white/10 text-bone-2" : "bg-bone text-ink"}`}
                >
                  {isDone
                    ? "Listo ✓"
                    : layer.role === "lead"
                      ? "Usar en esta pista"
                      : "Crear pista"}
                </button>
              </div>
              <p className="mt-1 text-[12px] leading-snug text-bone-3">
                {layer.how}
              </p>
              <div className="mt-1.5 flex items-center gap-2 text-[11px] text-bone-2">
                <span className="truncate">
                  {preset?.name ?? layer.presetId}
                </span>
                <span className="text-bone-3">·</span>
                <NucleoGlyph
                  presetId={layer.nucleo}
                  className="h-4 w-4 shrink-0"
                />
                <span className="truncate">
                  {nucleo.label} {Math.round(layer.nucleoLevel * 100)} %
                </span>
                {layer.role !== "lead" && (
                  <span className="ml-auto shrink-0 tabular-nums text-bone-3">
                    {layer.pan === 0
                      ? "centro"
                      : `${Math.round(Math.abs(layer.pan) * 100)} % ${layer.pan < 0 ? "izq." : "der."}`}{" "}
                    · {layer.volumeDb} dB
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <button
        onClick={buildAll}
        className="mt-3 h-11 w-full rounded-full bg-bone text-[14px] font-semibold text-ink"
      >
        Armar la sesión completa
      </button>
      <p className="mt-1.5 text-center text-[11px] text-bone-3">
        La voz principal va en la pista elegida; el resto, en pistas nuevas.
        Deshacer lo revierte paso a paso.
      </p>

      <h3 className="mt-4 text-[13px] font-bold uppercase tracking-wider text-bone-2">
        Fuentes
      </h3>
      <ul className="mt-1 space-y-1">
        {kit.sources.map((s) => (
          <li key={s.url}>
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="text-[12px] text-[#7fb6ff] underline-offset-2 hover:underline"
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
