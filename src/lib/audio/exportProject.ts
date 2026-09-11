import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { audioBufferToChannelArrays, bounceProject } from "@/audio-engine/bounce";
import { encodeWav } from "@/audio-engine/wavEncoder";
import { hydrateProjectSamples } from "./sampleLoader";
import type { Project } from "@/types/project";

/**
 * Renders the full project offline (see audio-engine/bounce.ts) and
 * triggers a WAV download in the browser — the "Mix -> Master -> Export"
 * step of the mobile workflow from the project brief.
 */
export async function exportProjectToWav(project: Project): Promise<void> {
  const sampleIds = Array.from(new Set(project.tracks.flatMap((t) => t.clips.map((c) => c.sampleId))));
  await hydrateProjectSamples(sampleIds);

  const engine = getAudioEngine();
  const rendered = await bounceProject(project, (id) => engine.getBuffer(id));
  const blob = encodeWav(audioBufferToChannelArrays(rendered), rendered.sampleRate);

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${project.name || "project"}.wav`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
