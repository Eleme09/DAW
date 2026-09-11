import type { Effect } from "./Effect";
import { EqEffect } from "./EqEffect";
import { CompressorEffect } from "./CompressorEffect";
import { DeEsserEffect } from "./DeEsserEffect";
import { SaturationEffect } from "./SaturationEffect";
import { LimiterEffect } from "./LimiterEffect";
import { ClipperEffect } from "./ClipperEffect";
import { ReverbEffect } from "./ReverbEffect";
import { DelayEffect } from "./DelayEffect";
import { NoiseGateEffect } from "./NoiseGateEffect";
import type { EffectInstance, EffectType } from "@/types/effects";

export interface EffectChainDeps {
  isNoiseGateWorkletLoaded: () => boolean;
  ensureNoiseGateWorklet: () => Promise<void>;
}

/** No-op passthrough, used as a placeholder while the noise-gate worklet loads. */
class PassthroughEffect implements Effect<unknown> {
  private gain: GainNode;
  constructor(ctx: AudioContext) {
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

function createEffectNode(ctx: AudioContext, type: EffectType): Effect<unknown> {
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
  }
}

interface ChainEntry {
  instance: Effect<unknown>;
  type: EffectType;
}

/**
 * Rebuilds a track's (or the master bus's) insert chain from declarative
 * EffectInstance[] state. Cheap parameter tweaks never reconnect the graph;
 * add/remove/reorder/bypass does. See AUDIO_ENGINE.md "Effect chain".
 */
export class EffectChain {
  private ctx: AudioContext;
  private deps: EffectChainDeps;
  private input: GainNode;
  private output: GainNode;
  private effects = new Map<string, ChainEntry>();
  private lastInserts: EffectInstance[] = [];

  constructor(ctx: AudioContext, deps: EffectChainDeps) {
    this.ctx = ctx;
    this.deps = deps;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.input.connect(this.output);
  }

  get inputNode(): AudioNode {
    return this.input;
  }
  get outputNode(): AudioNode {
    return this.output;
  }

  setInserts(inserts: EffectInstance[]): void {
    this.lastInserts = inserts;

    const nextIds = new Set(inserts.map((i) => i.id));
    for (const [id, entry] of this.effects) {
      if (!nextIds.has(id)) {
        entry.instance.dispose();
        this.effects.delete(id);
      }
    }

    for (const ins of inserts) {
      if (!this.effects.has(ins.id)) this.instantiate(ins);
    }

    for (const ins of inserts) {
      this.effects.get(ins.id)?.instance.setParams(ins.params);
    }

    this.rewire(inserts);
  }

  private instantiate(ins: EffectInstance): void {
    if (ins.type === "noiseGate" && !this.deps.isNoiseGateWorkletLoaded()) {
      const placeholder = new PassthroughEffect(this.ctx);
      this.effects.set(ins.id, { instance: placeholder, type: ins.type });
      this.deps.ensureNoiseGateWorklet().then(() => {
        if (!this.effects.has(ins.id)) return; // removed while loading
        placeholder.dispose();
        const real = createEffectNode(this.ctx, ins.type);
        this.effects.set(ins.id, { instance: real, type: ins.type });
        const current = this.lastInserts.find((i) => i.id === ins.id);
        if (current) real.setParams(current.params);
        this.rewire(this.lastInserts);
      });
      return;
    }
    this.effects.set(ins.id, { instance: createEffectNode(this.ctx, ins.type), type: ins.type });
  }

  private rewire(inserts: EffectInstance[]): void {
    this.input.disconnect();
    for (const [, entry] of this.effects) entry.instance.outputNode.disconnect();

    let node: AudioNode = this.input;
    for (const ins of inserts) {
      if (ins.bypassed) continue;
      const entry = this.effects.get(ins.id);
      if (!entry) continue; // still pending (e.g. worklet loading)
      node.connect(entry.instance.inputNode);
      node = entry.instance.outputNode;
    }
    node.connect(this.output);
  }

  dispose(): void {
    for (const [, entry] of this.effects) entry.instance.dispose();
    this.effects.clear();
    this.input.disconnect();
    this.output.disconnect();
  }
}
