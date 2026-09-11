import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { getSample } from "@/lib/storage/sampleStore";

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
