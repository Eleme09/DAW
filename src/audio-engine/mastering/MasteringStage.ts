import type { MasteringSettings } from "@/types/project";
import { masteringChain } from "@/lib/mastering/masterChain";
import { EffectChain, type EffectChainDeps } from "../effects/EffectChain";

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * The master's mastering stage (lib/mastering): input gain -> the style's
 * chain. Sits after the master inserts and before the master fader, live
 * (AudioEngine) and on export (bounce), so what you hear is what you get.
 * Off = an empty chain at unity gain. "Compare" plays the mix without
 * mastering at the master's loudness (measured), so the A/B is about tone
 * and density, not "louder sounds better".
 */
export class MasteringStage {
  readonly input: GainNode;
  readonly output: AudioNode;
  private chain: EffectChain;
  private ctx: BaseAudioContext;
  private settings: MasteringSettings | undefined;
  private comparing = false;

  constructor(ctx: BaseAudioContext, deps: EffectChainDeps) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.chain = new EffectChain(ctx, deps);
    this.input.connect(this.chain.inputNode);
    this.output = this.chain.outputNode;
  }

  set(settings: MasteringSettings | undefined): void {
    this.settings = settings;
    this.apply();
  }

  /** A/B: true = the mix without mastering, matched to the master's loudness. */
  setCompare(on: boolean): void {
    this.comparing = on;
    this.apply();
  }

  private apply(): void {
    const s = this.settings;
    const on = !!s?.enabled;
    let gainDb = 0;
    if (on && s) {
      if (this.comparing) gainDb = s.measured ? s.measured.masterLufs - s.measured.mixLufs : 0;
      else gainDb = s.inputGainDb;
    }
    this.chain.setInserts(on && s && !this.comparing ? masteringChain(s) : []);
    const g = this.input.gain;
    if (typeof AudioContext !== "undefined" && this.ctx instanceof AudioContext) {
      const t = this.ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setTargetAtTime(dbToGain(gainDb), t, 0.02);
    } else {
      g.value = dbToGain(gainDb);
    }
  }

  tick(): void {
    this.chain.tick();
  }

  dispose(): void {
    this.input.disconnect();
    this.chain.dispose();
  }
}
