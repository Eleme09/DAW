import type { Effect } from "./Effect";
import type { NoiseGateParams } from "@/types/effects";

/**
 * Wraps the noise-gate-processor AudioWorklet. The worklet module must
 * already be loaded on `ctx` (see AudioEngine.ensureWorkletsLoaded) before
 * this is constructed.
 */
export class NoiseGateEffect implements Effect<NoiseGateParams> {
  private node: AudioWorkletNode;

  constructor(ctx: BaseAudioContext) {
    this.node = new AudioWorkletNode(ctx, "noise-gate-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
    });
  }

  get inputNode(): AudioNode {
    return this.node;
  }
  get outputNode(): AudioNode {
    return this.node;
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
