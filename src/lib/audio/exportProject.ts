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
 * The rate the project's audio is already at: clips are decoded at the live
 * AudioContext's rate (48 kHz on an iPhone), so rendering at that rate avoids
 * a second resampling. The fixed 44.1 kHz export took 44.1 -> 48 -> 44.1 kHz
 * on a phone: -1.8 dB at 9.6-16 kHz and a 40 dB null test on a real vocal
 * (85 dB at matching rates).
 */
function projectSampleRate(project: Project): number | undefined {
  const engine = getAudioEngine();
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      const rate = engine.getBuffer(clip.sampleId)?.sampleRate;
      if (rate) return rate;
    }
  }
  return undefined;
}

/**
 * Renders the full project offline (see audio-engine/bounce.ts) and
 * triggers a WAV download in the browser — the "Mix -> Master -> Export"
 * step of the mobile workflow from the project brief.
 */
export async function exportProjectToWav(project: Project): Promise<void> {
  await hydrateProjectSamples(collectProjectSampleIds(project));

  const engine = getAudioEngine();
  const rendered = await bounceProject(project, (id) => engine.getBuffer(id), { sampleRate: projectSampleRate(project) });
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
  const tracksWithAudio = project.tracks.filter((t) => t.clips.length > 0);

  for (const track of tracksWithAudio) {
    const soloProject: Project = {
      ...project,
      tracks: project.tracks.map((t) => ({ ...t, solo: t.id === track.id })),
    };
    const rendered = await bounceProject(soloProject, (id) => engine.getBuffer(id), { sampleRate: projectSampleRate(project) });
    const blob = encodeWav(audioBufferToChannelArrays(rendered), rendered.sampleRate);
    downloadBlob(blob, `${sanitizeFilename(project.name)} - ${sanitizeFilename(track.name)}.wav`);
    // Stagger downloads - browsers silently drop some of a burst of
    // same-tick multi-file downloads triggered back-to-back with no gap.
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}
