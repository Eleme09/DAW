import type { Effect } from "./Effect";
import { BypassWrapper } from "./BypassWrapper";
import { EqEffect } from "./EqEffect";
import { CompressorEffect } from "./CompressorEffect";
import { DeEsserEffect } from "./DeEsserEffect";
import { SaturationEffect } from "./SaturationEffect";
import { LimiterEffect } from "./LimiterEffect";
import { ClipperEffect } from "./ClipperEffect";
import { ReverbEffect } from "./ReverbEffect";
import { DelayEffect } from "./DelayEffect";
import { NoiseGateEffect } from "./NoiseGateEffect";
import { MultibandCompressorEffect } from "./MultibandCompressorEffect";
import { ChorusEffect } from "./ChorusEffect";
import { FlangerEffect } from "./FlangerEffect";
import { ExciterEffect } from "./ExciterEffect";
import { AutoPanEffect } from "./AutoPanEffect";
import { StereoWidthEffect } from "./StereoWidthEffect";
import { PitchCorrectionEffect } from "./PitchCorrectionEffect";
import { VocoderEffect } from "./VocoderEffect";
import type { EffectInstance, EffectType } from "@/types/effects";
import { limiterLatencySec } from "./dynamics";
import { PitchShiftEffect } from "./PitchShiftEffect";

export interface EffectChainDeps {
  isNoiseGateWorkletLoaded: () => boolean;
  ensureNoiseGateWorklet: () => Promise<void>;
  isPitchCorrectionWorkletLoaded: () => boolean;
  ensurePitchCorrectionWorklet: () => Promise<void>;
  /** The AutoPitch module, which the pitch shifter runs on. */
  isAutoPitchWorkletLoaded: () => boolean;
  ensureAutoPitchWorklet: () => Promise<void>;
  /** Our compressor/limiter (Gravedad, Estratos, Horizonte, Sibila). */
  isDynamicsWorkletLoaded: () => boolean;
  ensureDynamicsWorklet: () => Promise<void>;
}

/** Effect types backed by an AudioWorklet, which must finish loading its
 * module before the real node can be constructed - see `instantiate()`'s
 * placeholder-while-loading branch below. */
const WORKLET_BACKED_TYPES: Partial<Record<EffectType, { isLoaded: (deps: EffectChainDeps) => boolean; ensure: (deps: EffectChainDeps) => Promise<void> }>> = {
  noiseGate: { isLoaded: (d) => d.isNoiseGateWorkletLoaded(), ensure: (d) => d.ensureNoiseGateWorklet() },
  pitchCorrection: { isLoaded: (d) => d.isPitchCorrectionWorkletLoaded(), ensure: (d) => d.ensurePitchCorrectionWorklet() },
  pitchShift: { isLoaded: (d) => d.isAutoPitchWorkletLoaded(), ensure: (d) => d.ensureAutoPitchWorklet() },
  compressor: { isLoaded: (d) => d.isDynamicsWorkletLoaded(), ensure: (d) => d.ensureDynamicsWorklet() },
  multibandCompressor: { isLoaded: (d) => d.isDynamicsWorkletLoaded(), ensure: (d) => d.ensureDynamicsWorklet() },
  limiter: { isLoaded: (d) => d.isDynamicsWorkletLoaded(), ensure: (d) => d.ensureDynamicsWorklet() },
  deesser: { isLoaded: (d) => d.isDynamicsWorkletLoaded(), ensure: (d) => d.ensureDynamicsWorklet() },
};

/** Effects that work as a SEND inside the chain, like BandLab's reverb and
 * delay sends: the voice goes on through the chain untouched (full level, no
 * "mix" taking the dry down) and a tap of it - from the point where the
 * effect sits - feeds the effect; what comes out (only the tail / echoes,
 * its Mix being the send level) is added after the chain's last effect, so
 * the limiter and compressors don't pump it and the dry voice is not
 * smeared. Everything that changes the voice itself stays in series. */
const SEND_TYPES: ReadonlySet<EffectType> = new Set<EffectType>(["reverb", "delay"]);

/** No-op passthrough, used as a placeholder while the noise-gate worklet loads. */
class PassthroughEffect implements Effect<unknown> {
  private gain: GainNode;
  constructor(ctx: BaseAudioContext) {
    this.gain = ctx.createGain();
  }
  get inputNode(): AudioNode {
    return this.gain;
  }
  get outputNode(): AudioNode {
    return this.gain;
  }
  setParams(): void {}
  dispose(): void {
    this.gain.disconnect();
  }
}

