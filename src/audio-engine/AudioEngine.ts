import { dbToGain } from "./dbUtils";
import { encodeWav } from "./wavEncoder";
import { EffectChain, type EffectChainDeps } from "./effects/EffectChain";
import type { AudioClip, LoopRegion, Track, TrackId } from "@/types/project";
import type { EffectInstance } from "@/types/effects";

/**
 * Real-time audio engine: owns the single AudioContext, the per-track mixer
 * graph, and clip playback scheduling.
 *
 * Deliberately dumb: no analysis, no AI, no heavy DSP. That work happens
 * offline (see AUDIO_ENGINE.md) and only ever touches this engine through
 * buffers/params, never inside the audio callback.
 */

interface TrackGraph {
  input: GainNode; // insert chain attaches here, see EffectChain
  effectChain: EffectChain;
  volume: GainNode;
  pan: StereoPannerNode;
  muteGain: GainNode; // 0/1, driven by mute+solo logic
  analyser: AnalyserNode;
}

interface ScheduledSource {
  source: AudioBufferSourceNode;
  envelope: GainNode;
  clipId: string;
}

interface RecordingSession {
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  worklet: AudioWorkletNode;
  analyser: AnalyserNode;
  silentSink: GainNode;
  chunks: Float32Array[][]; // chunks[channel][block]
  /** Timeline position (seconds) where the resulting clip should start. */
  startTime: number;
}

export interface RecordingResult {
  blob: Blob;
  durationSec: number;
  startTime: number;
}

export type StartRecordingResult = { ok: true } | { ok: false; error: string };

export type TransportListener = (currentTime: number) => void;

