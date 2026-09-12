/**
 * Offline project rendering: sums every track (clips, volume/pan/mute/solo,
 * insert chain, automation) plus the master insert chain and master volume
 * into a single stereo AudioBuffer via OfflineAudioContext. Shares the
 * EffectChain/Effect classes, synthVoice, and automation scheduling with the
 * live engine (generalized to BaseAudioContext/AudioParam specifically for
 * this) so a bounced mix always matches what was heard during playback — no
 * separate rendering path to drift out of sync.
 *
 * Used by both project export (Export to WAV) and the Mix Assistant, which
 * needs to analyze the actual summed mix rather than per-track buffers.
 */
import { dbToGain } from "./dbUtils";
import { EffectChain, type EffectChainDeps } from "./effects/EffectChain";
import { scheduleVoice } from "./synthVoice";
import { scheduleParamAutomation } from "@/lib/automation/automation";
import type { AudioClip, Instrument, MidiClip, Project } from "@/types/project";

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
    for (const clip of track.midiClips) {
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
  // Post-insert-chain trim, same position as the live engine's master fader
  // (AudioEngine.setMasterVolume) - without this, an exported mix would
  // silently ignore the master fader entirely.
  const masterVolume = ctx.createGain();
  masterVolume.gain.value = dbToGain(project.masterVolumeDb);
  master.connect(masterChain.inputNode);
  masterChain.outputNode.connect(masterVolume);
  masterVolume.connect(ctx.destination);
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
    // Anchored at time 0 (a bounce always starts from the top) - same
    // scheduling AudioEngine.scheduleAutomation uses for live playback.
    scheduleParamAutomation(track.automation.volume, volume.gain, 0, 0, dbToGain);
    scheduleParamAutomation(track.automation.pan, pan.pan, 0, 0, (v) => v);
    const audible = !track.muted && (soloedTracks.size === 0 || track.solo);
    muteGain.gain.value = audible ? 1 : 0;

    if (!audible) continue; // silent track contributes nothing — skip scheduling its sources

    if (track.type === "instrument") {
      if (track.instrument) {
        for (const clip of track.midiClips) {
          scheduleMidiClip(ctx, clip, track.instrument, input, getBuffer);
        }
      }
      continue;
    }

    for (const clip of track.clips) {
      if (clip.muted) continue; // an inactive take in a comp group - see PROGRESS.md "comping"
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

function scheduleMidiClip(
  ctx: OfflineAudioContext,
  clip: MidiClip,
  instrument: Instrument,
  destination: AudioNode,
  getBuffer: (sampleId: string) => AudioBuffer | undefined
): void {
  for (const note of clip.notes) {
    const when = clip.startTime + note.startTime;
    scheduleVoice(ctx, instrument, note, destination, when, getBuffer);
  }
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