function createEffectNode(ctx: BaseAudioContext, type: EffectType): Effect<unknown> {
  switch (type) {
    case "eq":
      return new EqEffect(ctx) as unknown as Effect<unknown>;
    case "compressor":
      return new CompressorEffect(ctx) as unknown as Effect<unknown>;
    case "deesser":
      return new DeEsserEffect(ctx) as unknown as Effect<unknown>;
    case "saturation":
      return new SaturationEffect(ctx) as unknown as Effect<unknown>;
    case "limiter":
      return new LimiterEffect(ctx) as unknown as Effect<unknown>;
    case "clipper":
      return new ClipperEffect(ctx) as unknown as Effect<unknown>;
    case "reverb":
      return new ReverbEffect(ctx) as unknown as Effect<unknown>;
    case "delay":
      return new DelayEffect(ctx) as unknown as Effect<unknown>;
    case "noiseGate":
      return new NoiseGateEffect(ctx) as unknown as Effect<unknown>;
    case "multibandCompressor":
      return new MultibandCompressorEffect(ctx) as unknown as Effect<unknown>;
    case "chorus":
      return new ChorusEffect(ctx) as unknown as Effect<unknown>;
    case "flanger":
      return new FlangerEffect(ctx) as unknown as Effect<unknown>;
    case "exciter":
      return new ExciterEffect(ctx) as unknown as Effect<unknown>;
    case "autoPan":
      return new AutoPanEffect(ctx) as unknown as Effect<unknown>;
    case "stereoWidth":
      return new StereoWidthEffect(ctx) as unknown as Effect<unknown>;
    case "pitchCorrection":
      return new PitchCorrectionEffect(ctx) as unknown as Effect<unknown>;
    case "vocoder":
      return new VocoderEffect(ctx) as unknown as Effect<unknown>;
    case "pitchShift":
      return new PitchShiftEffect(ctx) as unknown as Effect<unknown>;
  }
}

/** Effects built on DynamicsCompressorNode, whose fixed look-ahead delays
 * the signal (see latency.ts). The chain's dry path for Blend is delayed by
 * the same amount, or mixing it back in would comb-filter the voice. */
const REWIRE_FADE_SEC = 0.012;

/** Delay one live, un-bypassed effect adds to the signal (the compressors
 * have no look-ahead; the limiter's is its own). */
function effectLatencySec(type: EffectType, sampleRate: number): number {
  if (type === "pitchShift") return PitchShiftEffect.latencySec(sampleRate);
  if (type === "limiter") return limiterLatencySec(sampleRate);
  return 0;
}

interface ChainEntry {
  instance: Effect<unknown>;
  type: EffectType;
  wrapper: BypassWrapper;
}

/**
 * Rebuilds a track's (or the master bus's) insert chain from declarative
 * EffectInstance[] state. Cheap parameter tweaks never reconnect the graph;
 * add/remove/reorder/bypass does. See AUDIO_ENGINE.md "Effect chain".
 */
export class EffectChain {
  private ctx: BaseAudioContext;
  private deps: EffectChainDeps;
  private input: GainNode;
  private output: GainNode;
  /** Blend (BandLab's per-chain dry/wet): the processed chain ends in
   * `wet`, the untouched input reaches the output through `dryDelay` +
   * `dry`, latency-matched to the chain. */
  private wet: GainNode;
  private dry: GainNode;
  private dryDelay: DelayNode;
  private blend = 1;
  private effects = new Map<string, ChainEntry>();
  private lastInserts: EffectInstance[] = [];

  constructor(ctx: BaseAudioContext, deps: EffectChainDeps) {
    this.ctx = ctx;
    this.deps = deps;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.wet = ctx.createGain();
    this.dry = ctx.createGain();
    this.dry.gain.value = 0;
    this.dryDelay = ctx.createDelay(0.2);
    this.wet.connect(this.output);
    this.dryDelay.connect(this.dry);
    this.dry.connect(this.output);
    this.input.connect(this.wet);
    this.input.connect(this.dryDelay);
  }

  /** 0 = dry voice only, 1 = the full chain (default). */
  setBlend(blend: number): void {
    const b = Math.min(1, Math.max(0, Number.isFinite(blend) ? blend : 1));
    this.blend = b;
    const t = this.ctx.currentTime;
    this.wet.gain.setTargetAtTime(b, t, 0.01);
    this.dry.gain.setTargetAtTime(1 - b, t, 0.01);
  }

  getBlend(): number {
    return this.blend;
  }

