import type { FxChainPreset } from "@/types/fxPresets";
import { STORES, idbDelete, idbGetAll, idbPut } from "./db";

/** The user's own Fx chain presets ("Mis preajustes"), newest first. */
export async function listUserFxPresets(): Promise<FxChainPreset[]> {
  try {
    const all = await idbGetAll<FxChainPreset>(STORES.fxPresets);
    return all.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  } catch {
    return [];
  }
}

export async function saveUserFxPreset(preset: FxChainPreset): Promise<void> {
  await idbPut(STORES.fxPresets, preset);
}

export async function deleteUserFxPreset(id: string): Promise<void> {
  await idbDelete(STORES.fxPresets, id);
}

const FAVORITES_KEY = "daw.fx.favorites.v1";

/** Starred presets and effects (ids / effect types), per device. */
export function loadFxFavorites(): string[] {
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveFxFavorites(ids: string[]): void {
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch {
    // private mode / storage full: favourites just don't persist
  }
}
