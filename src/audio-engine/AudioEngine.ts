import { dbToGain } from "./dbUtils";
import { encodeWav } from "./wavEncoder";
import { AutoPitchEffect, AUTOPITCH_WORKLET_URL, type PitchTelemetry } from "./autopitch/AutoPitchEffect";
import { DYNAMICS_WORKLET_URL, DynamicsNode, createOutputGuard } from "./effects/dynamics";
import { EffectChain, type EffectChainDeps } from "./effects/EffectChain";
import { isTrackMonitoredLive } from "./monitoring";
import { scheduleParamAutomation } from "@/lib/automation/automation";
import type { AudioClip, Bus, BusId, LoopRegion, Track, TrackId } from "@/types/project";
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
  /** Per-bus send taps, keyed by busId - only present while that send is
   * actually assigned (Track.sends), created/torn down as sends change.
   * Tapped from `analyser` (post volume/pan/mute, same point the track's
   * own meter reads), so a send always matches what that channel is
   * actually contributing right now, not some earlier stage of its chain. */
  sendGains: Map<BusId, GainNode>;
  /** BandLab AutoPitch, between `input` and the Fx chain while enabled. */
  autoPitch: AutoPitchEffect | null;
}

/** A bus has no signal source of its own (no clips) - same
 * shape as a track's own channel strip minus the parts only a track needs
 * (monitor/send taps), reused so bus and track mixing behave identically. */
interface BusGraph {
  input: GainNode;
  effectChain: EffectChain;
  volume: GainNode;
  pan: StereoPannerNode;
  muteGain: GainNode;
  analyser: AnalyserNode;
}


interface ScheduledSource {
  /** OscillatorNode for a synth voice, AudioBufferSourceNode for a sampled
   * clip or a sampler voice - both are AudioScheduledSourceNode, which is
   * all `stopSources()` needs. */
  source: AudioScheduledSourceNode;
  clipId: string;
}

export interface MonitorInputConstraints {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

/** Shared mic capture backing per-track input monitoring (Track.monitorMode)
 * - distinct from `recording` (which deliberately never reaches the
 * destination). One physical input device, fanned out into whichever armed
 * tracks' own `graph.input` currently want to hear it - see
 * refreshMonitoring(). */
interface MonitorSession {
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  /** Input trim, live-adjustable via setInputGainDb() - sits between the
   * raw mic source and everything downstream (analyser + armed tracks) so
   * one control affects both what you hear and what gets recorded. */
  inputGain: GainNode;
  analyser: AnalyserNode;
}

interface RecordingSession {
  /** No stream/source/inputGain of its own - taps directly onto the shared
   * MonitorSession's inputGain (see startRecording()). A previous version
   * opened a second, fully independent getUserMedia() stream here, which
   * meant every recording ran with two concurrent live mic captures open
   * at once (this session's own, plus the armed track's monitor session -
   * "auto" monitor mode turns itself on precisely because isRecording()
   * becomes true, see shouldMonitorTrack()). Two concurrent input streams
   * from the same physical mic is a real, well-known trigger for mobile
   * browsers/OSes to switch the audio session into a voice/telephony
   * routing category, which commonly defaults output to a single earpiece
   * channel instead of full stereo - the root cause of "solo se oye por un
   * audífono al grabar". Sharing one stream fixes that at the source. */
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
/** How long the context stays up after the last sound before it is
 * suspended and the phone's audio handed back. */
const IDLE_RELEASE_MS = 2500;
const RECORDER_WORKLET_URL = "/worklets/recorder-processor.js";
const NOISE_GATE_WORKLET_URL = "/worklets/noise-gate-processor.js";
const PITCH_CORRECTION_WORKLET_URL = "/worklets/realtime-pitch-processor.js";

/** Faders, pans, mutes and sends: only when the target really changes
 * (every project change re-syncs every track), and with a 10 ms glide
 * instead of a jump - a fader dragged while the music plays used to step
 * ~60 times a second (zipper noise). The first write to a node lands at
 * once, so playback starts at the right level. */
const glideTargets = new WeakMap<AudioParam, number>();
function glide(param: AudioParam, value: number, ctx: BaseAudioContext): void {
  const last = glideTargets.get(param);
  if (last !== undefined && Math.abs(last - value) < 1e-7) return;
  glideTargets.set(param, value);
  if (last === undefined) {
    param.value = value;
    return;
  }
  param.cancelScheduledValues(ctx.currentTime);
  param.setTargetAtTime(value, ctx.currentTime, 0.01);
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private masterVolume: GainNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private loudnessAnalyser: AnalyserNode | null = null;
  private masterChain: EffectChain | null = null;
  private noiseGateWorkletPromise: Promise<void> | null = null;
  private noiseGateWorkletLoaded = false;
  private dynamicsWorkletPromise: Promise<void> | null = null;
  private dynamicsWorkletLoaded = false;
  /** Output protection: a transparent look-ahead limiter at -0.3 dBFS at
   * the very end of the master, so a hot mix never hard-clips the phone's
   * output (the hot phone takes + an EQ boost or makeup used to). */
  private outputGuard: DynamicsNode | null = null;

  private tracks = new Map<TrackId, TrackGraph>();
  private buses = new Map<BusId, BusGraph>();
  private soloedTracks = new Set<TrackId>();
  private soloedBuses = new Set<BusId>();
  private bufferCache = new Map<string, AudioBuffer>();

  private scheduled: ScheduledSource[] = [];
  private playing = false;
  private contextTimeAtPlay = 0;
  private playheadAtPlay = 0;
  private rafId: number | null = null;
  private listeners = new Set<TransportListener>();
  /** Zona 8 "bypass honesto" maintenance loop - keeps every live effect's
   * dry/wet loudness measurement (BypassWrapper) current independent of
   * the transport and of whether any effect panel is open, so a bypass
   * toggle's gain compensation is never catching up after the fact. See
   * startBypassMaintenanceLoop(). */
  private bypassTickRafId: number | null = null;

  private metronomeEnabled = false;
  private metronomeVolume = 1;
  private metronomeTimer: ReturnType<typeof setInterval> | null = null;
  private nextClickTime = 0;
  private nextClickBeat = 0;

  private recording: RecordingSession | null = null;
  private recorderWorkletLoaded = false;
  private countInCancelled = false;
  private countingIn = false;
  /** Mic opened ahead of a take (at the record tap, before the count-in). */
  private inputHeld = false;
  /** One-off sounds outside the transport (e.g. a preview player). */
  private audioHolds = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  private pitchCorrectionWorkletPromise: Promise<void> | null = null;
  private pitchCorrectionWorkletLoaded = false;
  private autoPitchWorkletPromise: Promise<void> | null = null;
  private autoPitchWorkletLoaded = false;
  /** Live pitch views open per track (see watchAutoPitch). */
  private pitchWatchers = new Map<TrackId, (p: PitchTelemetry) => void>();
  /** Last synced tracks, so AutoPitch stages can be built once their
   * worklet module finishes loading. */
  private lastSyncedTracks: Track[] = [];

  private monitor: MonitorSession | null = null;
  private monitorPending: Promise<StartRecordingResult> | null = null;
  private monitorConnected = new Set<TrackId>();
  private monitorConstraints: MonitorInputConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };
  /** null = let the browser pick the system default input. */
  private selectedInputDeviceId: string | null = null;
  /** Input trim in dB, applied to both the monitor path and the recording
   * path via each session's inputGain node. Persists across re-acquiring
   * the mic (device change, constraint change). */
  private inputGainDb = 0;
  /** null = system default output. Only meaningful where
   * isOutputDeviceSelectionSupported() is true. */
  private selectedOutputDeviceId: string | null = null;