  get inputNode(): AudioNode {
    return this.input;
  }
  get outputNode(): AudioNode {
    return this.output;
  }

  /** What the last setInserts() applied, so a knob move only touches the
   * one effect that changed. Rewiring the whole chain (disconnect + connect
   * every node) on each call - ~60 times a second while a knob turns, for
   * every track, since a project change re-syncs them all - cut and
   * crackled the audio. */
  private appliedParams = new Map<string, unknown>();
  private appliedBypass = new Map<string, boolean>();
  private wiredKey = "";

  setInserts(inserts: EffectInstance[]): void {
    this.lastInserts = inserts;

    const nextIds = new Set(inserts.map((i) => i.id));
    for (const [id, entry] of this.effects) {
      if (!nextIds.has(id)) {
        entry.instance.dispose();
        this.effects.delete(id);
        this.appliedParams.delete(id);
        this.appliedBypass.delete(id);
      }
    }

    for (const ins of inserts) {
      if (!this.effects.has(ins.id)) this.instantiate(ins);
    }

    for (const ins of inserts) {
      const entry = this.effects.get(ins.id);
      if (!entry) continue;
      if (this.appliedParams.get(ins.id) !== ins.params) {
        entry.instance.setParams(ins.params);
        this.appliedParams.set(ins.id, ins.params);
      }
      if (this.appliedBypass.get(ins.id) !== ins.bypassed) {
        entry.wrapper.setBypassed(ins.bypassed, this.ctx);
        this.appliedBypass.set(ins.id, ins.bypassed);
      }
    }

    // only when the order or the set of live nodes changed
    const key = inserts.map((i) => (this.effects.has(i.id) ? i.id : "")).join("|");
    if (key !== this.wiredKey) {
      this.rewireSmoothly();
    } else if (!this.rewirePending) {
      this.updateDryLatency(inserts);
    }
  }

  private rewirePending = false;

  /** Adding, removing or moving an effect while the music plays used to
   * re-plug the chain mid-waveform: a click, and a fresh compressor let
   * the first peak through at full makeup. Now the chain's output dips for
   * 20 ms around the re-plug. Offline (export) it re-plugs at once. */
  private rewireSmoothly(): void {
    const live = typeof AudioContext !== "undefined" && this.ctx instanceof AudioContext && this.ctx.state === "running";
    if (!live) {
      this.rewire(this.lastInserts);
      this.wiredKey = this.lastInserts.map((i) => (this.effects.has(i.id) ? i.id : "")).join("|");
      return;
    }
    if (this.rewirePending) return; // the pending one uses the latest inserts
    this.rewirePending = true;
    const t = this.ctx.currentTime;
    this.output.gain.cancelScheduledValues(t);
    this.output.gain.setValueAtTime(this.output.gain.value, t);
    this.output.gain.linearRampToValueAtTime(0, t + REWIRE_FADE_SEC);
    setTimeout(() => {
      this.rewirePending = false;
      if (this.disposed) return;
      this.rewire(this.lastInserts);
      this.wiredKey = this.lastInserts.map((i) => (this.effects.has(i.id) ? i.id : "")).join("|");
      const now = this.ctx.currentTime;
      this.output.gain.cancelScheduledValues(now);
      this.output.gain.setValueAtTime(0, now);
      this.output.gain.linearRampToValueAtTime(1, now + REWIRE_FADE_SEC);
    }, REWIRE_FADE_SEC * 1000 + 10);
  }

  private instantiate(ins: EffectInstance): void {
    const worklet = WORKLET_BACKED_TYPES[ins.type];
    if (worklet && !worklet.isLoaded(this.deps)) {
      const placeholder = new PassthroughEffect(this.ctx);
      const wrapper = new BypassWrapper(this.ctx, placeholder.inputNode, placeholder.outputNode);
      this.effects.set(ins.id, { instance: placeholder, type: ins.type, wrapper });
      worklet.ensure(this.deps).then(() => {
        if (!this.effects.has(ins.id)) return; // removed while loading
        placeholder.dispose();
        this.effects.get(ins.id)?.wrapper.dispose();
        const real = createEffectNode(this.ctx, ins.type);
        const realWrapper = new BypassWrapper(this.ctx, real.inputNode, real.outputNode);
        this.effects.set(ins.id, { instance: real, type: ins.type, wrapper: realWrapper });
        const current = this.lastInserts.find((i) => i.id === ins.id);
        if (current) {
          real.setParams(current.params);
          realWrapper.setBypassed(current.bypassed, this.ctx);
          this.appliedParams.set(ins.id, current.params);
          this.appliedBypass.set(ins.id, current.bypassed);
        }
        this.rewireSmoothly();
      });
      return;
    }
    const instance = createEffectNode(this.ctx, ins.type);
    const send = SEND_TYPES.has(ins.type);
    if (send) (instance as unknown as { setSendMode(on: boolean): void }).setSendMode(true);
    const wrapper = new BypassWrapper(this.ctx, instance.inputNode, instance.outputNode, send);
    wrapper.setBypassed(ins.bypassed, this.ctx);
    this.effects.set(ins.id, { instance, type: ins.type, wrapper });
  }

