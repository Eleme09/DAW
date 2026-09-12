import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { getSample } from "@/lib/storage/sampleStore";
import type { Project } from "@/types/project";

/**
 * Ensures a sample's AudioBuffer is decoded and cached in the engine.
 * The engine's buffer cache is in-memory only, so this re-hydrates it from
 * IndexedDB after a page reload or when a sample hasn't been touched yet.
 */
export async function ensureSampleLoaded(sampleId: string): Promise<AudioBuffer | null> {
  const engine = getAudioEngine();
  const cached = engine.getBuffer(sampleId);
  if (cached) return cached;

  const stored = await getSample(sampleId);
  if (!stored) return null;

  const arrayBuffer = await stored.blob.arrayBuffer();
  return engine.decodeAndCache(sampleId, arrayBuffer);
}

export async function hydrateProjectSamples(sampleIds: string[]): Promise<void> {
  await Promise.all(sampleIds.map((id) => ensureSampleLoaded(id)));
}

/** Every sample a project actually references: audio clips, and sampler
 * instruments' assigned samples. Callers that only checked `track.clips`
 * (export, mix analysis, project-open hydration) would silently miss a
 * sampler track's sample and render/analyze it as silence - use this
 * instead of hand-rolling the clip-only version. */
export function collectProjectSampleIds(project: Project): string[] {
  const ids = new Set<string>();
  for (const track of project.tracks) {
    for (const clip of track.clips) ids.add(clip.sampleId);
    if (track.instrument?.type === "sampler" && track.instrument.sampleId) {
      ids.add(track.instrument.sampleId);
    }
  }
  return Array.from(ids);
}
