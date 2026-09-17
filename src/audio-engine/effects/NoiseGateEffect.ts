import type { Effect } from "./Effect";
import type { NoiseGateParams } from "@/types/effects";

/**
 * Wraps the noise-gate-processor AudioWorklet. The worklet module must
 * already be loaded on `ctx` (see AudioEngine.ensureWorkletsLoaded) before
 * this is constructed.
 */
export class NoiseGateEffect implements Effect<NoiseGateParams> {
  private node: AudioWorkletNode;
  /** Sits inline in front of the worklet (input -> analyser -> worklet), not
   * a side-tap on the track/master bus - an AnalyserNode passes audio
   * through unchanged, so this gets the real signal arriving at THIS gate
   * instance, pre-gating. A post-chain analyser (getTrackAnalyser) would be
   * wrong here: once the gate closes it'd show near-silence regardless of
   * what's actually hitting the threshold. */
  private inputAnalyser: AnalyserNode;
  private lastEnvelope = 0;

  constructor(ctx: BaseAudioContext) {
    this.node = new AudioWorkletNode(ctx, "noise-gate-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
    });
    this.inputAnalyser = ctx.createAnalyser();
    this.inputAnalyser.fftSize = 1024;
    this.inputAnalyser.connect(this.node);
    this.node.port.onmessage = (ev: MessageEvent<number>) => {
      this.lastEnvelope = ev.data;
    };
  }

  get inputNode(): AudioNode {
    return this.inputAnalyser;
  }
  get outputNode(): AudioNode {
    return this.node;
  }

  getInputAnalyser(): AnalyserNode {
    return this.inputAnalyser;
  }

  /** Real gate gain (0 = closed..1 = open) as last reported by the
   * worklet's own envelope follower over its message port (~20 Hz) - not
   * approximated on the main thread. */
  getEnvelope(): number {
    return this.lastEnvelope;
  }

  setParams(params: NoiseGateParams): void {
    const t = this.node.context.currentTime;
    const set = (name: string, value: number) => {
      const param = this.node.parameters.get(name);
      param?.setTargetAtTime(value, t, 0.01);
    };
    set("thresholdDb", params.thresholdDb);
    set("attackMs", params.attackMs);
    set("releaseMs", params.releaseMs);
    set("holdMs", params.holdMs);
  }

  dispose(): void {
    this.node.disconnect();
    this.node.port.close();
  }
}
