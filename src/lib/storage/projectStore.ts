import type { Project } from "@/types/project";
import { idbDelete, idbGetAll, idbGet, idbPut, STORES } from "./db";

/**
 * Local-first project persistence — IndexedDB (migrated from localStorage,
 * see `migrateLegacyLocalStorage` below; localStorage couldn't hold a
 * growing multi-project catalog safely alongside audio data and has no
 * query support, so listing meant hand-maintaining a separate index).
 * Supabase sync is scaffolded (see lib/supabase/) but not wired up until a
 * project is chosen for it.
 */

interface ProjectIndexEntry {
  id: string;
  name: string;
  updatedAt: string;
}

const LEGACY_INDEX_KEY = "daw:projects";
const LEGACY_MIGRATED_KEY = "daw:migrated:projects";
const legacyProjectKey = (id: string) => `daw:project:${id}`;

let migration: Promise<void> | null = null;

/** One-time move of any pre-IndexedDB projects out of localStorage, so
 * upgrading this app doesn't strand existing users' work. Idempotent and
 * memoized — safe to call from every read/write in this module. */
function migrateLegacyLocalStorage(): Promise<void> {
  if (!migration) {
    migration = (async () => {
      if (typeof window === "undefined") return;
      if (window.localStorage.getItem(LEGACY_MIGRATED_KEY)) return;

      const raw = window.localStorage.getItem(LEGACY_INDEX_KEY);
      if (raw) {
        let entries: ProjectIndexEntry[] = [];
        try {
          entries = JSON.parse(raw) as ProjectIndexEntry[];
        } catch {
          entries = [];
        }
        for (const entry of entries) {
          const projectRaw = window.localStorage.getItem(legacyProjectKey(entry.id));
          if (!projectRaw) continue;
          try {
            const project = JSON.parse(projectRaw) as Project;
            await idbPut(STORES.projects, project);
          } catch {
            // Corrupt legacy entry - skip it rather than fail the whole migration.
          }
          window.localStorage.removeItem(legacyProjectKey(entry.id));
        }
        window.localStorage.removeItem(LEGACY_INDEX_KEY);
      }
      window.localStorage.setItem(LEGACY_MIGRATED_KEY, "1");
    })();
  }
  return migration;
}

export async function saveProject(project: Project): Promise<void> {
  await migrateLegacyLocalStorage();
  await idbPut(STORES.projects, project);
}

export async function loadProject(id: string): Promise<Project | null> {
  await migrateLegacyLocalStorage();
  const project = await idbGet<Project>(STORES.projects, id);
  return project ?? null;
}

export async function listProjects(): Promise<ProjectIndexEntry[]> {
  await migrateLegacyLocalStorage();
  const projects = await idbGetAll<Project>(STORES.projects);
  return projects
    .map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteProject(id: string): Promise<void> {
  await migrateLegacyLocalStorage();
  await idbDelete(STORES.projects, id);
}
