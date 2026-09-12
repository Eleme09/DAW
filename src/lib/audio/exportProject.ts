import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { audioBufferToChannelArrays, bounceProject } from "@/audio-engine/bounce";
import { encodeWav } from "@/audio-engine/wavEncoder";
import { collectProjectSampleIds, hydrateProjectSamples } from "./sampleLoader";
import type { Project } from "@/types/project";

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Filesystem-unsafe characters stripped from track/project names before
 * they become part of a downloaded filename. */
function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "").trim() || "untitled";
}

/**
 * Renders the full project offline (see audio-engine/bounce.ts) and
 * triggers a WAV download in the browser — the "Mix -> Master -> Export"
 * step of the mobile workflow from the project brief.
 */
export async function exportProjectToWav(project: Project): Promise<void> {
  await hydrateProjectSamples(collectProjectSampleIds(project));

  const engine = getAudioEngine();
  const rendered = await bounceProject(project, (id) => engine.getBuffer(id));
  const blob = encodeWav(audioBufferToChannelArrays(rendered), rendered.sampleRate);
  downloadBlob(blob, `${sanitizeFilename(project.name)}.wav`);
}

/**
 * Renders each track with audio (clips or a MIDI pattern) soloed in turn -
 * same "solo one track, bounce, repeat" approach mixAnalysis.ts already
 * uses to measure a track's own contribution, reused here for a
 * user-facing download instead of analysis numbers. Each stem goes through
 * the master chain exactly as it does in the real mix (not a dry pre-fader
 * print) - consistent with how mixAnalysis already interprets "this
 * track's contribution".
 */
export async function exportStemsToWav(project: Project): Promise<void> {
  await hydrateProjectSamples(collectProjectSampleIds(project));
  const engine = getAudioEngine();
  const tracksWithAudio = project.tracks.filter((t) => t.clips.length > 0 || t.midiClips.length > 0);

  for (const track of tracksWithAudio) {
    const soloProject: Project = {
      ...project,
      tracks: project.tracks.map((t) => ({ ...t, solo: t.id === track.id })),
    };
    const rendered = await bounceProject(soloProject, (id) => engine.getBuffer(id));
    const blob = encodeWav(audioBufferToChannelArrays(rendered), rendered.sampleRate);
    downloadBlob(blob, `${sanitizeFilename(project.name)} - ${sanitizeFilename(track.name)}.wav`);
    // Stagger downloads - browsers silently drop some of a burst of
    // same-tick multi-file downloads triggered back-to-back with no gap.
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}
