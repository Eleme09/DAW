/**
 * Offline project rendering: sums every track (clips, volume/pan/mute/solo,
 * insert chain) plus the master insert chain into a single stereo
 * AudioBuffer via OfflineAudioContext. Shares EffectChain/Effect* with the
 * live engine (see effects/EffectChain.ts, generalized to BaseAudioContext
 * specifically for this) so a bounced mix always matches what was heard
 * during playback — no separate rendering path to drift out of sync.
 *
 * Used by both project export (Export to WAV) and, later, the Mix
 * Assistant, which needs to analyze the actual summed mix rather than
 * per-track buffers.
 */
import { dbToGain } from "./dbUtils";
import { EffectChain, type EffectChainDeps } from "./effects/EffectChain";
import type { AudioClip, Project } from "@/types/project";

const NOISE_GATE_WORKLET_URL = "/worklets/noise-gate-processor.js";
/** Let reverb/delay tails ring out past the last clip instead of getting cut off. */
const TAIL_PADDING_SEC = 3;

export interface BounceOptions {
  sampleRate?: number;
}

function projectUsesNoiseGate(project: Project): boolean {
  const chains = [project.masterInserts, ...project.tracks.map((t) => t.inserts)];
  return chains.some((inserts) => inserts.some((i) => i.type === "noiseGate"));
}

function projectDurationSec(project: Project): number {
  let end = 0;
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      end = Math.max(end, clip.startTime + clip.duration);
    }
  }
  return end;
}

/**
 * Renders `project` to a stereo AudioBuffer. `getBuffer` resolves a clip's
 * sampleId to its decoded AudioBuffer (AudioBuffers aren't bound to a
 * specific context, so buffers already decoded against the live
 * AudioContext work fine here — see AudioEngine.decodeAndCache).
 */
export async function bounceProject(
  project: Project,
  getBuffer: (sampleId: string) => AudioBuffer | undefined,
  options: BounceOptions = {}
): Promise<AudioBuffer> {
  const sampleRate = options.sampleRate ?? 44100;
  const durationSec = projectDurationSec(project);
  const length = Math.max(1, Math.ceil((durationSec + TAIL_PADDING_SEC) * sampleRate));
  const ctx = new OfflineAudioContext(2, length, sampleRate);

  // Unlike the live engine, there's no benefit to lazy-loading the worklet
  // here — a one-shot render can just await it up front and skip the
  // placeholder-swap dance EffectChain does for the live context.
  if (projectUsesNoiseGate(project)) {
    await ctx.audioWorklet.addModule(NOISE_GATE_WORKLET_URL);
  }
  const deps: EffectChainDeps = {
    isNoiseGateWorkletLoaded: () => true,
    ensureNoiseGateWorklet: () => Promise.resolve(),
  };

  const master = ctx.createGain();
  const masterChain = new EffectChain(ctx, deps);
  master.connect(masterChain.inputNode);
  masterChain.outputNode.connect(ctx.destination);
  masterChain.setInserts(project.masterInserts);

  const soloedTracks = new Set(project.tracks.filter((t) => t.solo).map((t) => t.id));

  for (const track of project.tracks) {
    const input = ctx.createGain();
    const effectChain = new EffectChain(ctx, deps);
    const volume = ctx.createGain();
    const pan = ctx.createStereoPanner();
    const muteGain = ctx.createGain();

    input.connect(effectChain.inputNode);
    effectChain.outputNode.connect(volume);
    volume.connect(pan);
    pan.connect(muteGain);
    muteGain.connect(master);

    effectChain.setInserts(track.inserts);
    volume.gain.value = dbToGain(track.volumeDb);
    pan.pan.value = track.pan;
    const audible = !track.muted && (soloedTracks.size === 0 || track.solo);
    muteGain.gain.value = audible ? 1 : 0;

    if (!audible) continue; // silent track contributes nothing — skip scheduling its sources

    for (const clip of track.clips) {
      const buffer = getBuffer(clip.sampleId);
      if (!buffer) continue;
      scheduleClip(ctx, clip, input, buffer);
    }
  }

  return ctx.startRendering();
}

function scheduleClip(
  ctx: OfflineAudioContext,
  clip: AudioClip,
  destination: AudioNode,
  buffer: AudioBuffer
): void {
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const envelope = ctx.createGain();
  envelope.gain.value = dbToGain(clip.gainDb);
  source.connect(envelope);
  envelope.connect(destination);

  applyFades(envelope.gain, clip);

  source.start(clip.startTime, clip.sourceOffset, clip.duration);
}

function applyFades(gainParam: AudioParam, clip: AudioClip): void {
  const base = dbToGain(clip.gainDb);
  if (clip.fadeInSec > 0) {
    gainParam.setValueAtTime(0, clip.startTime);
    gainParam.linearRampToValueAtTime(base, clip.startTime + clip.fadeInSec);
  }
  if (clip.fadeOutSec > 0) {
    const fadeOutStart = clip.startTime + clip.duration - clip.fadeOutSec;
    gainParam.setValueAtTime(base, fadeOutStart);
    gainParam.linearRampToValueAtTime(0, clip.startTime + clip.duration);
  }
}

/** Interleaves an AudioBuffer's channels back into per-channel Float32Arrays for encodeWav. */
export function audioBufferToChannelArrays(buffer: AudioBuffer): Float32Array[] {
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }
  return channels;
}
