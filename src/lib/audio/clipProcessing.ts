import { getAudioEngine } from "@/audio-engine/AudioEngine";
import { computePeakDb } from "@/audio-engine/loudness";
import { encodeWav } from "@/audio-engine/wavEncoder";
import { reduceNoiseBuffer } from "@/audio-engine/analysis/spectralNoiseReduction";
import { pitchShift, reverseChannels, timeStretch } from "@/audio-engine/timeStretch";
import { harmonizeChannel } from "@/audio-engine/pitch/harmonize";
import { trackPitch } from "@/audio-engine/pitch/pitchDetection";
import { detectKey } from "@/audio-engine/pitch/keyDetection";
import { ensureSampleLoaded } from "@/lib/audio/sampleLoader";
import { putSample } from "@/lib/storage/sampleStore";
import { addSampleAsset } from "@/lib/storage/sampleIndex";
import type { AudioClip } from "@/types/project";
import type { ScaleName } from "@/types/pitch";

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

async function renderClip(
  clip: AudioClip,
  suffix: string,
  process: (channels: Float32Array[], sampleRate: number) => Float32Array[]
): Promise<Partial<AudioClip>> {
  await nextFrame();
  const { channels, sampleRate } = await readRegion(clip);
  const processed = process(channels, sampleRate);
  const { sampleId, durationSec } = await storeChannels(`${clip.name} ${suffix}`, processed, sampleRate);
  const repetitions = clip.loopLengthSec ? clip.duration / clip.loopLengthSec : 1;
  return clip.loopLengthSec
    ? { sampleId, sourceOffset: 0, loopLengthSec: durationSec, duration: durationSec * repetitions }
    : { sampleId, sourceOffset: 0, duration: durationSec };
}

export const reverseClip = (clip: AudioClip) => renderClip(clip, "(reversa)", (ch) => reverseChannels(ch));

export const denoiseClip = (clip: AudioClip) =>
  renderClip(clip, "(sin ruido)", (ch) => reduceNoiseBuffer(ch, { strength: 0.6 }));

export const transposeClip = (clip: AudioClip, semitones: number) =>
  renderClip(clip, semitones > 0 ? `+${semitones}st` : `${semitones}st`, (ch, sr) => pitchShift(ch, sr, semitones));

/** speed 2 = twice as fast (half as long), 0.5 = twice as long. Same pitch. */
export const stretchClip = (clip: AudioClip, speed: number) =>
  renderClip(clip, `(${speed.toFixed(2)}x)`, (ch, sr) => timeStretch(ch, sr, speed));

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

/** The region's own key, from its detected pitch (what a harmonizer needs
 * to keep the harmony in key). Null when there's no clear melody. */
export async function detectClipKey(clip: AudioClip): Promise<DetectedKey | null> {
  await nextFrame();
  const { channels, sampleRate } = await readRegion(clip);
  const mono = new Float32Array(channels[0].length);
  for (const ch of channels) for (let i = 0; i < mono.length; i++) mono[i] += ch[i] / channels.length;
  const frames = trackPitch(mono, sampleRate);
  const voiced = frames.filter((f) => f.frequencyHz !== null && f.confidence >= 0.5).length;
  if (voiced < 10) return null;
  const result = detectKey(frames);
  return { key: result.key, scale: result.scale === "minor" ? "naturalMinor" : "major" };
}

/**
 * Renders one harmony voice per entry: the melody moved a number of scale
 * degrees inside `key`, so a "third" is major or minor depending on the
 * note (what Antares Harmony Engine / Waves Harmony / BandLab's harmony
 * presets do). `humanize` delays each voice a few ms and detunes it a few
 * cents differently, so the stack doesn't sound like one cloned voice.
 */
export async function renderHarmonyVoices(
  clip: AudioClip,
  key: DetectedKey,
  voices: HarmonyVoice[],
  humanize: boolean
): Promise<{ voice: HarmonyVoice; sampleId: string; durationSec: number }[]> {
  await nextFrame();
  const { channels, sampleRate } = await readRegion(clip);
  const mono = new Float32Array(channels[0].length);
  for (const ch of channels) for (let i = 0; i < mono.length; i++) mono[i] += ch[i] / channels.length;
  const frames = trackPitch(mono, sampleRate);

  const results = [];
  for (let v = 0; v < voices.length; v++) {
    const voice = voices[v];
    let harmony = harmonizeChannel(mono, sampleRate, key.key, key.scale, voice.steps, frames);
    if (humanize) {
      const cents = (v % 2 === 0 ? 1 : -1) * (6 + 3 * v);
      const delaySamples = Math.round(((12 + 7 * v) / 1000) * sampleRate);
      harmony = pitchShift([harmony], sampleRate, cents / 100)[0];
      const delayed = new Float32Array(harmony.length);
      delayed.set(harmony.subarray(0, harmony.length - delaySamples), delaySamples);
      harmony = delayed;
    }
    const stored = await storeChannels(`${clip.name} armonía ${voice.label}`, [harmony], sampleRate);
    results.push({ voice, ...stored });
    await nextFrame();
  }
  return results;
}
