/**
 * Our own compressor/limiter (public/worklets/dynamics-processor.js), used
 * instead of DynamicsCompressorNode - see the worklet's header for why
 * (the native node steps its level ~1.4 dB every 3 ms while a threshold,
 * ratio or knee knob moves, and hides an automatic makeup gain).
 */

export const DYNAMICS_WORKLET_URL = `/worklets/dynamics-processor.js?v=${process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"}`;

/** Look-ahead of the limiter mode: the audio comes out this late. */
export const LIMITER_LOOKAHEAD_MS = 5;

export function limiterLatencySec(sampleRate: number): number {
  return Math.max(1, Math.round((LIMITER_LOOKAHEAD_MS / 1000) * sampleRate)) / sampleRate;
}

export interface DynamicsSettings {
  thresholdDb?: number;
  ratio?: number;
  kneeDb?: number;
  attackSec?: number;
  releaseSec?: number;
  makeupDb?: number;
  driveDb?: number;
  ceilingDb?: number;
}

const PARAM_OF: Record<keyof DynamicsSettings, string> = {
  thresholdDb: "threshold",
  ratio: "ratio",
  kneeDb: "knee",
  attackSec: "attack",
  releaseSec: "release",
  makeupDb: "makeup",
  driveDb: "drive",
  ceilingDb: "ceiling",
};

export class DynamicsNode {
  readonly node: AudioWorkletNode;
  private reductionDb = 0;

  constructor(ctx: BaseAudioContext, mode: "comp" | "limit") {
    this.node = new AudioWorkletNode(ctx, "dynamics-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      processorOptions: { mode, lookaheadMs: LIMITER_LOOKAHEAD_MS },
    });
    this.node.port.onmessage = (e: MessageEvent<number>) => {
      if (typeof e.data === "number") this.reductionDb = e.data;
    };
  }

  /** The worklet glides every value per sample, so a plain write is
   * click-free (and lands at once in an offline render). */
  set(settings: DynamicsSettings): void {
    for (const [key, value] of Object.entries(settings) as [keyof DynamicsSettings, number | undefined][]) {
      if (value === undefined || !Number.isFinite(value)) continue;
      const param = this.node.parameters.get(PARAM_OF[key]);
      if (param && param.value !== value) param.value = value;
    }
  }

  /** Most gain reduction over the last ~50 ms, dB (<= 0). */
  getReductionDb(): number {
    return this.reductionDb;
  }

  disconnect(): void {
    this.node.disconnect();
    this.node.port.onmessage = null;
    this.node.port.close();
  }
}

/** The master's output protection: no drive, ceiling -0.3 dBFS, quick
 * release. Inaudible until a peak would pass 0 dBFS. */
export function createOutputGuard(ctx: BaseAudioContext): DynamicsNode {
  const guard = new DynamicsNode(ctx, "limit");
  guard.set({ driveDb: 0, ceilingDb: -0.3, attackSec: LIMITER_LOOKAHEAD_MS / 1000 / 4, releaseSec: 0.08 });
  return guard;
}
