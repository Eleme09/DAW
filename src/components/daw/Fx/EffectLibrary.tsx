"use client";

import { useMemo, useState } from "react";
import { FX_CATALOG, FX_LIBRARY_CATEGORIES, OFFERED_EFFECTS, RECOMMENDED_EFFECTS, type OfferedEffectType } from "@/lib/fx/catalog";
import type { EffectType } from "@/types/effects";
import { FxTile } from "./art";
import { SearchIcon } from "./PresetBrowser";

type Cat = (typeof FX_LIBRARY_CATEGORIES)[number]["id"];

/** BandLab's "Efectos" list: category chips, one row per effect with its
 * faceplate, kind, name and what it is for. Tap to add. */
export function EffectLibrary({
  favorites,
  onToggleFavorite,
  onPick,
  onCancel,
}: {
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  onPick: (type: EffectType) => void;
  onCancel: () => void;
}) {
  const [cat, setCat] = useState<Cat>("recomendados");
  const [query, setQuery] = useState<string | null>(null);
  const favKey = (t: string) => `fx:${t}`;

  const list: OfferedEffectType[] = useMemo(() => {
    if (query?.trim()) {
      const q = query.trim().toLowerCase();
      return OFFERED_EFFECTS.filter((t) => {
        const e = FX_CATALOG[t];
        return `${e.name} ${e.kind} ${e.description}`.toLowerCase().includes(q);
      });
    }
    if (cat === "recomendados") return RECOMMENDED_EFFECTS;
    if (cat === "favoritos") return OFFERED_EFFECTS.filter((t) => favorites.includes(favKey(t)));
    return OFFERED_EFFECTS.filter((t) => FX_CATALOG[t].category === cat);
  }, [cat, query, favorites]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center px-3">
        <button onClick={onCancel} className="w-20 text-left text-[14px] text-bone-2">
          Cancelar
        </button>
        <span className="flex-1 text-center text-[16px] font-semibold text-bone">Efectos</span>
        <div className="flex w-20 justify-end">
          <button onClick={() => setQuery((q) => (q === null ? "" : null))} aria-label="Buscar efectos" className="flex h-9 w-9 items-center justify-center text-bone">
            <SearchIcon />
          </button>
        </div>
      </div>

      {query !== null ? (
        <div className="shrink-0 px-3 pb-2">
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar: reverb, eses, brillo…" className="h-10 w-full rounded-full bg-surf-2 px-4 text-sm text-bone outline-none placeholder:text-bone-3" />
        </div>
      ) : (
        <div className="flex shrink-0 gap-2 overflow-x-auto px-3 pb-3" style={{ scrollbarWidth: "none" }}>
          {FX_LIBRARY_CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              aria-pressed={cat === c.id}
              className={`h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium ${cat === c.id ? "bg-bone text-ink" : "bg-surf-2 text-bone-2"}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-6">
        {cat === "favoritos" && list.length === 0 && query === null && <p className="mt-8 text-center text-[13px] text-bone-3">Marca con ☆ los efectos que más uses.</p>}
        {list.map((t) => {
          const e = FX_CATALOG[t];
          const fav = favorites.includes(favKey(t));
          return (
            <div key={t} className="flex items-center gap-3 rounded-2xl bg-surf-2 p-3">
              <button onClick={() => onPick(t)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <FxTile type={t} size={52} />
                <div className="min-w-0 flex-1">
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-bone-2">{e.kind}</span>
                  <div className="mt-0.5 truncate text-[15px] font-semibold text-bone">{e.name}</div>
                  <div className="line-clamp-2 text-[12px] leading-snug text-bone-3">{e.description}</div>
                </div>
              </button>
              <button onClick={() => onToggleFavorite(favKey(t))} aria-label={fav ? "Quitar de favoritos" : "Agregar a favoritos"} className="flex h-9 w-9 shrink-0 items-center justify-center text-lg text-bone-2">
                {fav ? "★" : "☆"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
