import type { Project } from "@/types/project";

/**
 * Local-first project persistence (localStorage). This is intentionally the
 * only persistence path in Phase 1 — Supabase sync is scaffolded
 * (see lib/supabase/) but not wired up until a project is chosen for it.
 */

const INDEX_KEY = "daw:projects";
const projectKey = (id: string) => `daw:project:${id}`;

interface ProjectIndexEntry {
  id: string;
  name: string;
  updatedAt: string;
}

function readIndex(): ProjectIndexEntry[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(INDEX_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ProjectIndexEntry[];
  } catch {
    return [];
  }
}

function writeIndex(entries: ProjectIndexEntry[]): void {
  window.localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
}

export function saveProject(project: Project): void {
  window.localStorage.setItem(projectKey(project.id), JSON.stringify(project));
  const index = readIndex().filter((e) => e.id !== project.id);
  index.unshift({ id: project.id, name: project.name, updatedAt: project.updatedAt });
  writeIndex(index);
}

export function loadProject(id: string): Project | null {
  const raw = window.localStorage.getItem(projectKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Project;
  } catch {
    return null;
  }
}

export function listProjects(): ProjectIndexEntry[] {
  return readIndex();
}

export function deleteProject(id: string): void {
  window.localStorage.removeItem(projectKey(id));
  writeIndex(readIndex().filter((e) => e.id !== id));
}