  /** Must be called from a user-gesture handler (click) before any playback. */
  ensureContext(): AudioContext {
    if (!this.ctx) {
      // Reported real: monitoring/recording came out of one earbud only on
      // a real iPhone, correct pan or not. The mixer graph itself is fine
      // (native StereoPannerNode, verified) - this is a documented WebKit/
      // iOS quirk where, absent an explicit category, a page with both mic
      // input and audio output can get routed through the mono earpiece
      // instead of stereo. The Web Audio Session API (Safari 17+, silently
      // absent everywhere else) is the documented fix for exactly that:
      // declare this is a play-and-record app so iOS keeps stereo out.
      // ...but only while the mic is actually open (setAudioSessionType in
      // ensureMonitorStream / stopMonitorStream). Held permanently, it
      // made iOS treat the whole app as a call-style recorder: other apps'
      // audio (WhatsApp notes, YouTube) paused the instant it started.
      setAudioSessionType("playback");
      // Explicit per the FASE 9 addendum, even though "interactive" is
      // already the spec default - a recording/monitoring app should never
      // silently end up on "playback" latency (larger buffers, worse for
      // hearing yourself in time) if a browser's default ever changes.
      const ctx = new AudioContext({ latencyHint: "interactive" });
      // iOS Safari suspends an AudioContext on its own mid-session (a
      // notification, the screen locking, an interruption, or just its own
      // power heuristics) - confirmed from a real device recording: the
      // transport clock froze at 00:00.000 for the entire take while the
      // timeline ruler kept visibly advancing. `ctx.currentTime` stops
      // advancing while suspended (per spec), which freezes `getCurrentTime()`
      // silently - and worse, ALL audio processing for this context,
      // including the recorder worklet, stops too, so a real take can lose
      // audio during the stall, not just the on-screen clock. `ensureContext()`
      // only resumed a suspended context at acquisition time, never during an
      // already-running session - this catches it for as long as the context
      // exists, not just once at startup.
      // Only while the DAW is really playing/recording and on screen:
      // resuming unconditionally fought every other app for the phone's
      // audio (iOS interrupts us -> we resume -> their audio pauses),
      // in the background too.
      ctx.addEventListener("statechange", () => {
        if (ctx.state !== "running" && this.shouldKeepRunning()) void ctx.resume();
      });
      const master = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      const masterChain = new EffectChain(ctx, this.effectChainDeps());
      const masterVolume = ctx.createGain();
      master.connect(masterChain.inputNode);
      masterChain.outputNode.connect(masterVolume);
      masterVolume.connect(analyser);
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
      this.masterVolume = masterVolume;
      this.masterAnalyser = analyser;
      this.loudnessAnalyser = loudnessAnalyser;
      this.masterChain = masterChain;

      this.startBypassMaintenanceLoop();
      void this.ensureDynamicsWorklet().then(() => this.insertOutputGuard());

      if (this.selectedOutputDeviceId && this.isOutputDeviceSelectionSupported()) {
        void (ctx as unknown as { setSinkId(id: string): Promise<void> }).setSinkId(this.selectedOutputDeviceId);
      }
      // Created by a gesture it starts running; give the audio back if
      // nothing ends up playing.
      this.scheduleIdleRelease();
    }
    return this.ctx;
  }

  // ---------------------------------------------------------------------
  // Holding / releasing the phone's audio
  //
  // The context only runs while something is making or capturing sound
  // (transport, count-in, a take, a preview). Otherwise it is suspended
  // and the mic closed, so iOS gives the audio back to other apps.
  // ensureContext() never resumes on its own - building graphs, decoding
  // and loading worklets all work on a suspended context.
  // ---------------------------------------------------------------------

  /** The context, running. Call from whatever is about to make sound. */
  wake(): AudioContext {
    const ctx = this.ensureContext();
    this.cancelIdleRelease();
    if (ctx.state !== "running") void ctx.resume();
    return ctx;
  }

