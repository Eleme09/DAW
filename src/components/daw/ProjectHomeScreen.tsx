"use client";

import { useCallback, useEffect, useState } from "react";
import { useProjectStore } from "@/state/projectStore";
import { deleteProject, listProjects } from "@/lib/storage/projectStore";
import { TRACK_COLORS } from "@/types/project";
import { CloseIcon } from "./icons";

interface ProjectEntry {
  id: string;
  name: string;
  updatedAt: string;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "justo ahora";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `hace ${diffD} d`;
  return new Date(iso).toLocaleDateString();
}

/**
 * The project picker - the screen BandLab always shows before its Studio,
 * never skipped. This app used to have no real equivalent: it silently
 * auto-opened whatever project was most recently saved
 * (`recoverLastProject`, now only called from here on "Continuar") and the
 * only way to see a project list was Biblioteca -> Proyectos, a tab nested
 * three taps deep INSIDE an already-open editor - the user's own complaint,
 * verified against the code before building this: "no hay manera de
 * seleccionar proyectos... putamente no la veo." This screen is the gate
 * `DawShell` now renders in front of the editor instead.
 */
export function ProjectHomeScreen() {
  const [entries, setEntries] = useState<ProjectEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const newProject = useProjectStore((s) => s.newProject);
  const openProjectById = useProjectStore((s) => s.openProjectById);

  const refresh = useCallback(() => {
    listProjects()
      .then(setEntries)
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar los proyectos"))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(refresh, [refresh]);

  async function openProject(id: string) {
    setError(null);
    try {
      const ok = await openProjectById(id);
      if (!ok) setError("No se pudo abrir el proyecto");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir el proyecto");
    }
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!window.confirm("¿Eliminar este proyecto? No se puede deshacer.")) return;
    setError(null);
    try {
      await deleteProject(id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el proyecto");
    }
  }

  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-ink text-bone"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="shrink-0 px-4 pb-2 pt-6">
        <h1 className="text-2xl font-bold">Tus proyectos</h1>
        <p className="text-xs text-bone-3">Toca uno para abrirlo, o empieza uno nuevo</p>
      </div>

      <div className="shrink-0 px-4 pb-3">
        <button
          onClick={() => newProject()}
          className="min-h-12 w-full rounded-full bg-bone text-sm font-bold text-ink hover:opacity-90"
        >
          + Nuevo proyecto
        </button>
      </div>

      {error && <p className="shrink-0 px-4 pb-2 text-[11px] text-red-400">{error}</p>}

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loaded && entries.length === 0 && (
          <div className="mt-16 flex flex-col items-center gap-2 text-center">
            <p className="text-sm font-medium text-bone-2">Todavía no hay proyectos</p>
            <p className="max-w-xs text-xs text-bone-3">
              Creá uno con &quot;+ Nuevo proyecto&quot; arriba - ahí vas a poder grabar tu voz sobre un beat que subas.
            </p>
          </div>
        )}
        <div className="space-y-2">
          {entries.map((entry, i) => (
            <button
              key={entry.id}
              onClick={() => openProject(entry.id)}
              className="relative flex w-full items-center gap-3 overflow-hidden rounded-xl bg-surf p-3.5 text-left hover:bg-surf-2"
            >
              <span
                className="absolute inset-y-0 left-0 w-1"
                style={{ background: TRACK_COLORS[i % TRACK_COLORS.length] }}
              />
              <div className="min-w-0 flex-1 pl-1.5">
                <div className="truncate text-sm font-semibold text-bone">{entry.name}</div>
                <div className="text-[11px] text-bone-3">Editado {relativeTime(entry.updatedAt)}</div>
              </div>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => handleDelete(e, entry.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") handleDelete(e as unknown as React.MouseEvent, entry.id);
                }}
                title="Eliminar proyecto"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-bone-3 hover:bg-surf-3 hover:text-red-400"
              >
                <CloseIcon className="h-4 w-4" />
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