  /** Every entry is always wired into the series chain now - bypass (zona
   * 8, "bypass honesto") is a gain crossfade inside each entry's own
   * `BypassWrapper`, not a graph-topology change, so toggling it no longer
   * needs a reconnect (and the dry path stays available to measure even
   * while the effect is inaudible - see BypassWrapper's doc comment). */
  private rewire(inserts: EffectInstance[]): void {
    this.input.disconnect();
    for (const [, entry] of this.effects) entry.wrapper.outputNode.disconnect();

    let node: AudioNode = this.input;
    let latency = 0;
    for (const ins of inserts) {
      const entry = this.effects.get(ins.id);
      if (!entry) continue; // still pending (e.g. worklet loading)
      if (SEND_TYPES.has(ins.type)) {
        // a tap of the voice at this point; its return joins at the end
        node.connect(entry.wrapper.inputNode);
        entry.wrapper.outputNode.connect(this.wet);
        continue;
      }
      node.connect(entry.wrapper.inputNode);
      node = entry.wrapper.outputNode;
      if (!ins.bypassed) latency += effectLatencySec(ins.type, this.ctx.sampleRate);
    }
    node.connect(this.wet);
    this.input.connect(this.dryDelay);
    this.dryDelay.delayTime.value = Math.min(0.2, latency);
  }

  /** How late the chain's output is vs its input right now (live,
   * un-bypassed effects) - playback starts the track's clips this much
   * earlier so a delayed effect (the pitch shifter: ~38 ms) stays on the beat. */
  getLatencySec(): number {
    let latency = 0;
    for (const ins of this.lastInserts) {
      const entry = this.effects.get(ins.id);
      if (entry && !ins.bypassed && entry.type === ins.type && !(entry.instance instanceof PassthroughEffect)) latency += effectLatencySec(ins.type, this.ctx.sampleRate);
    }
    return Math.min(0.2, latency);
  }

  /** Blend's dry path delay follows which latent effects are on (bypass
   * changes it) without touching the wiring. */
  private updateDryLatency(inserts: EffectInstance[]): void {
    let latency = 0;
    for (const ins of inserts) {
      if (this.effects.has(ins.id) && !ins.bypassed) latency += effectLatencySec(ins.type, this.ctx.sampleRate);
    }
    const next = Math.min(0.2, latency);
    if (Math.abs(this.dryDelay.delayTime.value - next) > 1e-9) this.dryDelay.delayTime.setTargetAtTime(next, this.ctx.currentTime, 0.01);
  }

  /** Called continuously by AudioEngine's own maintenance loop (not tied to
   * any UI panel being open) so every entry's dry/wet loudness measurement
   * - and therefore its bypass compensation gain - is always current. */
  tick(): void {
    for (const [, entry] of this.effects) entry.wrapper.tick(this.ctx);
  }

  /** The live audio-node instance behind one insert, if it exists and has
   * finished loading (a worklet-backed effect is a passthrough placeholder
   * until then) - see AudioEngine.getEffectNode. */
  getEffect(id: string): Effect<unknown> | undefined {
    return this.effects.get(id)?.instance;
  }

  /** Real measured dB gap between this insert's processed and dry signal
   * right now (positive = processed is louder) - zona 8's "bypass
   * honesto" means this is shown to the user, not only silently
   * compensated for. Undefined while the entry doesn't exist yet (e.g. a
   * worklet still loading). */
  getBypassDeltaDb(id: string): number | undefined {
    return this.effects.get(id)?.wrapper.getMeasuredDeltaDb();
  }

  private disposed = false;

  dispose(): void {
    this.disposed = true;
    for (const [, entry] of this.effects) {
      entry.instance.dispose();
      entry.wrapper.dispose();
    }
    this.effects.clear();
    this.input.disconnect();
    this.wet.disconnect();
    this.dry.disconnect();
    this.dryDelay.disconnect();
    this.output.disconnect();
  }
}
