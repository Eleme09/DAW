import type { SampleAsset } from "@/types/project";

/** Lightweight metadata index for imported samples, mirrors sampleStore.ts blobs. */
const KEY = "daw:samples";

export function listSampleAssets(): SampleAsset[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SampleAsset[];
  } catch {
    return [];
  }
}

export function addSampleAsset(asset: SampleAsset): void {
  const list = listSampleAssets().filter((s) => s.id !== asset.id);
  list.unshift(asset);
  window.localStorage.setItem(KEY, JSON.stringify(list));
}

export function removeSampleAsset(id: string): void {
  const list = listSampleAssets().filter((s) => s.id !== id);
  window.localStorage.setItem(KEY, JSON.stringify(list));
}
