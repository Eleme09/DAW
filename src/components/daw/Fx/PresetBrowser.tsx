"use client";

import { useMemo, useState } from "react";
import { useProjectStore } from "@/state/projectStore";
import { FX_PRESET_CATEGORIES, type FxChainPreset } from "@/types/fxPresets";
import type { FxContext } from "./FxPanel";
import { CoverArt } from "./art";
import { BlendSlider } from "./BlendSlider";
import { CloseIcon, MicIcon } from "../icons";

type Tab = "fav" | "mios" | (typeof FX_PRESET_CATEGORIES)[number]["id"];

const TABS: { id: Tab; label: string }[] = [{ id: "mios", label: "Mis preajustes" }, ...FX_PRESET_CATEGORIES];

/** BandLab's preset sheet: tabs, a 3-column grid of covers, the track's
 * current preset with its Blend, and Crear. */
export function PresetBrowser({
  ctx,
  onClose,
  onApply,
  onEditChain,
  onCreate,
  onSave,
  onSaveAs,
  onEditDetails,
  onDelete,
  onDuplicate,
}: {
  ctx: FxContext;
  onClose: () => void;
  onApply: (p: FxChainPreset | null) => void;
  onEditChain: () => void;
  onCreate: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onEditDetails: (p: FxChainPreset) => void;
  onDelete: (p: FxChainPreset) => void;
  onDuplicate: (p: FxChainPreset) => void;
}) {
  const trackId = useProjectStore((s) => s.selectedTrackId);
  const setFxBlend = useProjectStore((s) => s.setFxBlend);
  const { preset, dirty, inserts } = ctx;
  const [tab, setTab] = useState<Tab>(() => (preset ? (preset.factory ? (preset.category as Tab) : "mios") : ctx.userPresets.length ? "mios" : "voces"));
  const [query, setQuery] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);

  const list = useMemo(() => {
    if (query !== null && query.trim()) {
      const q = query.trim().toLowerCase();
      return ctx.allPresets.filter((p) => `${p.name} ${p.description} ${p.reference ?? ""}`.toLowerCase().includes(q));
    }
    if (tab === "fav") return ctx.allPresets.filter((p) => ctx.favorites.includes(p.id));
    if (tab === "mios") return ctx.userPresets;
    return ctx.allPresets.filter((p) => p.factory && p.category === tab);
  }, [tab, query, ctx.allPresets, ctx.userPresets, ctx.favorites]);

  const custom = inserts.length > 0 && (dirty || !preset);
  const cardName = custom ? (preset ? `${preset.name}*` : "Personalizado") : (preset?.name ?? "Ninguno");
  const cardSub = custom ? "Sin guardar" : preset ? (preset.reference ? `Inspirado en ${preset.reference}` : preset.factory ? preset.description : "Mío") : "Sin efectos";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* encabezado: pista · cerrar */}
      <div className="flex h-11 shrink-0 items-center gap-2 px-3">
        <MicIcon className="h-4 w-4 text-[#b27cff]" />
        <span className="flex-1 truncate text-[13px] font-semibold text-bone">{ctx.title}</span>
        <button onClick={onClose} aria-label="Cerrar efectos" className="flex h-9 w-9 items-center justify-center rounded-full text-bone-2">
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      {/* pestañas o búsqueda */}
      {query === null ? (
        <div className="flex shrink-0 items-center gap-4 overflow-x-auto border-b border-line px-3 text-[13px]" style={{ scrollbarWidth: "none" }}>
          <button onClick={() => setTab("fav")} aria-label="Favoritos" aria-pressed={tab === "fav"} className={`shrink-0 py-2.5 ${tab === "fav" ? "text-bone" : "text-bone-3"}`}>
            {tab === "fav" ? "★" : "☆"}
          </button>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={`shrink-0 border-b-2 py-2.5 font-medium ${tab === t.id ? "border-bone text-bone" : "border-transparent text-bone-3"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-1.5">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar preajustes…"
            className="h-9 flex-1 rounded-full bg-surf-2 px-4 text-sm text-bone outline-none placeholder:text-bone-3"
          />
          <button onClick={() => setQuery(null)} className="px-2 text-[13px] text-bone-2">
            Cancelar
          </button>
        </div>
      )}

      {/* cuadrícula */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-3">
        <div className="grid grid-cols-3 gap-x-3 gap-y-3">
          {tab === "mios" && query === null && (
            <Tile name="Ninguno" selected={inserts.length === 0} onClick={() => onApply(null)} cover={null} />
          )}
          {list.map((p) => (
            <Tile key={p.id} name={p.name} cover={p.cover} selected={preset?.id === p.id && !dirty} star={ctx.favorites.includes(p.id)} onClick={() => onApply(p)} />
          ))}
        </div>
        {list.length === 0 && (
          <p className="mt-6 px-6 text-center text-[13px] text-bone-3">
            {tab === "mios" ? "Arma tu cadena y toca Guardar: aparece aquí." : tab === "fav" ? "Marca con ☆ los preajustes que más uses." : "Nada que coincida."}
          </p>
        )}
      </div>

      {/* preajuste actual + Blend */}
      <div className="mx-3 shrink-0 rounded-2xl bg-surf-2 px-3 pb-2 pt-2.5">
        <div className="flex items-center gap-2.5">
          {preset ? <CoverArt cover={preset.cover} size={40} className={`shrink-0 !rounded-lg ${custom ? "opacity-50" : ""}`} /> : <div className="h-10 w-10 shrink-0 rounded-lg bg-surf-3" />}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold text-bone">{cardName}</div>
            <div className="truncate text-[11px] text-bone-3">{cardSub}</div>
          </div>
          {!custom && preset && (
            <button onClick={() => ctx.toggleFavorite(preset.id)} aria-label="Favorito" className="flex h-9 w-9 items-center justify-center text-lg text-bone-2">
              {ctx.favorites.includes(preset.id) ? "★" : "☆"}
            </button>
          )}
          <button onClick={onEditChain} aria-label="Editar cadena" title="Editar la cadena de efectos" className="flex h-9 w-9 items-center justify-center rounded-full text-bone-2">
            <SlidersIcon />
          </button>
          {custom ? (
            <button onClick={onSave} className="h-8 rounded-full bg-bone px-4 text-[13px] font-semibold text-ink">
              Guardar
            </button>
          ) : (
            preset && (
              <div className="relative">
                <button onClick={() => setMenu((v) => !v)} aria-label="Más opciones" className="flex h-9 w-9 items-center justify-center rounded-full text-bone-2">
                  ⋯
                </button>
                {menu && (
                  <div className="absolute bottom-10 right-0 z-10 w-48 overflow-hidden rounded-2xl bg-[#2a2a2d] py-1 shadow-2xl" onClick={() => setMenu(false)}>
                    <MenuItem onClick={onEditChain}>Editar cadena</MenuItem>
                    <MenuItem onClick={onSaveAs}>Guardar como nuevo</MenuItem>
                    <MenuItem onClick={() => onDuplicate(preset)}>Duplicar</MenuItem>
                    {!preset.factory && <MenuItem onClick={() => onEditDetails(preset)}>Editar detalles</MenuItem>}
                    {!preset.factory && (
                      <MenuItem
                        danger
                        onClick={() => {
                          onDelete(preset);
                        }}
                      >
                        Eliminar
                      </MenuItem>
                    )}
                  </div>
                )}
              </div>
            )
          )}
        </div>
        {trackId && <BlendSlider value={ctx.blend} onChange={(v) => setFxBlend(trackId, v)} disabled={inserts.length === 0} />}
      </div>

      <div className="flex shrink-0 items-center gap-2 px-3 py-2">
        <button onClick={onCreate} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-surf-2 text-[14px] font-medium text-bone">
          <span className="text-lg leading-none">+</span> Crear
        </button>
        <button onClick={() => setQuery((q) => (q === null ? "" : null))} aria-label="Buscar preajustes" className="flex h-10 w-10 items-center justify-center rounded-full bg-surf-2 text-bone">
          <SearchIcon />
        </button>
      </div>
    </div>
  );
}

function Tile({ name, cover, selected, star, onClick }: { name: string; cover: FxChainPreset["cover"] | null; selected: boolean; star?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex min-w-0 flex-col items-center gap-1.5 text-left" aria-pressed={selected}>
      <div className={`relative aspect-square w-full rounded-xl ${selected ? "ring-2 ring-bone ring-offset-2 ring-offset-ink" : ""}`}>
        <CoverArt cover={cover} className="h-full w-full" />
        {star && <span className="absolute left-1.5 top-1 text-xs text-bone drop-shadow">★</span>}
      </div>
      <span className={`line-clamp-1 w-full text-center text-[11px] ${selected ? "font-semibold text-bone" : "text-bone-2"}`}>{name}</span>
    </button>
  );
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`block w-full px-4 py-2.5 text-left text-[14px] ${danger ? "text-[#ff6b6b]" : "text-bone"}`}>
      {children}
    </button>
  );
}

export function SlidersIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </svg>
  );
}
