/**
 * IndexedDB-backed store for raw audio bytes (imported/recorded samples).
 * Kept separate from project state because audio blobs are large and don't
 * belong in a JSON document either — see ARCHITECTURE.md.
 */
import { idbDelete, idbGet, idbGetAll, idbPut, STORES } from "./db";

interface StoredSample {
  id: string;
  name: string;
  blob: Blob;
  createdAt: string;
}

export async function putSample(id: string, name: string, blob: Blob): Promise<void> {
  await idbPut(STORES.samples, { id, name, blob, createdAt: new Date().toISOString() } satisfies StoredSample);
}

export async function getSample(id: string): Promise<StoredSample | undefined> {
  return idbGet<StoredSample>(STORES.samples, id);
}

export async function listSamples(): Promise<StoredSample[]> {
  return idbGetAll<StoredSample>(STORES.samples);
}

export async function deleteSample(id: string): Promise<void> {
  await idbDelete(STORES.samples, id);
}