  /** Keeps the context running for a sound outside the transport (a
   * preview player); call the returned function when it ends. */
  holdAudio(): () => void {
    this.audioHolds++;
    this.wake();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.audioHolds = Math.max(0, this.audioHolds - 1);
      this.scheduleIdleRelease();
    };
  }

  private isBusy(): boolean {
    return this.playing || this.recording !== null || this.countingIn || this.inputHeld || this.audioHolds > 0;
  }

  private shouldKeepRunning(): boolean {
    return this.isBusy() && (typeof document === "undefined" || document.visibilityState === "visible");
  }

  private cancelIdleRelease(): void {
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  /** Suspends shortly after the last sound, so a reverb tail rings out
   * and stop -> play does not bounce the context. */
  private scheduleIdleRelease(): void {
    this.cancelIdleRelease();
    if (this.isBusy()) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (!this.isBusy()) this.releaseAudio();
    }, IDLE_RELEASE_MS);
  }

  /** Closes the mic and suspends the context now (a take in progress is
   * left alone). Called when idle and when the app goes to the background. */
  releaseAudio(): void {
    if (this.recording) return;
    this.cancelIdleRelease();
    this.inputHeld = false;
    this.stopMonitorStream();
    if (this.ctx && this.ctx.state === "running") void this.ctx.suspend();
  }

  /** Opens the mic at the record tap, so it is ready when the count-in
   * ends (and asked for inside the user gesture). */
  prepareInput(): void {
    this.inputHeld = true;
    this.wake();
    void this.ensureMonitorStream();
  }

  getContext(): AudioContext | null {
    return this.ctx;
  }

  /** Real measured round-trip latency, not a guess - `outputLatency` is the
   * actual current hardware+driver figure where the browser exposes it
   * (falls back to the nominal `baseLatency` where it doesn't, e.g.
   * Firefox). Null before the context exists (nothing to measure yet). Per
   * the FASE 9 addendum's "reportar la latencia real medida", not offered
   * as a fixed/assumed number. */
  getLatencySec(): number | null {
    if (!this.ctx) return null;
    return this.ctx.outputLatency || this.ctx.baseLatency || null;
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

  /** Final output trim, applied post insert-chain (right before the master
   * meter/destination) - same convention as a Pro Tools/FL master fader. */
  setMasterVolume(db: number): void {
    this.ensureContext();
    if (this.masterVolume) glide(this.masterVolume.gain, dbToGain(db), this.ctx!);
  }

  private effectChainDeps(): EffectChainDeps {
    return {
      isNoiseGateWorkletLoaded: () => this.noiseGateWorkletLoaded,
      ensureNoiseGateWorklet: () => this.ensureNoiseGateWorklet(),
      isPitchCorrectionWorkletLoaded: () => this.pitchCorrectionWorkletLoaded,
      ensurePitchCorrectionWorklet: () => this.ensurePitchCorrectionWorklet(),
      isAutoPitchWorkletLoaded: () => this.autoPitchWorkletLoaded,
      ensureAutoPitchWorklet: () => this.ensureAutoPitchWorklet(),
      isDynamicsWorkletLoaded: () => this.dynamicsWorkletLoaded,
      ensureDynamicsWorklet: () => this.ensureDynamicsWorklet(),
    };
  }

  private ensureDynamicsWorklet(): Promise<void> {
    if (this.dynamicsWorkletLoaded) return Promise.resolve();
    if (!this.dynamicsWorkletPromise) {
      const ctx = this.ensureContext();
      this.dynamicsWorkletPromise = ctx.audioWorklet.addModule(DYNAMICS_WORKLET_URL).then(() => {
        this.dynamicsWorkletLoaded = true;
      });
    }
    return this.dynamicsWorkletPromise;
  }

  /** masterVolume -> guard -> analyser (was masterVolume -> analyser). */
  private insertOutputGuard(): void {
    if (this.outputGuard || !this.ctx || !this.masterVolume || !this.masterAnalyser) return;
    const guard = createOutputGuard(this.ctx);
    this.masterVolume.disconnect(this.masterAnalyser);
    this.masterVolume.connect(guard.node);
    guard.node.connect(this.masterAnalyser);
    this.outputGuard = guard;
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

  private ensureAutoPitchWorklet(): Promise<void> {
    if (this.autoPitchWorkletLoaded) return Promise.resolve();
    if (!this.autoPitchWorkletPromise) {
      const ctx = this.ensureContext();
      this.autoPitchWorkletPromise = ctx.audioWorklet.addModule(AUTOPITCH_WORKLET_URL).then(() => {
        this.autoPitchWorkletLoaded = true;
        for (const track of this.lastSyncedTracks) {
          const graph = this.tracks.get(track.id);
          if (graph) this.syncAutoPitch(track, graph);
        }
      });
    }
    return this.autoPitchWorkletPromise;
  }

  /** Builds, updates or removes a track's AutoPitch stage. Only an ENABLED
   * AutoPitch costs a worklet; turning it off takes it out of the graph. */
  private syncAutoPitch(track: Track, graph: TrackGraph): void {
    const settings = track.autoPitch;
    const want = !!settings?.enabled;
    if (want && !this.autoPitchWorkletLoaded) {
      void this.ensureAutoPitchWorklet();
      return; // re-synced once the module is in
    }
    if (want && settings) {
      if (!graph.autoPitch) {
        const ctx = this.ensureContext();
        const stage = new AutoPitchEffect(ctx);
        stage.setSettings(settings);
        graph.input.disconnect();
        graph.input.connect(stage.input);
        stage.output.connect(graph.effectChain.inputNode);
        graph.autoPitch = stage;
        const watcher = this.pitchWatchers.get(track.id);
        if (watcher) stage.watchPitch(watcher);
      } else {
        graph.autoPitch.setSettings(settings);
      }
    } else if (graph.autoPitch) {
      graph.input.disconnect();
      graph.input.connect(graph.effectChain.inputNode);
      graph.autoPitch.dispose();
      graph.autoPitch = null;
    }
  }

  private ensurePitchCorrectionWorklet(): Promise<void> {
    if (this.pitchCorrectionWorkletLoaded) return Promise.resolve();
    if (!this.pitchCorrectionWorkletPromise) {
      const ctx = this.ensureContext();
      this.pitchCorrectionWorkletPromise = ctx.audioWorklet.addModule(PITCH_CORRECTION_WORKLET_URL).then(() => {
        this.pitchCorrectionWorkletLoaded = true;
      });
    }
    return this.pitchCorrectionWorkletPromise;
  }

  /** Reaches into a live track's or the master bus's insert chain to grab
   * one effect's real audio node by id - used by PitchCorrectionPanel to
   * read live detected/target pitch off the actual running worklet (there's
   * no other path from the declarative EffectInstance state back to the
   * live node). Returns `unknown` on purpose; EffectChain doesn't (and
   * shouldn't) know about specific effect subclasses - the caller casts. */
  getEffectNode(target: "master" | TrackId | BusId, effectId: string): unknown {
    const chain =
      target === "master" ? this.masterChain : (this.tracks.get(target)?.effectChain ?? this.buses.get(target)?.effectChain);
    return chain?.getEffect(effectId);
  }

  /** Real measured dB gap between one insert's processed and dry signal
   * right now (positive = processed is louder) - zona 8 "bypass honesto".
   * Undefined if the target/effect doesn't resolve to a live chain entry. */
  getEffectBypassDeltaDb(target: "master" | TrackId | BusId, effectId: string): number | undefined {
    const chain =
      target === "master" ? this.masterChain : (this.tracks.get(target)?.effectChain ?? this.buses.get(target)?.effectChain);
    return chain?.getBypassDeltaDb(effectId);
  }

  /** Runs for the lifetime of the AudioContext, independent of transport
   * play state and of whether any effect panel is mounted - every live
   * EffectChain's entries need their dry/wet loudness measured
   * continuously (BypassWrapper.tick) so a bypass toggle's gain
   * compensation is already correct the instant it fires, not computed
   * afterward. Cheap: a handful of Map iterations and small Float32Array
   * reads per frame, same order of cost as the existing per-panel meters. */
  private startBypassMaintenanceLoop(): void {
    if (this.bypassTickRafId !== null) return;
    const tick = () => {
      this.masterChain?.tick();
      for (const graph of this.tracks.values()) graph.effectChain.tick();
      for (const graph of this.buses.values()) graph.effectChain.tick();
      this.bypassTickRafId = requestAnimationFrame(tick);
    };
    this.bypassTickRafId = requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------------
  // Track graph
  // ---------------------------------------------------------------------

  /** `buses` is optional, not defaulted to `[]` - omitting it (a caller
   * that only cares about track state, e.g. pause()/stop() called without
   * it) leaves whatever bus graphs already exist untouched. Passing `[]`
   * explicitly is a real instruction ("there are now zero buses") and
   * would tear every existing bus graph down - the empty case must be
   * opted into, never a silent default. */
  syncTracks(tracks: Track[], buses?: Bus[]): void {
    const ctx = this.ensureContext();
    const master = this.master!;
    this.lastSyncedTracks = tracks;

    // Buses first - a track's sends (below) connect INTO a bus's input, so
    // the bus graphs must already exist before any track tries to tap one.
    if (buses) this.syncBusGraphs(buses);

    const liveIds = new Set(tracks.map((t) => t.id));

    for (const [id, graph] of this.tracks) {
      if (!liveIds.has(id)) {
        this.disconnectMonitorFromTrack(id);
        for (const sendGain of graph.sendGains.values()) sendGain.disconnect();
        graph.input.disconnect();
        graph.autoPitch?.dispose();
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
        graph = { input, effectChain, volume, pan, muteGain, analyser, sendGains: new Map(), autoPitch: null };
        this.tracks.set(track.id, graph);
      }
      this.syncAutoPitch(track, graph);
      graph.effectChain.setInserts(track.inserts);
      graph.effectChain.setBlend(track.fx?.blend ?? 1);
      glide(graph.volume.gain, dbToGain(track.volumeDb), this.ctx!);
      glide(graph.pan.pan, track.pan, this.ctx!);
      const audible = !track.muted && (this.soloedTracks.size === 0 || track.solo);
      glide(graph.muteGain.gain, audible ? 1 : 0, this.ctx!);

      this.syncTrackSends(track, graph);
    }

    this.refreshMonitoring(tracks);
  }

  /** Bus channels: no clips of their own, same strip shape as a
   * track otherwise (inserts, volume, pan, mute/solo, feeds master) -
   * tracks reach them only via Track.sends (see syncTrackSends). */
  private syncBusGraphs(buses: Bus[]): void {
    const ctx = this.ensureContext();
    const master = this.master!;
    const liveIds = new Set(buses.map((b) => b.id));

    for (const [id, graph] of this.buses) {
      if (!liveIds.has(id)) {
        graph.input.disconnect();
        graph.effectChain.dispose();
        this.buses.delete(id);
      }
    }

    // Solo among buses is isolated from track solo - soloing a bus
    // silences the other buses, not the tracks feeding them (soloing a
    // return to audit it shouldn't also cut every dry track going to
    // master, which would make it impossible to hear the bus in context).
    this.soloedBuses = new Set(buses.filter((b) => b.solo).map((b) => b.id));

    for (const bus of buses) {
      let graph = this.buses.get(bus.id);
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
        this.buses.set(bus.id, graph);
      }
      graph.effectChain.setInserts(bus.inserts);
      glide(graph.volume.gain, dbToGain(bus.volumeDb), this.ctx!);
      glide(graph.pan.pan, bus.pan, this.ctx!);
      const audible = !bus.muted && (this.soloedBuses.size === 0 || bus.solo);
      graph.muteGain.gain.value = audible ? 1 : 0;
    }
  }

  /** Creates/updates/tears down this track's send taps to match
   * `track.sends` exactly - tapped from `graph.analyser`, i.e. after this
   * channel's own volume/pan/mute, so a send always reflects what the
   * channel is actually contributing right now (see Send's own doc
   * comment on why post-fader is the right default). */
  private syncTrackSends(track: Track, graph: TrackGraph): void {
    const liveSendBusIds = new Set(track.sends.map((s) => s.busId));
    for (const [busId, gain] of graph.sendGains) {
      if (!liveSendBusIds.has(busId)) {
        gain.disconnect();
        graph.sendGains.delete(busId);
      }
    }
    for (const send of track.sends) {
      const busGraph = this.buses.get(send.busId);
      if (!busGraph) continue; // bus not synced yet - the next syncTracks() call (right after creating it) picks this up
      let sendGain = graph.sendGains.get(send.busId);
      if (!sendGain) {
        sendGain = this.ctx!.createGain();
        graph.analyser.connect(sendGain);
        sendGain.connect(busGraph.input);
        graph.sendGains.set(send.busId, sendGain);
      }
      glide(sendGain.gain, dbToGain(send.levelDb), this.ctx!);
    }
  }

  /** Live pitch of a track's AutoPitch while `cb` is subscribed (also once
   * the stage is built later, when it gets turned on). Returns the unsubscribe. */
  watchAutoPitch(trackId: TrackId, cb: (p: PitchTelemetry) => void): () => void {
    this.pitchWatchers.set(trackId, cb);
    this.tracks.get(trackId)?.autoPitch?.watchPitch(cb);
    return () => {
      if (this.pitchWatchers.get(trackId) !== cb) return;
      this.pitchWatchers.delete(trackId);
      this.tracks.get(trackId)?.autoPitch?.watchPitch(null);
    };
  }

  getTrackAnalyser(trackId: TrackId): AnalyserNode | null {
    return this.tracks.get(trackId)?.analyser ?? null;
  }

  getBusAnalyser(busId: BusId): AnalyserNode | null {
    return this.buses.get(busId)?.analyser ?? null;
  }

  // ---------------------------------------------------------------------
  // Input monitoring
  //
  // Lets an armed track's channel (with its own effect chain, volume, pan)
  // hear the live mic while you sing/play, per Track.monitorMode. Shares one
  // getUserMedia stream across every track that currently wants it - mic
  // hardware is one physical input, not one per track - and connects that
  // single source directly into each track's `graph.input`, the same entry
  // point clips use (see scheduleClips/scheduleClip), so
  // monitoring genuinely passes through whatever's in that track's insert
  // chain right now (autotune, reverb, ...), not a separate dry copy.
  // ---------------------------------------------------------------------

  getMonitorConstraints(): MonitorInputConstraints {
    return { ...this.monitorConstraints };
  }

  getSelectedInputDeviceId(): string | null {
    return this.selectedInputDeviceId;
  }

  /** Labels are only populated once mic permission has been granted at
   * least once in this origin - before that every label comes back "" and
   * the caller should fall back to a generic "Micrófono N". */
  async listInputDevices(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "audioinput");
  }

  /** Best-effort - see outputHeuristics.ts's doc comment for why this can't
   * be trusted on its own. */
  async listOutputDevices(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "audiooutput");
  }

  /** AudioContext.setSinkId() is real (spec-standardized, output-device
   * routing that actually moves audio to a chosen device) but not
   * universally implemented - Chrome/Edge support it, Safari/Firefox
   * don't as of this writing. Never fake a working picker where it isn't
   * there; callers must check this before offering the control. */
  isOutputDeviceSelectionSupported(): boolean {
    return typeof AudioContext !== "undefined" && "setSinkId" in AudioContext.prototype;
  }

  getSelectedOutputDeviceId(): string | null {
    return this.selectedOutputDeviceId;
  }

  /** Routes the whole engine's output (master bus, i.e. everything reaching
   * ctx.destination) to the given device. Requires ensureContext() to have
   * run at least once (a user gesture); no-ops with an explicit error on
   * browsers that don't implement setSinkId. */
  async setSelectedOutputDeviceId(deviceId: string | null): Promise<{ ok: boolean; error?: string }> {
    this.selectedOutputDeviceId = deviceId;
    if (!this.isOutputDeviceSelectionSupported()) {
      return { ok: false, error: "Este navegador no permite elegir el dispositivo de salida" };
    }
    const ctx = this.ctx;
    if (!ctx) return { ok: true }; // applied lazily once ensureContext() runs
    try {
      // setSinkId is standardized but still missing from the lib.dom.d.ts
      // AudioContext type in the TS version this project targets.
      await (ctx as unknown as { setSinkId(id: string): Promise<void> }).setSinkId(deviceId ?? "");
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "No se pudo cambiar el dispositivo de salida" };
    }
  }

  /** Re-acquires the mic with the new device if a monitor stream is
   * already open, same reconnect dance as setMonitorConstraints(). */
  async setSelectedInputDeviceId(deviceId: string | null): Promise<void> {
    this.selectedInputDeviceId = deviceId;
    if (!this.monitor) return;
    const reconnectIds = [...this.monitorConnected];
    this.stopMonitorStream();
    const result = await this.ensureMonitorStream();
    if (result.ok) {
      for (const id of reconnectIds) this.connectMonitorToTrack(id);
      this.retapRecordingSession();
    }
  }

  getMonitorAnalyser(): AnalyserNode | null {
    return this.monitor?.analyser ?? null;
  }

  isMonitorStreamActive(): boolean {
    return this.monitor !== null;
  }

  /** Echo-cancellation/noise-suppression/AGC default OFF (they audibly
   * degrade a music signal), but the addendum requires the user be able to
   * opt in for a noisy-room-without-headphones take. Re-acquires the mic
   * with the new constraints if a monitor stream is already open. */
  async setMonitorConstraints(next: Partial<MonitorInputConstraints>): Promise<void> {
    this.monitorConstraints = { ...this.monitorConstraints, ...next };
    if (!this.monitor) return;
    const reconnectIds = [...this.monitorConnected];
    this.stopMonitorStream();
    const result = await this.ensureMonitorStream();
    if (result.ok) {
      for (const id of reconnectIds) this.connectMonitorToTrack(id);
      this.retapRecordingSession();
    }
  }

  /** Re-attaches an in-progress recording's worklet/analyser to the current
   * monitor inputGain - needed after stopMonitorStream()/ensureMonitorStream()
   * swap in a new inputGain instance (device or constraint change), since a
   * recording session holds no stream of its own to fall back on (see
   * RecordingSession's doc comment). Without this, changing the input
   * device or mic constraints mid-recording would silently stop capturing
   * audio for the rest of the take. */
  private retapRecordingSession(): void {
    if (!this.recording || !this.monitor) return;
    this.monitor.inputGain.connect(this.recording.worklet);
    this.monitor.inputGain.connect(this.recording.analyser);
  }

  private async ensureMonitorStream(): Promise<StartRecordingResult> {
    if (this.monitor) return { ok: true };
    if (this.monitorPending) return this.monitorPending;
    if (!navigator.mediaDevices?.getUserMedia) {
      return { ok: false, error: "Microphone access is not available in this browser/context" };
    }
    const ctx = this.ensureContext();
    setAudioSessionType("play-and-record");
    this.monitorPending = (async (): Promise<StartRecordingResult> => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            ...this.monitorConstraints,
            channelCount: 1,
            ...(this.selectedInputDeviceId ? { deviceId: { exact: this.selectedInputDeviceId } } : {}),
          },
        });
        const source = ctx.createMediaStreamSource(stream);
        const inputGain = ctx.createGain();
        inputGain.gain.value = dbToGain(this.inputGainDb);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(inputGain);
        inputGain.connect(analyser);
        this.monitor = { stream, source, inputGain, analyser };
        return { ok: true };
      } catch (err) {
        setAudioSessionType("playback");
        return { ok: false, error: err instanceof Error ? err.message : "Microphone permission denied" };
      } finally {
        this.monitorPending = null;
      }
    })();
    return this.monitorPending;
  }

  private stopMonitorStream(): void {
    if (!this.monitor) return;
    const { stream, source, inputGain, analyser } = this.monitor;
    for (const id of this.monitorConnected) {
      const graph = this.tracks.get(id);
      if (graph) inputGain.disconnect(graph.input);
    }
    this.monitorConnected.clear();
    source.disconnect();
    inputGain.disconnect();
    analyser.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    this.monitor = null;
    setAudioSessionType("playback");
  }

  private connectMonitorToTrack(trackId: TrackId): void {
    const graph = this.tracks.get(trackId);
    if (!graph || !this.monitor || this.monitorConnected.has(trackId)) return;
    this.monitor.inputGain.connect(graph.input);
    this.monitorConnected.add(trackId);
  }

  private disconnectMonitorFromTrack(trackId: TrackId): void {
    if (!this.monitorConnected.has(trackId)) return;
    const graph = this.tracks.get(trackId);
    if (graph && this.monitor) this.monitor.inputGain.disconnect(graph.input);
    this.monitorConnected.delete(trackId);
  }

  /** Input trim (dB), applied live to whichever mic session(s) are
   * currently open - monitor and/or recording - so one control governs
   * both hearing yourself and what actually gets captured. */
  setInputGainDb(db: number): void {
    this.inputGainDb = db;
    const gain = dbToGain(db);
    // Recording no longer has its own inputGain - it taps the monitor's, so
    // this one assignment already covers both live monitoring and capture.
    if (this.monitor) this.monitor.inputGain.gain.value = gain;
  }

  getInputGainDb(): number {
    return this.inputGainDb;
  }

  private shouldMonitorTrack(track: Track): boolean {
    return isTrackMonitoredLive(track.armed, track.monitorMode, this.playing, this.isRecording());
  }

  private refreshMonitoring(tracks: Track[]): void {
    const wantIds = new Set(tracks.filter((t) => this.shouldMonitorTrack(t)).map((t) => t.id));

    for (const id of [...this.monitorConnected]) {
      if (!wantIds.has(id)) this.disconnectMonitorFromTrack(id);
    }

    if (wantIds.size === 0) {
      if (this.monitor && this.monitorConnected.size === 0 && !this.recording && !this.inputHeld) this.stopMonitorStream();
      return;
    }

    void this.ensureMonitorStream().then((result) => {
      if (!result.ok) return;
      for (const id of wantIds) this.connectMonitorToTrack(id);
    });
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

  play(tracks: Track[], fromTime: number, loop: LoopRegion, bpm: number, buses: Bus[] = []): void {
    const ctx = this.wake();
    this.stopSources();

    // `playing` must already be true before syncTracks() below - it calls
    // refreshMonitoring(), which reads `this.playing` to decide whether an
    // "auto"-mode armed track should hear its own mic right now. Setting it
    // after syncTracks() (the previous order) made refreshMonitoring think
    // playback hadn't started yet, so "auto" mode - documented as "monitor
    // while stopped or recording, not during plain playback" - kept the raw
    // mic routed to the output for the rest of the playback pass instead.
    this.playheadAtPlay = fromTime;
    this.contextTimeAtPlay = ctx.currentTime;
    this.playing = true;
    this.syncTracks(tracks, buses);

    this.scheduleClips(tracks, fromTime, ctx.currentTime);
    this.scheduleAutomation(tracks, fromTime, ctx.currentTime);

    if (this.metronomeEnabled) {
      this.startMetronome(fromTime, bpm);
    }

    this.startClock(tracks, loop, bpm);
  }

  /** `tracks`, when given, re-syncs volume/pan/etc. back to their static
   * values - otherwise an automated fader/pan stays wherever the last
   * ramp left it instead of returning to the track's base value. */
  pause(tracks?: Track[], buses?: Bus[]): void {
    if (!this.playing) return;
    this.playheadAtPlay = this.getCurrentTime();
    this.playing = false;
    this.stopSources();
    this.stopMetronome();
    this.stopClock();
    if (tracks) this.syncTracks(tracks, buses);
    this.scheduleIdleRelease();
  }

  stop(tracks?: Track[], buses?: Bus[]): void {
    this.playing = false;
    this.playheadAtPlay = 0;
    this.stopSources();
    this.stopMetronome();
    this.stopClock();
    if (tracks) this.syncTracks(tracks, buses);
    this.emitTime();
    this.scheduleIdleRelease();
  }

  seek(time: number, tracks: Track[], loop: LoopRegion, bpm: number): void {
    const wasPlaying = this.playing;
    this.stopSources();
    this.stopMetronome();
    this.playheadAtPlay = Math.max(0, time);
    if (wasPlaying && this.ctx) {
      this.contextTimeAtPlay = this.ctx.currentTime;
      this.scheduleClips(tracks, this.playheadAtPlay, this.ctx.currentTime);
      this.scheduleAutomation(tracks, this.playheadAtPlay, this.ctx.currentTime);
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
      // AutoPitch delays its track by a fixed few ms; starting that track's
      // clips the same amount early keeps the tuned voice on the beat.
      const latency = (graph.autoPitch?.latencySec ?? 0) + graph.effectChain.getLatencySec();
      for (const clip of track.clips) {
        this.scheduleClip(clip, graph, fromTime + latency, ctxStartTime);
      }
    }
  }

  /** Schedules volume/pan automation curves onto their real AudioParams for
   * every track, anchored at (fromTime -> ctxStartTime) exactly like clip
   * playback - re-called on every play/seek so a loop or scrub re-anchors
   * the curve instead of replaying it from wherever it was left. */
  private scheduleAutomation(tracks: Track[], fromTime: number, ctxStartTime: number): void {
    for (const track of tracks) {
      const graph = this.tracks.get(track.id);
      if (!graph) continue;
      scheduleParamAutomation(track.automation.volume, graph.volume.gain, fromTime, ctxStartTime, dbToGain);
      scheduleParamAutomation(track.automation.pan, graph.pan.pan, fromTime, ctxStartTime, (v) => v);
    }
  }

  /** Public re-anchor of the automation ramp, called by the store's
   * write/touch/latch recorder after it writes a new point mid-playback -
   * without this, a curve edited live would only sound correct starting
   * from the *next* play()/seek(), not during the pass where it was just
   * recorded. No-op while stopped (nothing scheduled to re-anchor). */
  rescheduleAutomation(tracks: Track[], fromTime: number): void {
    if (!this.ctx || !this.playing) return;
    this.scheduleAutomation(tracks, fromTime, this.ctx.currentTime);
  }

  private scheduleClip(
    clip: AudioClip,
    graph: TrackGraph,
    fromTime: number,
    ctxStartTime: number
  ): void {
    if (clip.muted) return; // an inactive take in a comp group - see PROGRESS.md "comping"
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
    const loopLength = clip.loopLengthSec;
    const sourceOffset = loopLength
      ? clip.sourceOffset + (offsetIntoClip % loopLength)
      : clip.sourceOffset + offsetIntoClip;
    const playDuration = clip.duration - offsetIntoClip;
    if (playDuration <= 0) return;
    if (loopLength) {
      source.loop = true;
      source.loopStart = clip.sourceOffset;
      source.loopEnd = clip.sourceOffset + loopLength;
    }

    this.applyFades(envelope.gain, clip, when, startsInFuture ? 0 : offsetIntoClip);

    source.start(when, sourceOffset, playDuration);
    this.scheduled.push({ source, clipId: clip.id });
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
      // Redundant with the "statechange" listener in ensureContext() - a
      // second, cheap check every frame in case that event doesn't fire for
      // every transition on some WebKit versions (a known class of gap, not
      // a hypothetical one). Catching this here, not just on statechange,
      // is what actually bounds how long a real take can silently lose
      // audio to a stalled context.
      if (this.ctx && this.ctx.state !== "running" && this.shouldKeepRunning()) void this.ctx.resume();
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

  setMetronomeVolume(volume: number): void {
    this.metronomeVolume = Math.min(1, Math.max(0, volume));
  }

  private playClick(time: number, accent: boolean): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = accent ? 1500 : 1000;
    if (this.metronomeVolume <= 0.001) return;
    gain.gain.setValueAtTime((accent ? 0.35 : 0.2) * this.metronomeVolume, time);
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

  /**
   * Plays an audible count-in (click per beat, accented on the first) and
   * resolves one beat after the last click - i.e. exactly when the
   * recording should start. `onBeat` fires as each beat begins, with the
   * number of beats remaining including the current one (4,3,2,1), so the
   * caller can show it. Returns `false` if cancelCountIn() was called
   * before it finished - the caller must not start recording in that case.
   * The already-scheduled clicks themselves aren't recalled (each is only
   * ~60ms, not worth the extra bookkeeping to yank mid-flight), just the
   * caller-visible wait/outcome.
   */
  async playCountIn(bpm: number, beats: number, onBeat?: (remaining: number) => void): Promise<boolean> {
    this.countInCancelled = false;
    this.countingIn = true;
    try {
      const ctx = this.wake();
      const secPerBeat = 60 / bpm;
      const leadInSec = 0.05;
      for (let i = 0; i < beats; i++) {
        this.playClick(ctx.currentTime + leadInSec + i * secPerBeat, i === 0);
      }
      for (let i = 0; i < beats; i++) {
        if (this.countInCancelled) return false;
        onBeat?.(beats - i);
        await new Promise<void>((resolve) => setTimeout(resolve, secPerBeat * 1000));
      }
      return !this.countInCancelled;
    } finally {
      this.countingIn = false;
      if (this.countInCancelled) this.inputHeld = false;
      this.scheduleIdleRelease();
    }
  }

  /** Aborts an in-progress playCountIn() - it returns false on its next
   * check instead of completing normally. */
  cancelCountIn(): void {
    this.countInCancelled = true;
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
    fromTime: number,
    buses?: Bus[]
  ): Promise<StartRecordingResult> {
    if (this.recording) return { ok: false, error: "Already recording" };

    const ctx = this.wake();

    // Reuses the one shared mic stream (see MonitorSession) instead of
    // opening a second, independent getUserMedia() - see RecordingSession's
    // doc comment for why a second concurrent stream is a real bug, not
    // just wasteful. This also means recording now honors whatever
    // monitorConstraints are actually set, instead of silently hardcoding
    // its own copy that could drift from what you're hearing.
    const monitorResult = await this.ensureMonitorStream();
    this.inputHeld = false;
    if (!monitorResult.ok) {
      this.scheduleIdleRelease();
      return monitorResult;
    }
    const inputGain = this.monitor!.inputGain;

    if (!this.recorderWorkletLoaded) {
      await ctx.audioWorklet.addModule(RECORDER_WORKLET_URL);
      this.recorderWorkletLoaded = true;
    }

    const worklet = new AudioWorkletNode(ctx, "recorder-processor");
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    const silentSink = ctx.createGain();
    silentSink.gain.value = 0;

    inputGain.connect(worklet);
    inputGain.connect(analyser);
    worklet.connect(silentSink);
    analyser.connect(silentSink);
    silentSink.connect(ctx.destination);

    const chunks: Float32Array[][] = [];
    worklet.port.onmessage = (event: MessageEvent<Float32Array[]>) => {
      for (let ch = 0; ch < event.data.length; ch++) {
        (chunks[ch] ??= []).push(event.data[ch]);
      }
    };

    this.recording = { worklet, analyser, silentSink, chunks, startTime: fromTime };

    // Play existing material under the take, same machinery as play().
    this.stopSources();
    this.syncTracks(tracks, buses);
    this.playheadAtPlay = fromTime;
    this.contextTimeAtPlay = ctx.currentTime;
    this.playing = true;
    this.scheduleClips(tracks, fromTime, ctx.currentTime);
    this.scheduleAutomation(tracks, fromTime, ctx.currentTime);
    if (this.metronomeEnabled) this.startMetronome(fromTime, bpm);
    this.startClock(tracks, loop, bpm);

    return { ok: true };
  }

  /** Stops capture + playback and returns the encoded take, or null if nothing was recording. */
  stopRecording(): RecordingResult | null {
    if (!this.recording || !this.ctx) return null;
    const { worklet, analyser, silentSink, chunks, startTime } = this.recording;

    worklet.port.onmessage = null;
    // Only detach this session's own taps - the shared monitor stream and
    // its inputGain stay alive/connected for as long as an armed track
    // still wants to hear it, governed entirely by ensureMonitorStream()/
    // stopMonitorStream(), not by recording start/stop.
    this.monitor?.inputGain.disconnect(worklet);
    this.monitor?.inputGain.disconnect(analyser);
    worklet.disconnect();
    analyser.disconnect();
    silentSink.disconnect();
    this.recording = null;

    this.playheadAtPlay = this.getCurrentTime();
    this.playing = false;
    this.stopSources();
    this.stopMetronome();
    this.stopClock();
    this.emitTime();
    // The mic is only for takes: close it now, not when the track is disarmed.
    this.refreshMonitoring(this.lastSyncedTracks);
    this.scheduleIdleRelease();

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
    const { worklet, analyser, silentSink } = this.recording;
    worklet.port.onmessage = null;
    this.monitor?.inputGain.disconnect(worklet);
    this.monitor?.inputGain.disconnect(analyser);
    worklet.disconnect();
    analyser.disconnect();
    silentSink.disconnect();
    this.recording = null;
    this.stop();
    this.refreshMonitoring(this.lastSyncedTracks);
  }

  /** Abandons a mic opened by prepareInput() for a take that never started. */
  releaseInput(): void {
    if (!this.inputHeld) return;
    this.inputHeld = false;
    this.refreshMonitoring(this.lastSyncedTracks);
    this.scheduleIdleRelease();
  }
}

/** iOS audio category (Web Audio Session API, Safari 16.4+; absent
 * elsewhere): "play-and-record" only while the mic is open, "playback"
 * otherwise. */
function setAudioSessionType(type: "playback" | "play-and-record"): void {
  if (typeof navigator === "undefined" || !("audioSession" in navigator)) return;
  try {
    (navigator as unknown as { audioSession: { type: string } }).audioSession.type = type;
  } catch {
    // value not supported on this OS version - keep the current one
  }
}

let singleton: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
  if (!singleton) singleton = new AudioEngine();
  return singleton;
}
