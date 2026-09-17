/**
 * Renders a single buffer through a chain of inserts offline - the same
 * EffectChain class the live engine and bounce.ts use, just fed one buffer
 * instead of a whole project. Backs VozPanel's "Antes/Después" A/B preview:
 * it needs to compare the SAME take with and without the track's actual
 * current chain, not a guess or a dry-signal-only approximation.
 */
import { EffectChain, type EffectChainDeps } from "./effects/EffectChain";
import type { EffectInstance } from "@/types/effects";

const NOISE_GATE_WORKLET_URL = "/worklets/noise-gate-processor.js";
const PITCH_CORRECTION_WORKLET_URL = "/worklets/realtime-pitch-processor.js";

export async function renderBufferThroughChain(buffer: AudioBuffer, inserts: EffectInstance[]): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);

  if (inserts.some((i) => i.type === "noiseGate")) {
    await ctx.audioWorklet.addModule(NOISE_GATE_WORKLET_URL);
  }
  if (inserts.some((i) => i.type === "pitchCorrection")) {
    await ctx.audioWorklet.addModule(PITCH_CORRECTION_WORKLET_URL);
  }
  const deps: EffectChainDeps = {
    isNoiseGateWorkletLoaded: () => true,
    ensureNoiseGateWorklet: () => Promise.resolve(),
    isPitchCorrectionWorkletLoaded: () => true,
    ensurePitchCorrectionWorklet: () => Promise.resolve(),
  };

  const chain = new EffectChain(ctx, deps);
  chain.setInserts(inserts);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(chain.inputNode);
  chain.outputNode.connect(ctx.destination);
  source.start();

  return ctx.startRendering();
}
