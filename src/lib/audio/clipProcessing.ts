import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { computePeakDb } from "@/audio-engine/loudness";
import { encodeWav } from "@/audio-engine/wavEncoder";
import { reverseChannels } from "@/audio-engine/timeStretch";
import { ensureSampleLoaded } from "@/lib/audio/sampleLoader";
import { putSample } from "@/lib/storage/sampleStore";
import { addSampleAsset } from "@/lib/storage/sampleIndex";
import { abortError, runClipJob, type JobOptions } from "@/lib/audio/clipWorkerClient";
import type { ClipJob } from "@/lib/audio/clipJobs";
import type { AudioClip } from "@/types/project";
import type { PitchFrame, ScaleName } from "@/types/pitch";

/**
 * Destructive region actions from BandLab's region ⋯ menu. Each one renders
 * the clip's audible region (one loop repetition if the clip loops) through
 * a DSP function, stores the result as a new sample and returns the patch
 * that points the clip at it. The original sample is never overwritten, so
 * undo (the arrow left of REC) brings the previous version back.
 */

export const NORMALIZE_TARGET_DB = -0.5;

async function readRegion(clip: AudioClip): Promise<{ channels: Float32Array[]; sampleRate: number }> {
  const buffer = getAudioEngine().getBuffer(clip.sampleId) ?? (await ensureSampleLoaded(clip.sampleId));
  if (!buffer) throw new Error("No se encontró el audio de esta región");
  const length = clip.loopLengthSec ?? clip.duration;
  const start = Math.round(clip.sourceOffset * buffer.sampleRate);
  const end = Math.min(buffer.length, Math.round((clip.sourceOffset + length) * buffer.sampleRate));
  if (end <= start) throw new Error("La región está vacía");
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch).slice(start, end));
  return { channels, sampleRate: buffer.sampleRate };
}

async function storeChannels(name: string, channels: Float32Array[], sampleRate: number): Promise<{ sampleId: string; durationSec: number }> {
  const blob = encodeWav(channels, sampleRate);
  const sampleId = crypto.randomUUID();
  await getAudioEngine().decodeAndCache(sampleId, await blob.arrayBuffer());
  await putSample(sampleId, name, blob);
  const durationSec = channels[0].length / sampleRate;
  await addSampleAsset({
    id: sampleId,
    name,
    durationSec,
    sampleRate,
    channels: channels.length,
    createdAt: new Date().toISOString(),
  });
  return { sampleId, durationSec };
}

/** Lets React paint the "Procesando…" state before the main thread is busy. */
const nextFrame = () => new Promise((r) => setTimeout(r, 30));

/** Reads the region, runs `job` off the main thread and stores the result as
 * a new sample. Cancellable (`options.signal`); nothing is stored if it is. */
async function renderClip(
  clip: AudioClip,
  suffix: string,
  makeJob: (channels: Float32Array[], sampleRate: number) => ClipJob,
  options: JobOptions = {}
): Promise<Partial<AudioClip>> {
  await nextFrame();
  const { channels, sampleRate } = await readRegion(clip);
  const result = await runClipJob(makeJob(channels, sampleRate), options);
  if (result.kind !== "channels") throw new Error("Respuesta inesperada del procesador de audio");
  if (options.signal?.aborted) throw abortError();
  const { sampleId, durationSec } = await storeChannels(`${clip.name} ${suffix}`, result.channels, sampleRate);
  const repetitions = clip.loopLengthSec ? clip.duration / clip.loopLengthSec : 1;
  return clip.loopLengthSec
    ? { sampleId, sourceOffset: 0, loopLengthSec: durationSec, duration: durationSec * repetitions }
    : { sampleId, sourceOffset: 0, duration: durationSec };
}

/** Instant (a single pass over the samples) - no worker needed. */
export async function reverseClip(clip: AudioClip): Promise<Partial<AudioClip>> {
  await nextFrame();
  const { channels, sampleRate } = await readRegion(clip);
  const { sampleId, durationSec } = await storeChannels(`${clip.name} (reversa)`, reverseChannels(channels), sampleRate);
  const repetitions = clip.loopLengthSec ? clip.duration / clip.loopLengthSec : 1;
  return clip.loopLengthSec
    ? { sampleId, sourceOffset: 0, loopLengthSec: durationSec, duration: durationSec * repetitions }
    : { sampleId, sourceOffset: 0, duration: durationSec };
}

