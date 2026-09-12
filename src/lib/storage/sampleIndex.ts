import type { SampleAsset } from "@/types/project";
import { idbDelete, idbGetAll, idbPut, STORES } from "./db";

/** Lightweight metadata index for imported samples, mirrors sampleStore.ts blobs. */

const LEGACY_KEY = "daw:samples";
const LEGACY_MIGRATED_KEY = "daw:migrated:samples";

let migration: Promise<void> | null = null;

/** One-time move of any pre-IndexedDB sample metadata out of localStorage.
 * Idempotent and memoized — safe to call from every read/write here. */
function migrateLegacyLocalStorage(): Promise<void> {
  if (!migration) {
    migration = (async () => {
      if (typeof window === "undefined") return;
      if (window.localStorage.getItem(LEGACY_MIGRATED_KEY)) return;

      const raw = window.localStorage.getItem(LEGACY_KEY);
      if (raw) {
        try {
          const assets = JSON.parse(raw) as SampleAsset[];
          for (const asset of assets) {
            await idbPut(STORES.sampleAssets, asset);
          }
        } catch {
          // Corrupt legacy index - nothing to recover.
        }
        window.localStorage.removeItem(LEGACY_KEY);
      }
      window.localStorage.setItem(LEGACY_MIGRATED_KEY, "1");
    })();
  }
  return migration;
}

export async function listSampleAssets(): Promise<SampleAsset[]> {
  await migrateLegacyLocalStorage();
  const assets = await idbGetAll<SampleAsset>(STORES.sampleAssets);
  return assets.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addSampleAsset(asset: SampleAsset): Promise<void> {
  await migrateLegacyLocalStorage();
  await idbPut(STORES.sampleAssets, asset);
}

export async function removeSampleAsset(id: string): Promise<void> {
  await migrateLegacyLocalStorage();
  await idbDelete(STORES.sampleAssets, id);
}