const METRONOME_LOOKAHEAD_SEC = 0.1;
const METRONOME_INTERVAL_MS = 25;
const RECORDER_WORKLET_URL = "/worklets/recorder-processor.js";
const NOISE_GATE_WORKLET_URL = "/worklets/noise-gate-processor.js";

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private loudnessAnalyser: AnalyserNode | null = null;
  private masterChain: EffectChain | null = null;
  private noiseGateWorkletPromise: Promise<void> | null = null;
  private noiseGateWorkletLoaded = false;

  private tracks = new Map<TrackId, TrackGraph>();
  private soloedTracks = new Set<TrackId>();
  private bufferCache = new Map<string, AudioBuffer>();

  private scheduled: ScheduledSource[] = [];
  private playing = false;
  private contextTimeAtPlay = 0;
  private playheadAtPlay = 0;
  private rafId: number | null = null;
  private listeners = new Set<TransportListener>();

  private metronomeEnabled = false;
  private metronomeTimer: ReturnType<typeof setInterval> | null = null;
  private nextClickTime = 0;
  private nextClickBeat = 0;

  private recording: RecordingSession | null = null;
  private recorderWorkletLoaded = false;

  /** Must be called from a user-gesture handler (click) before any playback. */
  ensureContext(): AudioContext {
    if (!this.ctx) {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      const masterChain = new EffectChain(ctx, this.effectChainDeps());
      master.connect(masterChain.inputNode);
      masterChain.outputNode.connect(analyser);
      analyser.connect(ctx.destination);

      // Loudness tap: approximate K-weighting (perceptual, not exact BS.1770
      // coefficients — see loudness.ts) feeding a dedicated analyser. Needs
      // its own silent path to destination or it won't be pulled at all
      // (same reasoning as the recording silentSink — see AUDIO_ENGINE.md).
      const kShelf = ctx.createBiquadFilter();
      kShelf.type = "highshelf";
      kShelf.frequency.value = 1500;
      kShelf.gain.value = 4;
      const kHighpass = ctx.createBiquadFilter();
      kHighpass.type = "highpass";
      kHighpass.frequency.value = 60;
      const loudnessAnalyser = ctx.createAnalyser();
      loudnessAnalyser.fftSize = 2048;
      const loudnessSink = ctx.createGain();
      loudnessSink.gain.value = 0;
      analyser.connect(kShelf);
      kShelf.connect(kHighpass);
      kHighpass.connect(loudnessAnalyser);
      loudnessAnalyser.connect(loudnessSink);
      loudnessSink.connect(ctx.destination);

      this.ctx = ctx;
      this.master = master;
      this.masterAnalyser = analyser;
      this.loudnessAnalyser = loudnessAnalyser;
      this.masterChain = masterChain;
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  getContext(): AudioContext | null {
    return this.ctx;
  }

  getMasterAnalyser(): AnalyserNode | null {
    return this.masterAnalyser;
  }

  getLoudnessAnalyser(): AnalyserNode | null {
    return this.loudnessAnalyser;
  }

  syncMasterInserts(inserts: EffectInstance[]): void {
    this.ensureContext();
    this.masterChain?.setInserts(inserts);
  }

  private effectChainDeps(): EffectChainDeps {
    return {
      isNoiseGateWorkletLoaded: () => this.noiseGateWorkletLoaded,
      ensureNoiseGateWorklet: () => this.ensureNoiseGateWorklet(),
    };
  }

  private ensureNoiseGateWorklet(): Promise<void> {
    if (this.noiseGateWorkletLoaded) return Promise.resolve();
    if (!this.noiseGateWorkletPromise) {
      const ctx = this.ensureContext();
      this.noiseGateWorkletPromise = ctx.audioWorklet.addModule(NOISE_GATE_WORKLET_URL).then(() => {
        this.noiseGateWorkletLoaded = true;
      });
    }
    return this.noiseGateWorkletPromise;
  }

  // ---------------------------------------------------------------------
  // Track graph
  // ---------------------------------------------------------------------

  syncTracks(tracks: Track[]): void {
    const ctx = this.ensureContext();
    const master = this.master!;
    const liveIds = new Set(tracks.map((t) => t.id));

    for (const [id, graph] of this.tracks) {
      if (!liveIds.has(id)) {
        graph.input.disconnect();
        graph.effectChain.dispose();
        this.tracks.delete(id);
      }
    }

    this.soloedTracks = new Set(tracks.filter((t) => t.solo).map((t) => t.id));

    for (const track of tracks) {
      let graph = this.tracks.get(track.id);
      if (!graph) {
        const input = ctx.createGain();
        const effectChain = new EffectChain(ctx, this.effectChainDeps());
        const volume = ctx.createGain();
        const pan = ctx.createStereoPanner();
        const muteGain = ctx.createGain();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        input.connect(effectChain.inputNode);
        effectChain.outputNode.connect(volume);
        volume.connect(pan);
        pan.connect(muteGain);
        muteGain.connect(analyser);
        analyser.connect(master);
        graph = { input, effectChain, volume, pan, muteGain, analyser };
        this.tracks.set(track.id, graph);
      }
      graph.effectChain.setInserts(track.inserts);
      graph.volume.gain.value = dbToGain(track.volumeDb);
      graph.pan.pan.value = track.pan;
      const audible = !track.muted && (this.soloedTracks.size === 0 || track.solo);
      graph.muteGain.gain.value = audible ? 1 : 0;
    }
  }

  getTrackAnalyser(trackId: TrackId): AnalyserNode | null {
    return this.tracks.get(trackId)?.analyser ?? null;
  }

  // ---------------------------------------------------------------------
  // Buffer cache
  // ---------------------------------------------------------------------

  async decodeAndCache(sampleId: string, arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    const ctx = this.ensureContext();
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    this.bufferCache.set(sampleId, buffer);
    return buffer;
  }

  getBuffer(sampleId: string): AudioBuffer | undefined {
    return this.bufferCache.get(sampleId);
  }

  hasBuffer(sampleId: string): boolean {
    return this.bufferCache.has(sampleId);
  }

  // ---------------------------------------------------------------------
  // Transport
  // ---------------------------------------------------------------------

  isPlaying(): boolean {
    return this.playing;
  }

  getCurrentTime(): number {
    if (!this.ctx) return this.playheadAtPlay;
    if (!this.playing) return this.playheadAtPlay;
    return this.playheadAtPlay + (this.ctx.currentTime - this.contextTimeAtPlay);
  }

  onTimeUpdate(listener: TransportListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  play(tracks: Track[], fromTime: number, loop: LoopRegion, bpm: number): void {
    const ctx = this.ensureContext();
    this.stopSources();
    this.syncTracks(tracks);

    this.playheadAtPlay = fromTime;
    this.contextTimeAtPlay = ctx.currentTime;
    this.playing = true;

    this.scheduleClips(tracks, fromTime, ctx.currentTime);

    if (this.metronomeEnabled) {
      this.startMetronome(fromTime, bpm);
    }

    this.startClock(tracks, loop, bpm);
  }

  pause(): void {
    if (!this.playing) return;
    this.playheadAtPlay = this.getCurrentTime();
    this.playing = false;
    this.stopSources();
    this.stopMetronome();
    this.stopClock();
  }

  stop(): void {
    this.playing = false;
    this.playheadAtPlay = 0;
    this.stopSources();
    this.stopMetronome();
    this.stopClock();
    this.emitTime();
  }

  seek(time: number, tracks: Track[], loop: LoopRegion, bpm: number): void {
    const wasPlaying = this.playing;
    this.stopSources();
    this.stopMetronome();
    this.playheadAtPlay = Math.max(0, time);
    if (wasPlaying && this.ctx) {
      this.contextTimeAtPlay = this.ctx.currentTime;
      this.scheduleClips(tracks, this.playheadAtPlay, this.ctx.currentTime);
      if (this.metronomeEnabled) this.startMetronome(this.playheadAtPlay, bpm);
    }
    this.emitTime();
  }

  setMetronomeEnabled(enabled: boolean, tracks: Track[], bpm: number): void {
    this.metronomeEnabled = enabled;
    if (!enabled) {
      this.stopMetronome();
    } else if (this.playing) {
      this.startMetronome(this.getCurrentTime(), bpm);
    }
  }

  private scheduleClips(tracks: Track[], fromTime: number, ctxStartTime: number): void {
    for (const track of tracks) {
      const graph = this.tracks.get(track.id);
      if (!graph) continue;
      for (const clip of track.clips) {
        this.scheduleClip(clip, graph, fromTime, ctxStartTime);
      }
    }
  }

  private scheduleClip(
    clip: AudioClip,
    graph: TrackGraph,
    fromTime: number,
    ctxStartTime: number
  ): void {
    const buffer = this.bufferCache.get(clip.sampleId);
    if (!buffer || !this.ctx) return;

    const clipEnd = clip.startTime + clip.duration;
    if (clipEnd <= fromTime) return; // already played out

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const envelope = this.ctx.createGain();
    envelope.gain.value = dbToGain(clip.gainDb);
    source.connect(envelope);
    envelope.connect(graph.input);

    const startsInFuture = clip.startTime >= fromTime;
    const when = startsInFuture ? ctxStartTime + (clip.startTime - fromTime) : ctxStartTime;
    const offsetIntoClip = startsInFuture ? 0 : fromTime - clip.startTime;
    const sourceOffset = clip.sourceOffset + offsetIntoClip;
    const playDuration = clip.duration - offsetIntoClip;
    if (playDuration <= 0) return;

    this.applyFades(envelope.gain, clip, when, startsInFuture ? 0 : offsetIntoClip);

    source.start(when, sourceOffset, playDuration);
    this.scheduled.push({ source, envelope, clipId: clip.id });
    source.onended = () => {
      this.scheduled = this.scheduled.filter((s) => s.source !== source);
    };
  }

  private applyFades(
    gainParam: AudioParam,
    clip: AudioClip,
    when: number,
    offsetIntoClip: number
  ): void {
    const base = dbToGain(clip.gainDb);
    if (clip.fadeInSec > 0 && offsetIntoClip < clip.fadeInSec) {
      const remaining = clip.fadeInSec - offsetIntoClip;
      gainParam.setValueAtTime(0, when);
      gainParam.linearRampToValueAtTime(base, when + remaining);
    }
    if (clip.fadeOutSec > 0) {
      const fadeOutStart = clip.duration - clip.fadeOutSec - offsetIntoClip;
      if (fadeOutStart > 0) {
        gainParam.setValueAtTime(base, when + fadeOutStart);
        gainParam.linearRampToValueAtTime(0, when + fadeOutStart + clip.fadeOutSec);
      }
    }
  }

  private stopSources(): void {
    for (const { source } of this.scheduled) {
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
      } catch {
        // already stopped
      }
    }
    this.scheduled = [];
  }

  // ---------------------------------------------------------------------
  // Playhead clock (UI updates + loop handling)
  // ---------------------------------------------------------------------

  private startClock(tracks: Track[], loop: LoopRegion, bpm: number): void {
    const tick = () => {
      if (!this.playing) return;
      const t = this.getCurrentTime();
      if (loop.enabled && t >= loop.endTime) {
        this.seek(loop.startTime, tracks, loop, bpm);
      }
      this.emitTime();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopClock(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private emitTime(): void {
    const t = this.getCurrentTime();
    for (const l of this.listeners) l(t);
  }

  // ---------------------------------------------------------------------
  // Metronome
  // ---------------------------------------------------------------------

  private startMetronome(fromTime: number, bpm: number): void {
    this.stopMetronome();
    if (!this.ctx) return;
    const secPerBeat = 60 / bpm;
    const beatsElapsed = Math.ceil(fromTime / secPerBeat);
    this.nextClickBeat = beatsElapsed;
    this.nextClickTime = this.ctx.currentTime + (beatsElapsed * secPerBeat - fromTime);

    this.metronomeTimer = setInterval(() => {
      if (!this.ctx || !this.playing) return;
      while (this.nextClickTime < this.ctx.currentTime + METRONOME_LOOKAHEAD_SEC) {
        this.playClick(this.nextClickTime, this.nextClickBeat % 4 === 0);
        this.nextClickBeat += 1;
        this.nextClickTime += secPerBeat;
      }
    }, METRONOME_INTERVAL_MS);
  }

  private playClick(time: number, accent: boolean): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = accent ? 1500 : 1000;
    gain.gain.setValueAtTime(accent ? 0.35 : 0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  private stopMetronome(): void {
    if (this.metronomeTimer !== null) {
      clearInterval(this.metronomeTimer);
      this.metronomeTimer = null;
    }
  }

  // ---------------------------------------------------------------------
  // Recording
  //
  // Captures raw Float32 PCM through an AudioWorklet (see
  // public/worklets/recorder-processor.js) instead of MediaRecorder, so the
  // take is never touched by a lossy codec before reaching the DSP chain.
  // The mic is deliberately never routed to the output — monitoring is
  // visual only (see getRecordingAnalyser) to avoid feedback, since this
  // app's whole premise is phone/earbud recording setups.
  // ---------------------------------------------------------------------

  isRecording(): boolean {
    return this.recording !== null;
  }

  getRecordingAnalyser(): AnalyserNode | null {
    return this.recording?.analyser ?? null;
  }

  /**
   * Starts capturing mic input and, simultaneously, plays back existing
   * tracks from `fromTime` so the take can be recorded over a beat.
   */
  async startRecording(
    tracks: Track[],
    loop: LoopRegion,
    bpm: number,
    fromTime: number
  ): Promise<StartRecordingResult> {
    if (this.recording) return { ok: false, error: "Already recording" };
    if (!navigator.mediaDevices?.getUserMedia) {
      return { ok: false, error: "Microphone access is not available in this browser/context" };
    }

    const ctx = this.ensureContext();

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      });
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Microphone permission denied",
      };
    }

    if (!this.recorderWorkletLoaded) {
      await ctx.audioWorklet.addModule(RECORDER_WORKLET_URL);
      this.recorderWorkletLoaded = true;
    }

    const source = ctx.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(ctx, "recorder-processor");
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    const silentSink = ctx.createGain();
    silentSink.gain.value = 0;

    source.connect(worklet);
    source.connect(analyser);
    worklet.connect(silentSink);
    analyser.connect(silentSink);
    silentSink.connect(ctx.destination);

    const chunks: Float32Array[][] = [];
    worklet.port.onmessage = (event: MessageEvent<Float32Array[]>) => {
      for (let ch = 0; ch < event.data.length; ch++) {
        (chunks[ch] ??= []).push(event.data[ch]);
      }
    };

    this.recording = { stream, source, worklet, analyser, silentSink, chunks, startTime: fromTime };

    // Play existing material under the take, same machinery as play().
    this.stopSources();
    this.syncTracks(tracks);
    this.playheadAtPlay = fromTime;
    this.contextTimeAtPlay = ctx.currentTime;
    this.playing = true;
    this.scheduleClips(tracks, fromTime, ctx.currentTime);
    if (this.metronomeEnabled) this.startMetronome(fromTime, bpm);
    this.startClock(tracks, loop, bpm);

    return { ok: true };
  }

  /** Stops capture + playback and returns the encoded take, or null if nothing was recording. */
  stopRecording(): RecordingResult | null {
    if (!this.recording || !this.ctx) return null;
    const { stream, source, worklet, analyser, silentSink, chunks, startTime } = this.recording;

    worklet.port.onmessage = null;
    source.disconnect();
    worklet.disconnect();
    analyser.disconnect();
    silentSink.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    this.recording = null;

    this.playheadAtPlay = this.getCurrentTime();
    this.playing = false;
    this.stopSources();
    this.stopMetronome();
    this.stopClock();
    this.emitTime();

    const numChannels = Math.max(1, chunks.length);
    const channelArrays: Float32Array[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const blocks = chunks[ch] ?? [];
      const totalLength = blocks.reduce((sum, block) => sum + block.length, 0);
      const merged = new Float32Array(totalLength);
      let offset = 0;
      for (const block of blocks) {
        merged.set(block, offset);
        offset += block.length;
      }
      channelArrays.push(merged);
    }

    const durationSec = channelArrays[0] ? channelArrays[0].length / this.ctx.sampleRate : 0;
    const blob = encodeWav(channelArrays, this.ctx.sampleRate);
    return { blob, durationSec, startTime };
  }

  /** Aborts recording without producing a clip (permission errors, user cancel, etc). */
  discardRecording(): void {
    if (!this.recording) return;
    const { stream, source, worklet, analyser, silentSink } = this.recording;
    worklet.port.onmessage = null;
    source.disconnect();
    worklet.disconnect();
    analyser.disconnect();
    silentSink.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    this.recording = null;
    this.stop();
  }
}

let singleton: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
  if (!singleton) singleton = new AudioEngine();
  return singleton;
}