export const denoiseClip = (clip: AudioClip, options?: JobOptions) =>
  renderClip(clip, "(sin ruido)", (channels, sampleRate) => ({ kind: "denoise", channels, sampleRate }), options);

export const transposeClip = (clip: AudioClip, semitones: number, options?: JobOptions) =>
  renderClip(
    clip,
    semitones > 0 ? `+${semitones}st` : `${semitones}st`,
    (channels, sampleRate) => ({ kind: "transpose", channels, sampleRate, semitones }),
    options
  );

/** speed 2 = twice as fast (half as long), 0.5 = twice as long. Same pitch. */
export const stretchClip = (clip: AudioClip, speed: number, options?: JobOptions) =>
  renderClip(clip, `(${speed.toFixed(2)}x)`, (channels, sampleRate) => ({ kind: "stretch", channels, sampleRate, speed }), options);

/** Gain that brings the region's loudest peak to NORMALIZE_TARGET_DB. */
export async function normalizeGainDb(clip: AudioClip): Promise<number | null> {
  const { channels } = await readRegion(clip);
  let peakDb = -Infinity;
  for (const ch of channels) peakDb = Math.max(peakDb, computePeakDb(ch));
  if (!Number.isFinite(peakDb)) return null;
  return NORMALIZE_TARGET_DB - peakDb;
}

export interface HarmonyVoice {
  /** Diatonic steps from the melody: +2 = third up, -2 = third down, +4 = fifth up, -3 = fourth down, ±7 = octave. */
  steps: number;
  label: string;
}

export interface DetectedKey {
  key: number;
  scale: ScaleName;
}

function monoOf(channels: Float32Array[]): Float32Array {
  const mono = new Float32Array(channels[0].length);
  for (const ch of channels) for (let i = 0; i < mono.length; i++) mono[i] += ch[i] / channels.length;
  return mono;
}

export interface ClipMelody {
  /** The region's own key, or null when there is no clear melody. */
  key: DetectedKey | null;
  /** Reuse these in `renderHarmonyVoices` so the audio is analysed only once. */
  frames: PitchFrame[];
}

/** The region's key from its detected pitch (what a harmonizer needs to keep
 * the harmony in key). Runs off the main thread; cancellable. */
export async function analyzeClipMelody(clip: AudioClip, options: JobOptions = {}): Promise<ClipMelody> {
  await nextFrame();
  const { channels, sampleRate } = await readRegion(clip);
  const result = await runClipJob({ kind: "analyze", mono: monoOf(channels), sampleRate }, options);
  if (result.kind !== "analyze") throw new Error("Respuesta inesperada del procesador de audio");
  return { key: result.detected ? { key: result.key, scale: result.scale } : null, frames: result.frames };
}

/**
 * Renders one harmony voice per entry: the melody moved a number of scale
 * degrees inside `key`, so a "third" is major or minor depending on the
 * note (what Antares Harmony Engine / Waves Harmony / BandLab's harmony
 * presets do). `humanize` delays each voice a few ms and detunes it a few
 * cents differently, so the stack doesn't sound like one cloned voice.
 * Off the main thread and cancellable; nothing is stored if it is.
 */
export async function renderHarmonyVoices(
  clip: AudioClip,
  key: DetectedKey,
  voices: HarmonyVoice[],
  humanize: boolean,
  options: JobOptions & { frames?: PitchFrame[] } = {}
): Promise<{ voice: HarmonyVoice; sampleId: string; durationSec: number }[]> {
  await nextFrame();
  const { channels, sampleRate } = await readRegion(clip);
  const result = await runClipJob(
    {
      kind: "harmony",
      mono: monoOf(channels),
      sampleRate,
      key: key.key,
      scale: key.scale,
      frames: options.frames,
      steps: voices.map((v) => v.steps),
      humanize,
    },
    options
  );
  if (result.kind !== "channels") throw new Error("Respuesta inesperada del procesador de audio");

  const results = [];
  for (let v = 0; v < voices.length; v++) {
    if (options.signal?.aborted) throw abortError();
    const stored = await storeChannels(`${clip.name} armonía ${voices[v].label}`, [result.channels[v]], sampleRate);
    results.push({ voice: voices[v], ...stored });
  }
  return results;
}
