import type { Project, SampleAsset, SampleOrigin } from "@/types/project";
import { idbGetAll, STORES } from "./db";
import { deleteSample } from "./sampleStore";
import { removeSampleAsset } from "./sampleIndex";

/** Names of the saved projects whose clips use `sampleId` (the open one
 * included, from `current` since its last save may be a moment old). */
export async function projectsUsingSample(sampleId: string, current?: Project): Promise<string[]> {
  const saved = await idbGetAll<Project>(STORES.projects);
  const byId = new Map(saved.map((p) => [p.id, p]));
  if (current) byId.set(current.id, current);
  const names: string[] = [];
  for (const p of byId.values()) {
    if (p.tracks.some((t) => t.clips.some((c) => c.sampleId === sampleId))) names.push(p.name);
  }
  return names;
}

/** Removes the audio and its entry for good. */
export async function deleteSampleForever(sampleId: string): Promise<void> {
  await deleteSample(sampleId);
  await removeSampleAsset(sampleId);
}

/** Origin of an entry saved before `origin` existed, from its name. */
export function sampleOrigin(asset: SampleAsset): SampleOrigin {
  if (asset.origin) return asset.origin;
  if (/\.(mp4|mov|m4v|webm)$/i.test(asset.name)) return "video";
  if (/ take( |$)/i.test(asset.name)) return "recording";
  if (/\.(wav|mp3|m4a|aac|ogg|flac|aif|aiff)$/i.test(asset.name)) return "import";
  return "processed";
}
