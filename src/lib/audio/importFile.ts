import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { putSample } from "@/lib/storage/sampleStore";
import { addSampleAsset } from "@/lib/storage/sampleIndex";
import type { SampleAsset } from "@/types/project";

/** File types offered by every import picker. Video is included on purpose:
 * BandLab imports MP4 and uses its audio (BANDLAB_REFERENCE.md §9), and the
 * browser's decoder reads the audio track of MP4/MOV/WebM directly. */
export const IMPORT_ACCEPT = "audio/*,video/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.mp4,.mov,.webm";

/**
 * Decodes an audio OR video file, stores it, and registers it as a sample.
 * Throws when the browser can't decode an audio track from the file - the
 * caller is expected to report that, never swallow it.
 */
export async function importAudioFile(file: File): Promise<SampleAsset> {
  const arrayBuffer = await file.arrayBuffer();
  const id = crypto.randomUUID();
  const buffer = await getAudioEngine().decodeAndCache(id, arrayBuffer);
  await putSample(id, file.name, new Blob([arrayBuffer], { type: file.type }));
  const asset: SampleAsset = {
    id,
    name: file.name,
    durationSec: buffer.duration,
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
    createdAt: new Date().toISOString(),
    origin: file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(file.name) ? "video" : "import",
  };
  await addSampleAsset(asset);
  return asset;
}
